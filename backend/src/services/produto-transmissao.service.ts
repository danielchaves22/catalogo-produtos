import { createHash } from 'crypto';
import {
  AsyncJobStatus,
  AsyncJobTipo,
  Prisma,
  ProdutoTransmissaoItemOperacao,
  ProdutoTransmissaoOrigemTipo,
  ProdutoTransmissaoItemStatus,
  ProdutoTransmissaoModalidade,
  ProdutoTransmissaoStatus,
} from '@prisma/client';
import { ProdutoExportacaoService } from './produto-exportacao.service';
import { SiscomexErroDetalhado, SiscomexService } from './siscomex.service';
import { ProdutoService } from './produto.service';
import { CertificadoService } from './certificado.service';
import { CatalogoService } from './catalogo.service';
import { catalogoPrisma } from '../utils/prisma';
import { ValidationError } from '../types/validation-error';
import { createAsyncJob, registerJobLog } from '../jobs/async-job.repository';
import { storageFactory } from './storage.factory';
import { logger } from '../utils/logger';
import { STATUS_TRANSMISSAO_EXECUCAO } from '../constants/transmissao-status';

interface OpcaoSolicitarTransmissao {
  forcarAtualizacaoVersao?: boolean;
}

interface SiscomexClientCacheItem {
  cliente: SiscomexService;
  certificadoHash: string;
  verificarCertificadoEm: number;
}

interface PlanejamentoItemTransmissao {
  itemId: number;
  produtoId: number;
  operacao: ProdutoTransmissaoItemOperacao;
  codigo: string | null;
  endpoint: string;
  payload: Record<string, any>;
}

interface ItemPreparadoTransmissao {
  produtoId: number;
  operacao: ProdutoTransmissaoItemOperacao;
}

interface PreparacaoTransmissaoValidada {
  catalogoId: number;
  cpfCnpjRaiz: string;
  idsSelecionados: number[];
  itens: ItemPreparadoTransmissao[];
}

interface OrigemTransmissaoAjusteEstruturaContexto {
  ncmCodigo?: string;
  modalidade?: string;
  catalogoId?: number;
  produtoIdsElegiveis?: number[];
  produtoIdsIgnoradosDuplicidade?: number[];
}

interface RetornoItemTransmissao {
  produtoId: number;
  operacao: ProdutoTransmissaoItemOperacao;
  status: 'SUCESSO' | 'ERRO';
  endpoint: string | null;
  mensagem: string | null;
  detalhes?: SiscomexErroDetalhado | null;
  retorno?: {
    codigo?: string | null;
    versao?: number | null;
    situacao?: string | null;
  };
}

type ResultadoExecucaoItem =
  | {
      tipo: 'sucesso';
      mensagem: null;
      retorno: RetornoItemTransmissao;
      codigoPersistencia: string | null;
      versao: number;
      situacao: 'RASCUNHO' | 'ATIVADO' | 'DESATIVADO';
    }
  | {
      tipo: 'erro' | 'interromper';
      mensagem: string;
      retorno: RetornoItemTransmissao;
    };

type ClassificacaoErroTransmissao = {
  aplicarCooldown: boolean;
  detalhes?: SiscomexErroDetalhado;
  interromperFila: boolean;
  mensagem: string;
  retryable: boolean;
};

const UM_DIA_EM_MS = 24 * 60 * 60 * 1000;
const SISCOMEX_CLIENTE_CACHE_TTL_PADRAO_MS = 60000;
const SISCOMEX_TRANSMISSAO_DELAY_PADRAO_MS = 750;
const SISCOMEX_TRANSMISSAO_RETRY_MAX_PADRAO = 3;
const SISCOMEX_TRANSMISSAO_BACKOFF_PADRAO_MS = 2000;
const SISCOMEX_TRANSMISSAO_COOLDOWN_PADRAO_MS = 60000;
const HEARTBEAT_WAIT_STEP_MS = 1000;

export class ProdutoTransmissaoService {
  private static cooldownGlobalAte = 0;

  private readonly siscomexClients = new Map<number, SiscomexClientCacheItem>();
  private readonly siscomexClientCacheTtlMs = this.resolverNumeroPositivo(
    process.env.SISCOMEX_CLIENT_CACHE_TTL_MS,
    SISCOMEX_CLIENTE_CACHE_TTL_PADRAO_MS
  );
  private readonly transmissaoDelayMs = this.resolverNumeroPositivo(
    process.env.SISCOMEX_TRANSMISSAO_DELAY_MS,
    SISCOMEX_TRANSMISSAO_DELAY_PADRAO_MS
  );
  private readonly transmissaoRetryMax = this.resolverNumeroNaoNegativo(
    process.env.SISCOMEX_TRANSMISSAO_RETRY_MAX,
    SISCOMEX_TRANSMISSAO_RETRY_MAX_PADRAO
  );
  private readonly transmissaoBackoffBaseMs = this.resolverNumeroPositivo(
    process.env.SISCOMEX_TRANSMISSAO_BACKOFF_BASE_MS,
    SISCOMEX_TRANSMISSAO_BACKOFF_PADRAO_MS
  );
  private readonly transmissaoCooldownMs = this.resolverNumeroPositivo(
    process.env.SISCOMEX_TRANSMISSAO_COOLDOWN_MS,
    SISCOMEX_TRANSMISSAO_COOLDOWN_PADRAO_MS
  );

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
    void opcoes.forcarAtualizacaoVersao;

    const { transmissaoId } = await this.prepararTransmissao(
      ids,
      catalogoId,
      superUserId,
      usuarioCatalogoId
    );

    return this.iniciarTransmissao(transmissaoId, superUserId);
    /*

    if (!Number.isFinite(catalogoId)) {
      throw new ValidationError({ catalogoId: 'Catálogo selecionado é obrigatório para transmitir ao SISCOMEX' });
    }

    const idsSelecionados = [...new Set(
      (Array.isArray(ids) ? ids : [])
        .map(id => Number(id))
        .filter(Number.isFinite)
    )];

    if (idsSelecionados.length === 0) {
      throw new ValidationError({ produtos: 'Nenhum produto selecionado para transmissão' });
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

    const produtos = await this.exportacaoService.buscarProdutosComAtributos(idsSelecionados, superUserId, catalogoId);

    if (produtos.length === 0) {
      throw new ValidationError({ produtos: 'Nenhum produto encontrado para transmissão' });
    }

    const produtosPorId = new Map(produtos.map(produto => [produto.id, produto]));
    const idsForaCatalogo = idsSelecionados.filter(id => !produtosPorId.has(id));

    if (idsForaCatalogo.length > 0) {
      throw new ValidationError({
        produtos: 'Todos os produtos selecionados precisam pertencer ao catálogo informado para transmissão.',
      });
    }

    const idsNaoAprovados: number[] = [];
    const idsSituacaoInvalida: number[] = [];
    const idsAtivadosSemCodigo: number[] = [];

    const itens = idsSelecionados.map(produtoId => {
      const produto = produtosPorId.get(produtoId)!;
      const status = String(produto.status || '').toUpperCase();
      const situacao = String(produto.situacao || '').toUpperCase();
      const codigoNormalizado = this.normalizarCodigoSiscomex(produto.codigo);

      if (status !== 'APROVADO') {
        idsNaoAprovados.push(produtoId);
      }

      if (situacao !== 'RASCUNHO' && situacao !== 'ATIVADO') {
        idsSituacaoInvalida.push(produtoId);
      }

      if (situacao === 'ATIVADO' && !codigoNormalizado) {
        idsAtivadosSemCodigo.push(produtoId);
      }

      return {
        produtoId,
        operacao:
          situacao === 'ATIVADO'
            ? ProdutoTransmissaoItemOperacao.NOVA_VERSAO
            : ProdutoTransmissaoItemOperacao.INCLUSAO,
      };
    });

    if (idsNaoAprovados.length > 0) {
      throw new ValidationError({
        produtos: `Somente produtos aprovados podem ser transmitidos. IDs inválidos: ${idsNaoAprovados.join(', ')}.`,
      });
    }

    if (idsSituacaoInvalida.length > 0) {
      throw new ValidationError({
        produtos: `Somente produtos em situação RASCUNHO ou ATIVADO podem ser transmitidos. IDs inválidos: ${idsSituacaoInvalida.join(', ')}.`,
      });
    }

    if (idsAtivadosSemCodigo.length > 0) {
      throw new ValidationError({
        produtos: `Produtos ATIVADO exigem código SISCOMEX válido para gerar nova versão. IDs inválidos: ${idsAtivadosSemCodigo.join(', ')}.`,
      });
    }

    const resultado = await catalogoPrisma.$transaction(async tx => {
      const transmissao = await tx.produtoTransmissao.create({
        data: {
          superUserId,
          catalogoId,
          usuarioCatalogoId: usuarioCatalogoId ?? null,
          modalidade: ProdutoTransmissaoModalidade.PRODUTOS,
          status: ProdutoTransmissaoStatus.EM_FILA,
          totalItens: itens.length,
          selecaoJson: idsSelecionados as Prisma.InputJsonValue,
        },
      });

      await tx.produtoTransmissaoItem.createMany({
        data: itens.map(item => ({
          transmissaoId: transmissao.id,
          produtoId: item.produtoId,
          operacao: item.operacao,
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
    */
  }

  async prepararTransmissao(
    ids: number[],
    catalogoId: number,
    superUserId: number,
    usuarioCatalogoId?: number | null
  ) {
    const preparacao = await this.validarSelecaoParaTransmissao(ids, catalogoId, superUserId);

    const transmissaoEmAndamento = await catalogoPrisma.produtoTransmissao.findFirst({
      where: {
        catalogoId: preparacao.catalogoId,
        status: { in: STATUS_TRANSMISSAO_EXECUCAO },
      },
    });

    if (transmissaoEmAndamento) {
      throw new ValidationError({
        catalogoId:
          'Já existe uma transmissão em andamento para o catálogo selecionado. Aguarde a conclusão antes de criar uma nova.',
      });
    }

    return catalogoPrisma.$transaction(async tx => {
      const transmissao = await tx.produtoTransmissao.create({
        data: {
          superUserId,
          catalogoId: preparacao.catalogoId,
          usuarioCatalogoId: usuarioCatalogoId ?? null,
          modalidade: ProdutoTransmissaoModalidade.PRODUTOS,
          origemTipo: ProdutoTransmissaoOrigemTipo.MANUAL,
          status: ProdutoTransmissaoStatus.AGUARDANDO_CONFIRMACAO,
          totalItens: preparacao.itens.length,
          totalSucesso: 0,
          totalErro: 0,
          selecaoJson: preparacao.idsSelecionados as Prisma.InputJsonValue,
        },
      });

      await tx.produtoTransmissaoItem.createMany({
        data: preparacao.itens.map(item => ({
          transmissaoId: transmissao.id,
          produtoId: item.produtoId,
          operacao: item.operacao,
          status: ProdutoTransmissaoItemStatus.PENDENTE,
        })),
      });

      return { transmissaoId: transmissao.id };
    });
  }

  async iniciarTransmissao(transmissaoId: number, superUserId: number) {
    if (!Number.isFinite(transmissaoId)) {
      throw new ValidationError({ transmissaoId: 'Transmissão selecionada é inválida.' });
    }

    const transmissao = await catalogoPrisma.produtoTransmissao.findFirst({
      where: { id: transmissaoId, superUserId },
      include: {
        itens: {
          orderBy: { id: 'asc' },
        },
      },
    });

    if (!transmissao) {
      throw new ValidationError({ transmissaoId: 'Transmissão não encontrada.' });
    }

    if (transmissao.status !== ProdutoTransmissaoStatus.AGUARDANDO_CONFIRMACAO) {
      throw new ValidationError({
        transmissaoId: 'Somente transmissões aguardando confirmação podem ser iniciadas.',
      });
    }

    const idsSelecionados = transmissao.itens.map(item => item.produtoId);
    if (idsSelecionados.length === 0) {
      throw new ValidationError({
        transmissaoId: 'A transmissão não possui itens para enviar. Revise ou cancele a pré-transmissão.',
      });
    }

    const transmissaoAtiva = await catalogoPrisma.produtoTransmissao.findFirst({
      where: {
        catalogoId: transmissao.catalogoId,
        status: { in: STATUS_TRANSMISSAO_EXECUCAO },
      },
    });

    if (transmissaoAtiva && transmissaoAtiva.id !== transmissao.id) {
      throw new ValidationError({
        catalogoId: 'Já existe uma transmissão em andamento para o catálogo selecionado. Aguarde a conclusão.',
      });
    }

    const preparacao = await this.validarSelecaoParaTransmissao(
      idsSelecionados,
      transmissao.catalogoId,
      superUserId
    );
    const itensPorProdutoId = new Map(preparacao.itens.map(item => [item.produtoId, item]));

    return catalogoPrisma.$transaction(async tx => {
      for (const item of transmissao.itens) {
        const itemAtualizado = itensPorProdutoId.get(item.produtoId);

        if (!itemAtualizado) {
          throw new ValidationError({
            produtos: `O produto ${item.produtoId} não está mais elegível para transmissão.`,
          });
        }

        await tx.produtoTransmissaoItem.update({
          where: { id: item.id },
          data: {
            operacao: itemAtualizado.operacao,
            status: ProdutoTransmissaoItemStatus.PENDENTE,
            mensagem: null,
            retornoCodigo: null,
            retornoVersao: null,
            retornoSituacao: null,
          },
        });
      }

      await tx.produtoTransmissao.update({
        where: { id: transmissao.id },
        data: {
          status: ProdutoTransmissaoStatus.EM_FILA,
          totalItens: preparacao.itens.length,
          totalSucesso: 0,
          totalErro: 0,
          selecaoJson: preparacao.idsSelecionados as Prisma.InputJsonValue,
          asyncJobId: null,
          iniciadoEm: null,
          concluidoEm: null,
          payloadEnvioPath: null,
          payloadEnvioExpiraEm: null,
          payloadEnvioTamanho: null,
          payloadEnvioProvider: null,
          payloadRetornoPath: null,
          payloadRetornoExpiraEm: null,
          payloadRetornoTamanho: null,
          payloadRetornoProvider: null,
        },
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
  }

  async cancelarPreTransmissao(transmissaoId: number, superUserId: number) {
    if (!Number.isFinite(transmissaoId)) {
      throw new ValidationError({ transmissaoId: 'Transmissão selecionada é inválida.' });
    }

    const transmissao = await catalogoPrisma.produtoTransmissao.findFirst({
      where: { id: transmissaoId, superUserId },
    });

    if (!transmissao) {
      throw new ValidationError({ transmissaoId: 'Transmissão não encontrada.' });
    }

    if (transmissao.status !== ProdutoTransmissaoStatus.AGUARDANDO_CONFIRMACAO) {
      throw new ValidationError({
        transmissaoId: 'Somente pré-transmissões aguardando confirmação podem ser canceladas.',
      });
    }

    await catalogoPrisma.produtoTransmissao.update({
      where: { id: transmissaoId },
      data: {
        status: ProdutoTransmissaoStatus.CANCELADA,
        concluidoEm: new Date(),
      },
    });

    return { transmissaoId, status: ProdutoTransmissaoStatus.CANCELADA };
  }

  async removerItemPreTransmissao(transmissaoId: number, itemId: number, superUserId: number) {
    if (!Number.isFinite(transmissaoId) || !Number.isFinite(itemId)) {
      throw new ValidationError({ transmissaoId: 'Transmissão ou item selecionado é inválido.' });
    }

    const transmissao = await catalogoPrisma.produtoTransmissao.findFirst({
      where: { id: transmissaoId, superUserId },
      include: {
        itens: {
          orderBy: { id: 'asc' },
        },
      },
    });

    if (!transmissao) {
      throw new ValidationError({ transmissaoId: 'Transmissão não encontrada.' });
    }

    if (transmissao.status !== ProdutoTransmissaoStatus.AGUARDANDO_CONFIRMACAO) {
      throw new ValidationError({
        transmissaoId: 'Somente pré-transmissões aguardando confirmação podem ser alteradas.',
      });
    }

    const item = transmissao.itens.find(registro => registro.id === itemId);
    if (!item) {
      throw new ValidationError({ itemId: 'Item de transmissão não encontrado.' });
    }

    const idsRestantes = transmissao.itens
      .filter(registro => registro.id !== itemId)
      .map(registro => registro.produtoId);

    await catalogoPrisma.$transaction(async tx => {
      await tx.produtoTransmissaoItem.delete({
        where: { id: itemId },
      });

      await tx.produtoTransmissao.update({
        where: { id: transmissaoId },
        data: {
          totalItens: idsRestantes.length,
          totalSucesso: 0,
          totalErro: 0,
          selecaoJson: idsRestantes as Prisma.InputJsonValue,
        },
      });
    });

    return { transmissaoId, totalItens: idsRestantes.length };
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
            produto: {
              select: {
                id: true,
                codigo: true,
                denominacao: true,
                status: true,
                situacao: true,
                versao: true,
                catalogoId: true,
              },
            },
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
      },
    });

    if (!transmissao || transmissao.superUserId !== superUserId) {
      throw new Error('Transmissão não encontrada para o superusuário informado.');
    }

    const ids = this.converterSelecaoParaIds(transmissao.selecaoJson);

    if (!ids.length) {
      await this.marcarComoFalha(transmissao.id, 'Nenhum produto encontrado para enviar.', heartbeat, jobId);
      return;
    }

    const cpfCnpjRaiz = this.extrairCpfCnpjRaiz(transmissao.catalogo.cpf_cnpj);

    if (!cpfCnpjRaiz) {
      await this.marcarComoFalha(transmissao.id, 'Catálogo sem CNPJ válido para transmissão.', heartbeat, jobId);
      return;
    }

    await this.normalizarItensEmProcessamento(transmissao.id);

    await catalogoPrisma.produtoTransmissao.update({
      where: { id: transmissao.id },
      data: {
        status: ProdutoTransmissaoStatus.PROCESSANDO,
        iniciadoEm: transmissao.iniciadoEm ?? new Date(),
        concluidoEm: null,
      },
    });

    if (jobId) {
      await registerJobLog(jobId, AsyncJobStatus.PROCESSANDO, 'Preparando transmissão individual de produtos.');
    }
    await heartbeat();

    const itensPersistidos = await catalogoPrisma.produtoTransmissaoItem.findMany({
      where: { transmissaoId: transmissao.id },
      orderBy: { id: 'asc' },
    });

    if (itensPersistidos.length === 0) {
      await this.marcarComoFalha(transmissao.id, 'Nenhum item de transmissão foi encontrado.', heartbeat, jobId);
      return;
    }

    const produtos = await this.exportacaoService.buscarProdutosComAtributos(ids, transmissao.superUserId, transmissao.catalogoId);
    const produtosPorId = new Map(produtos.map(produto => [produto.id, produto]));
    const produtosExportados = this.exportacaoService.transformarParaSiscomex(produtos, {
      id: transmissao.catalogo.id,
      cpf_cnpj: transmissao.catalogo.cpf_cnpj ?? null,
    });
    const produtosExportadosPorId = new Map(produtosExportados.map(produto => [Number(produto.seq), produto]));

    const itensParaEnvio = this.montarPlanejamentoItens(
      itensPersistidos,
      produtosExportadosPorId,
      cpfCnpjRaiz
    );

    await this.gerarPayloadEnvio(transmissao.id, transmissao.superUserId, itensParaEnvio);
    await heartbeat();

    if (jobId) {
      await registerJobLog(
        jobId,
        AsyncJobStatus.PROCESSANDO,
        `Payload de envio armazenado. ${itensParaEnvio.length} item(ns) elegível(is) para processamento.`
      );
    }

    const itensPendentes = itensPersistidos.filter(item => item.status === ProdutoTransmissaoItemStatus.PENDENTE);
    let processadosNoCiclo = 0;

    for (const item of itensPendentes) {
      const planejamento = itensParaEnvio.find(planejado => planejado.itemId === item.id);

      if (!planejamento) {
        await this.marcarItemComoErro(
          transmissao.id,
          item.id,
          'Produto não encontrado ou sem dados suficientes para montar a transmissão.'
        );
        processadosNoCiclo += 1;
        continue;
      }

      const produtoAtual = produtosPorId.get(item.produtoId);

      if (!produtoAtual) {
        await this.marcarItemComoErro(
          transmissao.id,
          item.id,
          'Produto não encontrado no catálogo para processamento da transmissão.'
        );
        processadosNoCiclo += 1;
        continue;
      }

      const statusProduto = String(produtoAtual.status || '').toUpperCase();
      if (statusProduto !== 'APROVADO') {
        await this.marcarItemComoErro(
          transmissao.id,
          item.id,
          `Produto não está mais aprovado para transmissão. Status atual: ${statusProduto || 'desconhecido'}.`
        );
        processadosNoCiclo += 1;
        continue;
      }

      await this.marcarItemComoProcessando(transmissao.id, item.id);
      await heartbeat();

      const cliente = await this.obterClienteSiscomex(
        transmissao.catalogoId,
        transmissao.superUserId,
        this.siscomexClients
      );

      const resultado = await this.executarItemComRetry({
        cliente,
        cpfCnpjRaiz,
        heartbeat,
        item: planejamento,
        jobId,
        superUserId: transmissao.superUserId,
        transmissaoId: transmissao.id,
      });

      if (resultado.tipo === 'sucesso') {
        await this.produtoService.marcarComoTransmitido(item.produtoId, transmissao.superUserId, {
          codigo: resultado.codigoPersistencia,
          versao: resultado.versao,
          situacao: resultado.situacao,
          atualizarCodigo: planejamento.operacao !== ProdutoTransmissaoItemOperacao.NOVA_VERSAO,
          transmissaoId: transmissao.id,
        });

        await this.marcarItemComoSucesso(
          transmissao.id,
          item.id,
          resultado.codigoPersistencia,
          resultado.versao,
          resultado.situacao
        );

        processadosNoCiclo += 1;
      } else if (resultado.tipo === 'erro') {
        await this.marcarItemComoErro(transmissao.id, item.id, resultado.mensagem);
        processadosNoCiclo += 1;
      } else {
        await this.marcarItemComoErro(transmissao.id, item.id, resultado.mensagem);
        await this.marcarItensPendentesComoErro(
          transmissao.id,
          'Transmissão interrompida por falha persistente de autenticação/permissão/certificado na integração com o SISCOMEX.'
        );
        processadosNoCiclo += 1;

        if (jobId) {
          await registerJobLog(jobId, AsyncJobStatus.FALHO, resultado.mensagem);
        }

        await this.finalizarTransmissao(transmissao.id, cpfCnpjRaiz, jobId);
        await heartbeat();
        return;
      }

      if (jobId && processadosNoCiclo > 0 && processadosNoCiclo % 10 === 0) {
        await registerJobLog(
          jobId,
          AsyncJobStatus.PROCESSANDO,
          `Transmissão em andamento: ${processadosNoCiclo} item(ns) concluído(s) neste ciclo.`
        );
      }

      await heartbeat();

      if (this.transmissaoDelayMs > 0) {
        await this.esperarComHeartbeat(this.transmissaoDelayMs, heartbeat);
      }
    }

    await this.finalizarTransmissao(transmissao.id, cpfCnpjRaiz, jobId);
    await heartbeat();
  }

  private async validarSelecaoParaTransmissao(
    ids: number[],
    catalogoId: number,
    superUserId: number
  ): Promise<PreparacaoTransmissaoValidada> {
    if (!Number.isFinite(catalogoId)) {
      throw new ValidationError({ catalogoId: 'Catálogo selecionado é obrigatório para transmitir ao SISCOMEX' });
    }

    const idsSelecionados = [
      ...new Set(
        (Array.isArray(ids) ? ids : [])
          .map(id => Number(id))
          .filter(Number.isFinite)
      ),
    ];

    if (idsSelecionados.length === 0) {
      throw new ValidationError({ produtos: 'Nenhum produto selecionado para transmissão' });
    }

    const catalogo = await this.catalogoService.buscarPorId(catalogoId, superUserId);
    if (!catalogo) {
      throw new ValidationError({ catalogoId: 'Catálogo selecionado não encontrado para transmissão' });
    }

    const cpfCnpjRaiz = this.extrairCpfCnpjRaiz(catalogo.cpf_cnpj);
    if (!cpfCnpjRaiz) {
      throw new ValidationError({
        catalogoId: 'Catálogo selecionado está sem CNPJ válido para transmissão ao SISCOMEX',
      });
    }

    const produtos = await this.exportacaoService.buscarProdutosComAtributos(
      idsSelecionados,
      superUserId,
      catalogoId
    );

    if (produtos.length === 0) {
      throw new ValidationError({ produtos: 'Nenhum produto encontrado para transmissão' });
    }

    const produtosPorId = new Map(produtos.map(produto => [produto.id, produto]));
    const idsForaCatalogo = idsSelecionados.filter(id => !produtosPorId.has(id));

    if (idsForaCatalogo.length > 0) {
      throw new ValidationError({
        produtos: 'Todos os produtos selecionados precisam pertencer ao catálogo informado para transmissão.',
      });
    }

    const idsNaoAprovados: number[] = [];
    const idsSituacaoInvalida: number[] = [];
    const idsAtivadosSemCodigo: number[] = [];

    const itens = idsSelecionados.map(produtoId => {
      const produto = produtosPorId.get(produtoId)!;
      const status = String(produto.status || '').toUpperCase();
      const situacao = String(produto.situacao || '').toUpperCase();
      const codigoNormalizado = this.normalizarCodigoSiscomex(produto.codigo);

      if (status !== 'APROVADO') {
        idsNaoAprovados.push(produtoId);
      }

      if (situacao !== 'RASCUNHO' && situacao !== 'ATIVADO') {
        idsSituacaoInvalida.push(produtoId);
      }

      if (situacao === 'ATIVADO' && !codigoNormalizado) {
        idsAtivadosSemCodigo.push(produtoId);
      }

      return {
        produtoId,
        operacao:
          situacao === 'ATIVADO'
            ? ProdutoTransmissaoItemOperacao.NOVA_VERSAO
            : ProdutoTransmissaoItemOperacao.INCLUSAO,
      };
    });

    if (idsNaoAprovados.length > 0) {
      throw new ValidationError({
        produtos: `Somente produtos aprovados podem ser transmitidos. IDs inválidos: ${idsNaoAprovados.join(', ')}.`,
      });
    }

    if (idsSituacaoInvalida.length > 0) {
      throw new ValidationError({
        produtos: `Somente produtos em situação RASCUNHO ou ATIVADO podem ser transmitidos. IDs inválidos: ${idsSituacaoInvalida.join(', ')}.`,
      });
    }

    if (idsAtivadosSemCodigo.length > 0) {
      throw new ValidationError({
        produtos: `Produtos ATIVADO exigem código SISCOMEX válido para gerar nova versão. IDs inválidos: ${idsAtivadosSemCodigo.join(', ')}.`,
      });
    }

    return {
      catalogoId,
      cpfCnpjRaiz,
      idsSelecionados,
      itens,
    };
  }

  private montarPlanejamentoItens(
    itensPersistidos: Array<{
      id: number;
      produtoId: number;
      operacao: ProdutoTransmissaoItemOperacao;
    }>,
    produtosExportadosPorId: Map<number, any>,
    cpfCnpjRaiz: string
  ): PlanejamentoItemTransmissao[] {
    return itensPersistidos
      .flatMap(item => {
        const produtoExportado = produtosExportadosPorId.get(item.produtoId);
        if (!produtoExportado) {
          return [];
        }

        const { catalogoId: _catalogoId, ...payloadBase } = produtoExportado;
        const payloadInclusao = { ...(payloadBase as Record<string, any>) };
        const payloadAtualizacaoVersao = { ...(payloadBase as Record<string, any>) };

        delete payloadAtualizacaoVersao.seq;
        delete payloadAtualizacaoVersao.codigo;
        delete payloadAtualizacaoVersao.versao;
        delete payloadAtualizacaoVersao.cpfCnpjRaiz;
        delete payloadAtualizacaoVersao.situacao;

        const codigoNormalizado = this.normalizarCodigoSiscomex((produtoExportado as any).codigo);
        const operacao = item.operacao;

        if (operacao === ProdutoTransmissaoItemOperacao.NOVA_VERSAO && !codigoNormalizado) {
          return [];
        }

        return [
          {
            itemId: item.id,
            produtoId: item.produtoId,
            operacao,
            codigo: codigoNormalizado,
            endpoint:
              operacao === ProdutoTransmissaoItemOperacao.NOVA_VERSAO
                ? `/ext/produto/${encodeURIComponent(cpfCnpjRaiz)}/${encodeURIComponent(codigoNormalizado!)}`
                : `/ext/produto/${encodeURIComponent(cpfCnpjRaiz)}`,
            payload:
              operacao === ProdutoTransmissaoItemOperacao.NOVA_VERSAO
                ? payloadAtualizacaoVersao
                : payloadInclusao,
          },
        ];
      });
  }

  private async gerarPayloadEnvio(
    transmissaoId: number,
    superUserId: number,
    itens: PlanejamentoItemTransmissao[]
  ) {
    const provider = storageFactory();
    const caminhoEnvio = `${superUserId}/transmissoes/${transmissaoId}/payload-envio.json`;
    const payloadEnvio = itens.map(item => ({
      produtoId: item.produtoId,
      operacao: item.operacao,
      endpoint: item.endpoint,
      payload: item.payload,
    }));
    const payloadEnvioBuffer = Buffer.from(JSON.stringify(payloadEnvio, null, 2), 'utf8');
    await provider.upload(payloadEnvioBuffer, caminhoEnvio);

    const expiraEm = new Date(Date.now() + UM_DIA_EM_MS);
    const storageProvider = provider.getSignedUrl ? 's3' : 'local';

    await catalogoPrisma.produtoTransmissao.update({
      where: { id: transmissaoId },
      data: {
        payloadEnvioPath: caminhoEnvio,
        payloadEnvioExpiraEm: expiraEm,
        payloadEnvioTamanho: payloadEnvioBuffer.byteLength,
        payloadEnvioProvider: storageProvider,
      },
    });
  }

  private async executarItemComRetry(params: {
    cliente: SiscomexService;
    cpfCnpjRaiz: string;
    heartbeat: () => Promise<void>;
    item: PlanejamentoItemTransmissao;
    jobId?: number;
    superUserId: number;
    transmissaoId: number;
  }): Promise<ResultadoExecucaoItem> {
    const totalTentativas = this.transmissaoRetryMax + 1;

    for (let tentativa = 1; tentativa <= totalTentativas; tentativa += 1) {
      await this.aguardarCooldownGlobal(params.heartbeat, params.jobId);

      try {
        const resposta =
          params.item.operacao === ProdutoTransmissaoItemOperacao.NOVA_VERSAO
            ? await params.cliente.atualizarProduto(
                params.cpfCnpjRaiz,
                params.item.codigo!,
                params.item.payload as any
              )
            : await params.cliente.incluirProduto(
                params.cpfCnpjRaiz,
                params.item.payload as any
              );

        return this.normalizarRespostaItemSucesso(params.item, resposta);
      } catch (error) {
        const classificacao = this.classificarErroTransmissao(error);

        logger.error('Falha ao transmitir produto ao SISCOMEX', {
          produtoId: params.item.produtoId,
          operacao: params.item.operacao,
          tentativa,
          erro: error,
          classificacao,
        });

        if (classificacao.interromperFila) {
          return {
            tipo: 'interromper',
            mensagem: classificacao.mensagem,
            retorno: {
              produtoId: params.item.produtoId,
              operacao: params.item.operacao,
              status: 'ERRO',
              endpoint: params.item.endpoint,
              mensagem: classificacao.mensagem,
              detalhes: classificacao.detalhes ?? null,
            },
          };
        }

        if (!classificacao.retryable || tentativa >= totalTentativas) {
          return {
            tipo: 'erro',
            mensagem: classificacao.mensagem,
            retorno: {
              produtoId: params.item.produtoId,
              operacao: params.item.operacao,
              status: 'ERRO',
              endpoint: params.item.endpoint,
              mensagem: classificacao.mensagem,
              detalhes: classificacao.detalhes ?? null,
            },
          };
        }

        if (classificacao.aplicarCooldown) {
          this.aplicarCooldownGlobal();
        }

        const backoffMs = this.calcularBackoffMs(tentativa);

        if (params.jobId) {
          const partes = [
            `Retry do produto ${params.item.produtoId}`,
            `tentativa ${tentativa + 1}/${totalTentativas}`,
            `em ${backoffMs}ms`,
          ];

          if (classificacao.aplicarCooldown) {
            partes.push(`com cooldown global de ${this.transmissaoCooldownMs}ms`);
          }

          await registerJobLog(params.jobId, AsyncJobStatus.PROCESSANDO, partes.join(' '));
        }

        await this.esperarComHeartbeat(backoffMs, params.heartbeat);
      }
    }

    return {
      tipo: 'erro',
      mensagem: 'Falha ao transmitir produto após esgotar as tentativas configuradas.',
      retorno: {
        produtoId: params.item.produtoId,
        operacao: params.item.operacao,
        status: 'ERRO',
        endpoint: params.item.endpoint,
        mensagem: 'Falha ao transmitir produto após esgotar as tentativas configuradas.',
      },
    };
  }

  private normalizarRespostaItemSucesso(
    item: PlanejamentoItemTransmissao,
    resposta: any
  ): ResultadoExecucaoItem {
    const payload = Array.isArray(resposta) ? resposta[0] : resposta;

    if (!payload) {
      return {
        tipo: 'erro',
        mensagem: 'Retorno do SISCOMEX não trouxe resposta para o produto.',
        retorno: {
          produtoId: item.produtoId,
          operacao: item.operacao,
          status: 'ERRO',
          endpoint: item.endpoint,
          mensagem: 'Retorno do SISCOMEX não trouxe resposta para o produto.',
        },
      };
    }

    const temErrosResposta = Array.isArray(payload.erros)
      ? payload.erros.length > 0
      : Boolean(payload.erros);

    if (payload.sucesso === false || temErrosResposta) {
      return {
        tipo: 'erro',
        mensagem: this.extrairMotivoSiscomex(payload),
        retorno: {
          produtoId: item.produtoId,
          operacao: item.operacao,
          status: 'ERRO',
          endpoint: item.endpoint,
          mensagem: this.extrairMotivoSiscomex(payload),
        },
      };
    }

    const situacaoNormalizada = String((payload.situacao ?? '')).toUpperCase();
    const situacaoProduto: 'RASCUNHO' | 'ATIVADO' | 'DESATIVADO' =
      situacaoNormalizada === 'DESATIVADO'
        ? 'DESATIVADO'
        : situacaoNormalizada === 'RASCUNHO'
          ? 'RASCUNHO'
          : 'ATIVADO';
    const versaoNumero =
      typeof payload.versao === 'string' ? Number(payload.versao) : (payload.versao as number);

    if (!Number.isFinite(versaoNumero)) {
      return {
        tipo: 'erro',
        mensagem: this.extrairMotivoSiscomex(payload),
        retorno: {
          produtoId: item.produtoId,
          operacao: item.operacao,
          status: 'ERRO',
          endpoint: item.endpoint,
          mensagem: this.extrairMotivoSiscomex(payload),
        },
      };
    }

    const codigoRetornado = this.normalizarCodigoSiscomex(payload.codigo);
    const codigoPersistencia =
      item.operacao === ProdutoTransmissaoItemOperacao.NOVA_VERSAO
        ? item.codigo
        : codigoRetornado;

    return {
      tipo: 'sucesso',
      mensagem: null,
      codigoPersistencia,
      versao: versaoNumero,
      situacao: situacaoProduto,
      retorno: {
        produtoId: item.produtoId,
        operacao: item.operacao,
        status: 'SUCESSO',
        endpoint: item.endpoint,
        mensagem: null,
        retorno: {
          codigo: codigoPersistencia,
          versao: versaoNumero,
          situacao: situacaoProduto,
        },
      },
    };
  }

  private classificarErroTransmissao(error: unknown): ClassificacaoErroTransmissao {
    const detalhes = this.obterDetalhesSiscomex(error);
    const status = detalhes?.status;
    const mensagem = error instanceof Error && error.message.trim()
      ? error.message.trim()
      : 'Erro desconhecido ao transmitir produto ao SISCOMEX.';
    const mensagemLower = mensagem.toLowerCase();

    if (status === 400 || status === 404 || status === 409 || status === 410 || status === 422) {
      return {
        aplicarCooldown: false,
        detalhes,
        interromperFila: false,
        mensagem,
        retryable: false,
      };
    }

    if (status === 401 || status === 403) {
      return {
        aplicarCooldown: false,
        detalhes,
        interromperFila: true,
        mensagem,
        retryable: false,
      };
    }

    if (status === 429) {
      return {
        aplicarCooldown: true,
        detalhes,
        interromperFila: false,
        mensagem,
        retryable: true,
      };
    }

    if (status === 502 || status === 503 || status === 504) {
      return {
        aplicarCooldown: false,
        detalhes,
        interromperFila: false,
        mensagem,
        retryable: true,
      };
    }

    const erroCertificado =
      mensagemLower.includes('certificado') ||
      mensagemLower.includes('pfx') ||
      mensagemLower.includes('mtls') ||
      mensagemLower.includes('tls');

    if (erroCertificado) {
      return {
        aplicarCooldown: false,
        detalhes,
        interromperFila: true,
        mensagem,
        retryable: false,
      };
    }

    const erroTecnicoRetryavel =
      mensagemLower.includes('timeout') ||
      mensagemLower.includes('timed out') ||
      mensagemLower.includes('econnreset') ||
      mensagemLower.includes('econnaborted') ||
      mensagemLower.includes('eai_again') ||
      mensagemLower.includes('erro de conexão') ||
      mensagemLower.includes('erro de conexao') ||
      mensagemLower.includes('socket hang up') ||
      mensagemLower.includes('network');

    return {
      aplicarCooldown: false,
      detalhes,
      interromperFila: false,
      mensagem,
      retryable: erroTecnicoRetryavel,
    };
  }

  private obterDetalhesSiscomex(error: unknown) {
    if (!error || typeof error !== 'object') {
      return undefined;
    }

    return (error as Error & { siscomexDetalhes?: SiscomexErroDetalhado }).siscomexDetalhes;
  }

  private async marcarItemComoProcessando(transmissaoId: number, itemId: number) {
    await catalogoPrisma.$transaction(async tx => {
      await tx.produtoTransmissaoItem.update({
        where: { id: itemId },
        data: {
          status: ProdutoTransmissaoItemStatus.PROCESSANDO,
          mensagem: null,
        },
      });

      await this.sincronizarTotaisTransmissao(transmissaoId, tx);
    });
  }

  private async marcarItemComoSucesso(
    transmissaoId: number,
    itemId: number,
    codigo: string | null,
    versao: number,
    situacao: 'RASCUNHO' | 'ATIVADO' | 'DESATIVADO'
  ) {
    await catalogoPrisma.$transaction(async tx => {
      await tx.produtoTransmissaoItem.update({
        where: { id: itemId },
        data: {
          status: ProdutoTransmissaoItemStatus.SUCESSO,
          retornoCodigo: codigo,
          retornoVersao: versao,
          retornoSituacao: situacao,
          mensagem: null,
        },
      });

      await this.sincronizarTotaisTransmissao(transmissaoId, tx);
    });
  }

  private async marcarItemComoErro(transmissaoId: number, itemId: number, mensagem: string) {
    await catalogoPrisma.$transaction(async tx => {
      await tx.produtoTransmissaoItem.update({
        where: { id: itemId },
        data: {
          status: ProdutoTransmissaoItemStatus.ERRO,
          mensagem,
        },
      });

      await this.sincronizarTotaisTransmissao(transmissaoId, tx);
    });
  }

  private async marcarItensPendentesComoErro(transmissaoId: number, mensagem: string) {
    await catalogoPrisma.$transaction(async tx => {
      await tx.produtoTransmissaoItem.updateMany({
        where: {
          transmissaoId,
          status: { in: [ProdutoTransmissaoItemStatus.PENDENTE, ProdutoTransmissaoItemStatus.PROCESSANDO] },
        },
        data: {
          status: ProdutoTransmissaoItemStatus.ERRO,
          mensagem,
        },
      });

      await this.sincronizarTotaisTransmissao(transmissaoId, tx);
    });
  }

  private async normalizarItensEmProcessamento(transmissaoId: number) {
    await catalogoPrisma.$transaction(async tx => {
      await tx.produtoTransmissaoItem.updateMany({
        where: {
          transmissaoId,
          status: ProdutoTransmissaoItemStatus.PROCESSANDO,
        },
        data: {
          status: ProdutoTransmissaoItemStatus.PENDENTE,
          mensagem: null,
        },
      });

      await this.sincronizarTotaisTransmissao(transmissaoId, tx);
    });
  }

  private async sincronizarTotaisTransmissao(
    transmissaoId: number,
    tx: Prisma.TransactionClient
  ) {
    const [totalSucesso, totalErro] = await Promise.all([
      tx.produtoTransmissaoItem.count({
        where: { transmissaoId, status: ProdutoTransmissaoItemStatus.SUCESSO },
      }),
      tx.produtoTransmissaoItem.count({
        where: { transmissaoId, status: ProdutoTransmissaoItemStatus.ERRO },
      }),
    ]);

    await tx.produtoTransmissao.update({
      where: { id: transmissaoId },
      data: {
        totalSucesso,
        totalErro,
      },
    });
  }

  private async finalizarTransmissao(transmissaoId: number, cpfCnpjRaiz: string, jobId?: number) {
    const transmissao = await catalogoPrisma.produtoTransmissao.findUnique({
      where: { id: transmissaoId },
      include: {
        itens: {
          include: {
            produto: {
              select: {
                id: true,
                codigo: true,
                denominacao: true,
              },
            },
          },
          orderBy: { id: 'asc' },
        },
      },
    });

    if (!transmissao) {
      return;
    }

    const totalItens = transmissao.itens.length;
    const totalSucesso = transmissao.itens.filter(item => item.status === ProdutoTransmissaoItemStatus.SUCESSO).length;
    const totalErro = transmissao.itens.filter(item => item.status === ProdutoTransmissaoItemStatus.ERRO).length;
    const statusFinal =
      totalSucesso === totalItens
        ? ProdutoTransmissaoStatus.CONCLUIDO
        : totalSucesso === 0
          ? ProdutoTransmissaoStatus.FALHO
          : ProdutoTransmissaoStatus.PARCIAL;

    const provider = storageFactory();
    const caminhoCompleto = `${await this.resolverDiretorioTransmissao(transmissaoId)}/payload-retorno.json`;
    const retorno = transmissao.itens.map<RetornoItemTransmissao>(item => ({
      produtoId: item.produtoId,
      operacao: item.operacao,
      status: item.status === ProdutoTransmissaoItemStatus.SUCESSO ? 'SUCESSO' : 'ERRO',
      endpoint:
        item.operacao === ProdutoTransmissaoItemOperacao.NOVA_VERSAO
          ? this.normalizarCodigoSiscomex(item.retornoCodigo ?? item.produto?.codigo)
            ? `/ext/produto/${encodeURIComponent(cpfCnpjRaiz)}/${encodeURIComponent(this.normalizarCodigoSiscomex(item.retornoCodigo ?? item.produto?.codigo)!)}`
            : null
          : `/ext/produto/${encodeURIComponent(cpfCnpjRaiz)}`,
      mensagem: item.mensagem ?? null,
      retorno: {
        codigo: item.retornoCodigo ?? null,
        versao: item.retornoVersao ?? null,
        situacao: item.retornoSituacao ?? null,
      },
    }));
    const bufferRetorno = Buffer.from(JSON.stringify(retorno, null, 2), 'utf8');
    await provider.upload(bufferRetorno, caminhoCompleto);

    const expiraEm = new Date(Date.now() + UM_DIA_EM_MS);
    const storageProvider = provider.getSignedUrl ? 's3' : 'local';

    await catalogoPrisma.produtoTransmissao.update({
      where: { id: transmissaoId },
      data: {
        status: statusFinal,
        totalSucesso,
        totalErro,
        concluidoEm: new Date(),
        payloadRetornoPath: caminhoCompleto,
        payloadRetornoExpiraEm: expiraEm,
        payloadRetornoTamanho: bufferRetorno.byteLength,
        payloadRetornoProvider: storageProvider,
      },
    });

    if (jobId) {
      await registerJobLog(
        jobId,
        AsyncJobStatus.PROCESSANDO,
        `Resumo da transmissão: ${totalSucesso}/${totalItens} sucesso(s), ${totalErro} erro(s), status ${statusFinal}.`
      );
    }
  }

  private async marcarComoFalha(
    transmissaoId: number,
    motivo: string,
    heartbeat: () => Promise<void>,
    jobId?: number
  ) {
    await this.marcarItensPendentesComoErro(transmissaoId, motivo);
    await heartbeat();

    const transmissao = await catalogoPrisma.produtoTransmissao.findUnique({
      where: { id: transmissaoId },
      include: {
        catalogo: { select: { cpf_cnpj: true } },
      },
    });

    const cpfCnpjRaiz = this.extrairCpfCnpjRaiz(transmissao?.catalogo?.cpf_cnpj ?? null) ?? 'desconhecido';
    await this.finalizarTransmissao(transmissaoId, cpfCnpjRaiz, jobId);

    if (jobId) {
      await registerJobLog(jobId, AsyncJobStatus.FALHO, motivo);
    }
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

  private async mapearTransmissaoParaResposta(transmissao: any) {
    const provider = storageFactory();

    const gerarUrlAssinada = async (path?: string | null, nome?: string | null, expira?: Date | null) => {
      if (!path) return null;
      if (typeof provider.getSignedUrl !== 'function') return null;
      const segundosRestantes = expira ? Math.max(60, Math.floor((expira.getTime() - Date.now()) / 1000)) : 3600;
      return provider.getSignedUrl(path, segundosRestantes, { filename: nome ?? undefined });
    };

    const payloadEnvioUrl = transmissao.payloadEnvioPath
      ? (
          await gerarUrlAssinada(
            transmissao.payloadEnvioPath,
            `payload-envio-${transmissao.id}.json`,
            transmissao.payloadEnvioExpiraEm
          )
        ) ?? `/api/siscomex/transmissoes/${transmissao.id}/arquivos/envio`
      : null;

    const payloadRetornoUrl = transmissao.payloadRetornoPath
      ? (
          await gerarUrlAssinada(
            transmissao.payloadRetornoPath,
            `payload-retorno-${transmissao.id}.json`,
            transmissao.payloadRetornoExpiraEm
          )
        ) ?? `/api/siscomex/transmissoes/${transmissao.id}/arquivos/retorno`
      : null;

    return {
      id: transmissao.id,
      catalogoId: transmissao.catalogoId,
      catalogo: transmissao.catalogo,
      origemTipo: transmissao.origemTipo ?? ProdutoTransmissaoOrigemTipo.MANUAL,
      origemContexto: (transmissao.origemContextoJson ?? null) as OrigemTransmissaoAjusteEstruturaContexto | null,
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
      possuiPassphrase: Boolean(certificado.passphrase),
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

  private resolverNumeroPositivo(valor: string | undefined, padrao: number) {
    const numero = Number(valor);
    if (!Number.isFinite(numero) || numero <= 0) {
      return padrao;
    }
    return numero;
  }

  private resolverNumeroNaoNegativo(valor: string | undefined, padrao: number) {
    const numero = Number(valor);
    if (!Number.isFinite(numero) || numero < 0) {
      return padrao;
    }
    return Math.floor(numero);
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

  private normalizarCodigoSiscomex(codigo?: string | null) {
    if (codigo === null || codigo === undefined) {
      return null;
    }

    const valor = String(codigo).trim();
    return valor.length > 0 ? valor : null;
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

  private aplicarCooldownGlobal() {
    ProdutoTransmissaoService.cooldownGlobalAte = Math.max(
      ProdutoTransmissaoService.cooldownGlobalAte,
      Date.now() + this.transmissaoCooldownMs
    );
  }

  private async aguardarCooldownGlobal(heartbeat: () => Promise<void>, jobId?: number) {
    const restante = ProdutoTransmissaoService.cooldownGlobalAte - Date.now();
    if (restante <= 0) {
      return;
    }

    if (jobId) {
      await registerJobLog(
        jobId,
        AsyncJobStatus.PROCESSANDO,
        `Fila de transmissão em cooldown por ${restante}ms antes da próxima tentativa.`
      );
    }

    await this.esperarComHeartbeat(restante, heartbeat);
  }

  private calcularBackoffMs(tentativa: number) {
    const expoente = Math.max(0, tentativa - 1);
    const base = this.transmissaoBackoffBaseMs * (2 ** expoente);
    const jitter = Math.floor(Math.random() * 250);
    return base + jitter;
  }

  private async esperarComHeartbeat(ms: number, heartbeat: () => Promise<void>) {
    if (!Number.isFinite(ms) || ms <= 0) {
      return;
    }

    let restante = ms;
    while (restante > 0) {
      const esperaAtual = Math.min(restante, HEARTBEAT_WAIT_STEP_MS);
      await new Promise(resolve => setTimeout(resolve, esperaAtual));
      restante -= esperaAtual;
      await heartbeat();
    }
  }
}
