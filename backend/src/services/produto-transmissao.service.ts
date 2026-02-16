// backend/src/services/produto-transmissao.service.ts
import { createHash } from 'crypto';
import {
  AsyncJobStatus,
  AsyncJobTipo,
  Prisma,
  ProdutoTransmissaoItemStatus,
  ProdutoTransmissaoModalidade,
  ProdutoTransmissaoStatus,
} from '@prisma/client';
import { ProdutoExportacaoService } from './produto-exportacao.service';
import { SiscomexService, SiscomexErroDetalhado } from './siscomex.service';
import { ProdutoService } from './produto.service';
import { CertificadoService } from './certificado.service';
import { CatalogoService } from './catalogo.service';
import { catalogoPrisma } from '../utils/prisma';
import { ValidationError } from '../types/validation-error';
import { createAsyncJob, registerJobLog } from '../jobs/async-job.repository';
import { storageFactory } from './storage.factory';
import { logger } from '../utils/logger';
import { STATUS_TRANSMISSAO_EXECUCAO } from '../constants/transmissao-status';

interface FalhaTransmissao {
  produtoId: number;
  motivo: string;
}

interface OpcaoSolicitarTransmissao {
  forcarAtualizacaoVersao?: boolean;
}

interface SiscomexClientCacheItem {
  cliente: SiscomexService;
  certificadoHash: string;
  verificarCertificadoEm: number;
}

const UM_DIA_EM_MS = 24 * 60 * 60 * 1000;
const SISCOMEX_CLIENTE_CACHE_TTL_PADRAO_MS = 60000;

export class ProdutoTransmissaoService {
  private readonly siscomexClients = new Map<number, SiscomexClientCacheItem>();
  private readonly siscomexClientCacheTtlMs = this.resolverCacheTtlMs(process.env.SISCOMEX_CLIENT_CACHE_TTL_MS);

  constructor(
    private readonly exportacaoService = new ProdutoExportacaoService(),
    private readonly produtoService = new ProdutoService(),
    private readonly certificadoService = new CertificadoService(),
    private readonly catalogoService = new CatalogoService()
  ) {}

  async solicitarTransmissao(
    ids: number[],
    catalogoId: number,
    superUserId: number,
    usuarioCatalogoId?: number | null,
    opcoes: OpcaoSolicitarTransmissao = {}
  ) {
    if (!Number.isFinite(catalogoId)) {
      throw new ValidationError({ catalogoId: 'Catálogo selecionado é obrigatório para transmitir ao SISCOMEX' });
    }

    if (!Array.isArray(ids) || ids.length === 0) {
      throw new ValidationError({ produtos: 'Nenhum produto selecionado para transmissão' });
    }

    if (ids.length > 100) {
      throw new ValidationError({ produtos: 'A transmissão permite até 100 produtos por vez' });
    }

    if (opcoes.forcarAtualizacaoVersao && ids.length !== 1) {
      throw new ValidationError({
        produtos: 'A atualização de versão deve ser enviada individualmente, um produto por vez.',
      });
    }

    const catalogo = await this.catalogoService.buscarPorId(catalogoId, superUserId);

    if (!catalogo) {
      throw new ValidationError({ catalogoId: 'Catálogo selecionado não encontrado para transmissão' });
    }

    const cpfCnpjRaiz = this.extrairCpfCnpjRaiz(catalogo.cpf_cnpj);

    if (!cpfCnpjRaiz) {
      throw new ValidationError({ catalogoId: 'Catálogo selecionado está sem CNPJ válido para transmissão ao SISCOMEX' });
    }

    const transmissaoAtiva = await catalogoPrisma.produtoTransmissao.findFirst({
      where: {
        catalogoId,
        status: { in: STATUS_TRANSMISSAO_EXECUCAO },
      },
    });

    if (transmissaoAtiva) {
      throw new ValidationError({
        catalogoId: 'Já existe uma transmissão em andamento para o catálogo selecionado. Aguarde a conclusão.',
      });
    }

    const produtos = await this.exportacaoService.buscarProdutosComAtributos(ids, superUserId, catalogoId);

    if (produtos.length === 0) {
      throw new ValidationError({ produtos: 'Nenhum produto encontrado para transmissão' });
    }

    const idsEncontrados = new Set(produtos.map(produto => produto.id));
    const idsForaCatalogo = ids.filter(id => !idsEncontrados.has(id));

    if (idsForaCatalogo.length > 0) {
      throw new ValidationError({
        produtos: 'Todos os produtos selecionados precisam pertencer ao catálogo informado para transmissão.',
      });
    }

    if (!opcoes.forcarAtualizacaoVersao) {
      const idsAtivados = produtos
        .filter(produto => String(produto.situacao || '').toUpperCase() === 'ATIVADO')
        .map(produto => produto.id);

      if (idsAtivados.length > 0) {
        throw new ValidationError({
          produtos:
            'Produtos com situação ATIVADO exigem transmissão individual para gerar nova versão.',
        });
      }
    }

    const resultado = await catalogoPrisma.$transaction(async tx => {
      const transmissao = await tx.produtoTransmissao.create({
        data: {
          superUserId,
          catalogoId,
          usuarioCatalogoId: usuarioCatalogoId ?? null,
          modalidade: ProdutoTransmissaoModalidade.PRODUTOS,
          status: ProdutoTransmissaoStatus.EM_FILA,
          totalItens: ids.length,
          selecaoJson: ids as Prisma.InputJsonValue,
        },
      });

      await tx.produtoTransmissaoItem.createMany({
        data: ids.map(produtoId => ({
          transmissaoId: transmissao.id,
          produtoId,
          status: ProdutoTransmissaoItemStatus.PENDENTE,
        })),
      });

      const job = await createAsyncJob(
        {
          tipo: AsyncJobTipo.TRANSMISSAO_PRODUTO,
          payload: {
            transmissaoId: transmissao.id,
            superUserId,
          },
        },
        tx
      );

      await tx.produtoTransmissao.update({
        where: { id: transmissao.id },
        data: { asyncJobId: job.id },
      });

      return { transmissaoId: transmissao.id, jobId: job.id };
    });

    return resultado;
  }

  async listar(superUserId: number) {
    const transmissoes = await catalogoPrisma.produtoTransmissao.findMany({
      where: { superUserId },
      include: {
        catalogo: { select: { id: true, nome: true, numero: true } },
      },
      orderBy: { criadoEm: 'desc' },
    });

    return Promise.all(transmissoes.map(t => this.mapearTransmissaoParaResposta(t)));
  }

  async detalhar(id: number, superUserId: number) {
    const transmissao = await catalogoPrisma.produtoTransmissao.findFirst({
      where: { id, superUserId },
      include: {
        catalogo: { select: { id: true, nome: true, numero: true } },
        itens: {
          include: {
            produto: { select: { id: true, codigo: true, denominacao: true } },
          },
          orderBy: { id: 'asc' },
        },
      },
    });

    if (!transmissao) {
      return null;
    }

    const resposta = await this.mapearTransmissaoParaResposta(transmissao);
    return { ...resposta, itens: transmissao.itens };
  }

  async gerarLinkArquivo(transmissaoId: number, tipo: 'envio' | 'retorno', superUserId: number) {
    const transmissao = await catalogoPrisma.produtoTransmissao.findFirst({
      where: { id: transmissaoId, superUserId },
    });

    if (!transmissao) {
      throw new ValidationError({ transmissaoId: 'Transmissão não encontrada.' });
    }

    const provider = storageFactory();
    const caminho = tipo === 'envio' ? transmissao.payloadEnvioPath : transmissao.payloadRetornoPath;
    const expiraEm = tipo === 'envio' ? transmissao.payloadEnvioExpiraEm : transmissao.payloadRetornoExpiraEm;

    if (!caminho) {
      throw new ValidationError({ arquivo: 'O arquivo solicitado ainda não foi gerado.' });
    }

    if (expiraEm && expiraEm.getTime() < Date.now()) {
      throw new ValidationError({ arquivo: 'O arquivo expirou. Refaça a transmissão para gerar um novo payload.' });
    }

    const nome = tipo === 'envio' ? `payload-envio-${transmissaoId}.json` : `payload-retorno-${transmissaoId}.json`;

    if (typeof provider.getSignedUrl === 'function') {
      const segundosRestantes = expiraEm ? Math.max(60, Math.floor((expiraEm.getTime() - Date.now()) / 1000)) : 3600;
      const url = await provider.getSignedUrl(caminho, segundosRestantes, { filename: nome });
      return { nome, url, expiraEm: expiraEm?.toISOString() ?? null };
    }

    const arquivo = await provider.get(caminho);
    return { nome, buffer: arquivo };
  }

  async processarTransmissaoJob(
    transmissaoId: number,
    superUserId: number,
    heartbeat: () => Promise<void>,
    jobId?: number
  ) {
    const transmissao = await catalogoPrisma.produtoTransmissao.findUnique({
      where: { id: transmissaoId },
      include: {
        catalogo: true,
        itens: true,
      },
    });

    if (!transmissao || transmissao.superUserId !== superUserId) {
      throw new Error('Transmissão não encontrada para o superusuário informado.');
    }

    const ids = this.converterSelecaoParaIds(transmissao.selecaoJson);

    if (!ids.length) {
      await this.marcarComoFalha(transmissao.id, 'Nenhum produto encontrado para enviar.', jobId);
      return;
    }

    const cpfCnpjRaiz = this.extrairCpfCnpjRaiz(transmissao.catalogo.cpf_cnpj);

    if (!cpfCnpjRaiz) {
      await this.marcarComoFalha(transmissao.id, 'Catálogo sem CNPJ válido para transmissão.', jobId);
      return;
    }

    await catalogoPrisma.produtoTransmissao.update({
      where: { id: transmissao.id },
      data: { status: ProdutoTransmissaoStatus.PROCESSANDO, iniciadoEm: new Date() },
    });

    if (jobId) {
      await registerJobLog(jobId, AsyncJobStatus.PROCESSANDO, 'Gerando payload de transmissão.');
    }
    await heartbeat();

    const produtos = await this.exportacaoService.buscarProdutosComAtributos(ids, transmissao.superUserId, transmissao.catalogoId);
    const produtosExportados = this.exportacaoService.transformarParaSiscomex(produtos, {
      id: transmissao.catalogo.id,
      cpf_cnpj: transmissao.catalogo.cpf_cnpj ?? null,
    });

    const itensTransmissao = produtosExportados.map(produtoExportado => {
      const { catalogoId: catalogoId, ...payloadBase } = produtoExportado;
      const possuiCodigoLocal = Boolean((produtoExportado as any).codigo);
      const situacaoLocal = String((produtoExportado as any).situacao || '').toUpperCase();
      const deveAtualizarVersao = possuiCodigoLocal && situacaoLocal === 'ATIVADO';

      const payloadInclusao = { ...(payloadBase as Record<string, any>) };

      const payloadAtualizacaoVersao = { ...(payloadBase as Record<string, any>) };
      delete payloadAtualizacaoVersao.seq;
      delete payloadAtualizacaoVersao.codigo;
      delete payloadAtualizacaoVersao.versao;
      delete payloadAtualizacaoVersao.cpfCnpjRaiz;
      delete payloadAtualizacaoVersao.situacao;

      return {
        produtoId: Number(produtoExportado.seq),
        codigo: (produtoExportado as any).codigo as string | null | undefined,
        deveAtualizarVersao,
        payloadInclusao,
        payloadAtualizacaoVersao,
      };
    });

    const payloadEnvioRegistrado = itensTransmissao.length === 1
      ? itensTransmissao[0].deveAtualizarVersao
        ? itensTransmissao[0].payloadAtualizacaoVersao
        : [itensTransmissao[0].payloadInclusao]
      : itensTransmissao.map(item =>
          item.deveAtualizarVersao ? item.payloadAtualizacaoVersao : item.payloadInclusao
        );

    const provider = storageFactory();
    const caminhoEnvio = `${transmissao.superUserId}/transmissoes/${transmissao.id}/payload-envio.json`;
    const payloadEnvioBuffer = Buffer.from(JSON.stringify(payloadEnvioRegistrado, null, 2), 'utf8');
    await provider.upload(payloadEnvioBuffer, caminhoEnvio);

    const expiraEm = new Date(Date.now() + UM_DIA_EM_MS);
    const storageProvider = provider.getSignedUrl ? 's3' : 'local';

    await catalogoPrisma.produtoTransmissao.update({
      where: { id: transmissao.id },
      data: {
        payloadEnvioPath: caminhoEnvio,
        payloadEnvioExpiraEm: expiraEm,
        payloadEnvioTamanho: payloadEnvioBuffer.byteLength,
        payloadEnvioProvider: storageProvider,
      },
    });

    if (jobId) {
      await registerJobLog(
        jobId,
        AsyncJobStatus.PROCESSANDO,
        'Payload de envio armazenado. Iniciando comunicação com SISCOMEX.'
      );
    }
    await heartbeat();

    const cliente = await this.obterClienteSiscomex(
      transmissao.catalogoId,
      transmissao.superUserId,
      this.siscomexClients
    );

    const respostas: any[] = [];
    const sucessos: Array<{ produtoId: number; codigo?: string; versao?: number; situacao?: string | null }> = [];
    const falhas: FalhaTransmissao[] = [];

    for (const itemTransmissao of itensTransmissao) {
      const produtoId = itemTransmissao.produtoId;
      const possuiCodigoLocal = Boolean(itemTransmissao.codigo);
      const deveAtualizarVersao = itemTransmissao.deveAtualizarVersao;

      let resposta: any;
      try {
        if (deveAtualizarVersao) {
          resposta = await cliente.atualizarProduto(
            cpfCnpjRaiz,
            String(itemTransmissao.codigo),
            itemTransmissao.payloadAtualizacaoVersao as any
          );
        } else {
          resposta = await cliente.incluirProduto(cpfCnpjRaiz, itemTransmissao.payloadInclusao as any);
        }
        respostas.push(resposta);
      } catch (error: unknown) {
        logger.error('Falha ao transmitir produto ao SISCOMEX', {
          produtoId,
          operacao: deveAtualizarVersao ? 'atualizar-versao' : 'incluir',
          erro: error,
        });

        const motivo = error instanceof Error ? error.message : 'Erro desconhecido ao transmitir produto ao SISCOMEX';
        const detalhesSiscomex = (error as Error & { siscomexDetalhes?: SiscomexErroDetalhado })?.siscomexDetalhes;
        respostas.push({
          sucesso: false,
          mensagem: motivo,
          detalhes: detalhesSiscomex ?? null,
        });
        falhas.push({ produtoId, motivo });
        continue;
      }

      if (!Number.isFinite(produtoId)) {
        falhas.push({ produtoId, motivo: 'Identificador do produto inválido para transmissão' });
        continue;
      }

      if (!resposta) {
        falhas.push({ produtoId, motivo: 'Retorno do SISCOMEX não trouxe resposta para o produto' });
        continue;
      }

      try {
        const temErrosResposta = Array.isArray(resposta.erros)
          ? resposta.erros.length > 0
          : Boolean(resposta.erros);

        if (resposta.sucesso === false || temErrosResposta) {
          falhas.push({
            produtoId,
            motivo: this.extrairMotivoSiscomex(resposta),
          });
          continue;
        }

        logger.info('Transmitindo produto ao SISCOMEX', {
          produtoId,
          catalogoId: transmissao.catalogoId,
          cpfCnpjRaiz,
          possuiCodigoLocal,
        });

        const situacaoNormalizada = String((resposta?.situacao ?? '')).toUpperCase();
        const situacaoProduto: 'RASCUNHO' | 'ATIVADO' | 'DESATIVADO' =
          situacaoNormalizada === 'DESATIVADO'
            ? 'DESATIVADO'
            : situacaoNormalizada === 'RASCUNHO'
              ? 'RASCUNHO'
              : 'ATIVADO';
        const versaoNumero =
          typeof resposta.versao === 'string' ? Number(resposta.versao) : (resposta.versao as number);

        if (!Number.isFinite(versaoNumero)) {
          falhas.push({
            produtoId,
            motivo: this.extrairMotivoSiscomex(resposta),
          });
          continue;
        }

        await this.produtoService.marcarComoTransmitido(produtoId, transmissao.superUserId, {
          codigo: resposta.codigo,
          versao: versaoNumero,
          situacao: situacaoProduto,
        });

        sucessos.push({
          produtoId,
          codigo: resposta.codigo,
          versao: versaoNumero,
          situacao: situacaoProduto,
        });
      } catch (error: unknown) {
        logger.error('Falha ao transmitir produto ao SISCOMEX', {
          produtoId,
          erro: error,
        });

        falhas.push({
          produtoId,
          motivo: error instanceof Error ? error.message : 'Erro desconhecido ao transmitir produto',
        });
      }
    }

    await this.finalizarTransmissao(transmissao.id, { falhas, sucessos, respostas });
    await heartbeat();
  }

  private extrairMotivoSiscomex(resposta: any) {
    if (Array.isArray(resposta?.erros) && resposta.erros.length > 0) {
      return resposta.erros.map((erro: unknown) => String(erro)).join('; ');
    }

    if (resposta?.erros) {
      return String(resposta.erros);
    }

    if (resposta?.mensagem) {
      return String(resposta.mensagem);
    }

    return 'Versão inválida retornada pelo SISCOMEX';
  }

  private async finalizarTransmissao(
    transmissaoId: number,
    dados: {
      falhas: FalhaTransmissao[];
      sucessos: Array<{ produtoId: number; codigo?: string; versao?: number; situacao?: string | null }>;
      respostas: any;
      statusFinal?: ProdutoTransmissaoStatus;
    }
  ) {
    const provider = storageFactory();

    const bufferRetorno = Buffer.from(JSON.stringify(dados.respostas ?? [], null, 2), 'utf8');
    const caminhoCompleto = `${await this.resolverDiretorioTransmissao(transmissaoId)}/payload-retorno.json`;
    await provider.upload(bufferRetorno, caminhoCompleto);

    const expiraEm = new Date(Date.now() + UM_DIA_EM_MS);
    const storageProvider = provider.getSignedUrl ? 's3' : 'local';

    const statusFinal = dados.statusFinal
      ? dados.statusFinal
      : dados.falhas.length === 0
        ? ProdutoTransmissaoStatus.CONCLUIDO
        : dados.sucessos.length === 0
          ? ProdutoTransmissaoStatus.FALHO
          : ProdutoTransmissaoStatus.PARCIAL;

    await catalogoPrisma.$transaction(async tx => {
      await tx.produtoTransmissaoItem.updateMany({
        where: { transmissaoId },
        data: { status: ProdutoTransmissaoItemStatus.ERRO, mensagem: 'Falha geral na transmissão' },
      });

      for (const sucesso of dados.sucessos) {
        await tx.produtoTransmissaoItem.updateMany({
          where: { transmissaoId, produtoId: sucesso.produtoId },
          data: {
            status: ProdutoTransmissaoItemStatus.SUCESSO,
            retornoCodigo: sucesso.codigo ?? null,
            retornoVersao: sucesso.versao ?? null,
            retornoSituacao: sucesso.situacao ?? null,
            mensagem: null,
          },
        });
      }

      for (const falha of dados.falhas) {
        await tx.produtoTransmissaoItem.updateMany({
          where: { transmissaoId, produtoId: falha.produtoId },
          data: {
            status: ProdutoTransmissaoItemStatus.ERRO,
            mensagem: falha.motivo,
          },
        });
      }

      await tx.produtoTransmissao.update({
        where: { id: transmissaoId },
        data: {
          status: statusFinal,
          totalSucesso: dados.sucessos.length,
          totalErro: dados.falhas.length,
          concluidoEm: new Date(),
          payloadRetornoPath: caminhoCompleto,
          payloadRetornoExpiraEm: expiraEm,
          payloadRetornoTamanho: bufferRetorno.byteLength,
          payloadRetornoProvider: storageProvider,
        },
      });
    });
  }

  private async marcarComoFalha(transmissaoId: number, motivo: string, jobId?: number) {
    const transmissao = await catalogoPrisma.produtoTransmissao.findUnique({
      where: { id: transmissaoId },
      select: { totalItens: true },
    });

    await catalogoPrisma.$transaction(async tx => {
      await tx.produtoTransmissaoItem.updateMany({
        where: { transmissaoId },
        data: { status: ProdutoTransmissaoItemStatus.ERRO, mensagem: motivo },
      });

      await tx.produtoTransmissao.update({
        where: { id: transmissaoId },
        data: {
          status: ProdutoTransmissaoStatus.FALHO,
          totalErro: transmissao?.totalItens ?? 0,
          concluidoEm: new Date(),
        },
      });
    });

    if (jobId) {
      await registerJobLog(jobId, AsyncJobStatus.FALHO, motivo);
    }
  }

  private async mapearTransmissaoParaResposta(transmissao: any) {
    const provider = storageFactory();

    const gerarUrlAssinada = async (path?: string | null, nome?: string | null, expira?: Date | null) => {
      if (!path) return null;
      if (typeof provider.getSignedUrl !== 'function') return null;
      const segundosRestantes = expira ? Math.max(60, Math.floor((expira.getTime() - Date.now()) / 1000)) : 3600;
      return provider.getSignedUrl(path, segundosRestantes, { filename: nome ?? undefined });
    };

    const payloadEnvioUrl = transmissao.payloadEnvioPath
      ?
          (await gerarUrlAssinada(
            transmissao.payloadEnvioPath,
            `payload-envio-${transmissao.id}.json`,
            transmissao.payloadEnvioExpiraEm
          )) ?? `/api/siscomex/transmissoes/${transmissao.id}/arquivos/envio`
      : null;

    const payloadRetornoUrl = transmissao.payloadRetornoPath
      ?
          (await gerarUrlAssinada(
            transmissao.payloadRetornoPath,
            `payload-retorno-${transmissao.id}.json`,
            transmissao.payloadRetornoExpiraEm
          )) ?? `/api/siscomex/transmissoes/${transmissao.id}/arquivos/retorno`
      : null;

    return {
      id: transmissao.id,
      catalogo: transmissao.catalogo,
      status: transmissao.status,
      modalidade: transmissao.modalidade,
      totalItens: transmissao.totalItens,
      totalSucesso: transmissao.totalSucesso,
      totalErro: transmissao.totalErro,
      iniciadoEm: transmissao.iniciadoEm,
      concluidoEm: transmissao.concluidoEm,
      criadoEm: transmissao.criadoEm,
      payloadEnvioUrl,
      payloadRetornoUrl,
    };
  }

  private async obterClienteSiscomex(
    catalogoId: number,
    superUserId: number,
    cache: Map<number, SiscomexClientCacheItem>
  ): Promise<SiscomexService> {
    const agora = Date.now();
    const existente = cache.get(catalogoId);

    if (existente && existente.verificarCertificadoEm > agora) {
      return existente.cliente;
    }

    logger.info('Recuperando certificado PFX vinculado ao catálogo para transmissão SISCOMEX', { catalogoId });
    const certificado = await this.certificadoService.obterParaCatalogo(catalogoId, superUserId);
    const certificadoHash = this.calcularHashCertificado(certificado.pfx);

    if (existente && existente.certificadoHash === certificadoHash) {
      cache.set(catalogoId, {
        ...existente,
        verificarCertificadoEm: agora + this.siscomexClientCacheTtlMs,
      });

      logger.info('Cliente SISCOMEX mantido em cache após validação de certificado', {
        catalogoId,
        ttlMs: this.siscomexClientCacheTtlMs,
      });
      return existente.cliente;
    }

    logger.info('Certificado obtido do storage para SISCOMEX', {
      catalogoId,
      origem: certificado.origem,
      tamanhoBytes: certificado.pfx.byteLength,
      possuiPassphrase: Boolean(certificado.passphrase)
    });
    const cliente = new SiscomexService({ certificado });

    cache.set(catalogoId, {
      cliente,
      certificadoHash,
      verificarCertificadoEm: agora + this.siscomexClientCacheTtlMs,
    });

    logger.info('Cliente SISCOMEX armazenado/atualizado no cache', {
      catalogoId,
      ttlMs: this.siscomexClientCacheTtlMs,
      cacheAtualizado: Boolean(existente),
    });

    return cliente;
  }

  private resolverCacheTtlMs(valor?: string) {
    if (!valor) {
      return SISCOMEX_CLIENTE_CACHE_TTL_PADRAO_MS;
    }

    const ttl = Number(valor);
    if (!Number.isFinite(ttl) || ttl <= 0) {
      return SISCOMEX_CLIENTE_CACHE_TTL_PADRAO_MS;
    }

    return ttl;
  }

  private calcularHashCertificado(pfx: Buffer) {
    return createHash('sha256').update(pfx).digest('hex');
  }

  private extrairCpfCnpjRaiz(cpfCnpj?: string | null) {
    if (!cpfCnpj) {
      return null;
    }

    const somenteDigitos = cpfCnpj.replace(/\D/g, '');

    if (somenteDigitos.length <= 11) {
      return somenteDigitos;
    }

    return somenteDigitos.slice(0, 8);
  }

  private converterSelecaoParaIds(selecaoJson: Prisma.JsonValue | null): number[] {
    if (!selecaoJson) {
      return [];
    }

    if (Array.isArray(selecaoJson)) {
      return selecaoJson
        .map(valor => Number(valor))
        .filter(Number.isFinite);
    }

    return [];
  }

  private async resolverDiretorioTransmissao(transmissaoId: number) {
    const transmissao = await catalogoPrisma.produtoTransmissao.findUnique({
      where: { id: transmissaoId },
      select: { superUserId: true },
    });

    return `${transmissao?.superUserId ?? 'desconhecido'}/transmissoes/${transmissaoId}`;
  }
}
