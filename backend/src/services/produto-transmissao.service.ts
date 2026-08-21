import { createHash } from 'crypto';
import {
  AsyncJobStatus,
  AsyncJobTipo,
  Prisma,
  ProdutoTransmissaoBlocoStatus,
  ProdutoTransmissaoItemOperacao,
  ProdutoTransmissaoItemStatus,
  ProdutoTransmissaoModalidade,
  ProdutoTransmissaoOrigemTipo,
  ProdutoTransmissaoStatus,
} from '@prisma/client';
import { ProdutoExportacaoProdutoDTO, ProdutoExportacaoService } from './produto-exportacao.service';
import { SiscomexErroDetalhado, SiscomexService } from './siscomex.service';
import { ProdutoService } from './produto.service';
import { CertificadoService } from './certificado.service';
import { CatalogoService } from './catalogo.service';
import { catalogoPrisma } from '../utils/prisma';
import { ValidationError } from '../types/validation-error';
import { createAsyncJob, registerJobLog } from '../jobs/async-job.repository';
import { storageFactory } from './storage.factory';
import { logger } from '../utils/logger';
import {
  STATUS_TRANSMISSAO_ABERTA,
  STATUS_TRANSMISSAO_EXECUCAO,
  STATUS_TRANSMISSAO_FILA_CATALOGO,
} from '../constants/transmissao-status';
import { normalizarVersaoSiscomex, ProdutoHistoricoTipoEvento } from '../utils/versao-siscomex';

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
  blocoId: number | null;
  ordemExecucao: number | null;
  produtoId: number;
  operacao: ProdutoTransmissaoItemOperacao;
  codigo: string | null;
  versao: string | null;
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
  blocoId?: number | null;
  ordemExecucao?: number | null;
  operacao: ProdutoTransmissaoItemOperacao;
  status: 'SUCESSO' | 'ERRO';
  endpoint: string | null;
  mensagem: string | null;
  detalhes?: SiscomexErroDetalhado | null;
  retorno?: {
    codigo?: string | null;
    versao?: string | null;
    situacao?: string | null;
  };
}

type ResultadoExecucaoItem =
  | {
      tipo: 'sucesso';
      mensagem: null;
      retorno: RetornoItemTransmissao;
      codigoPersistencia: string | null;
      versao: string;
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

interface ResultadoEnfileiramentoTransmissao {
  transmissaoId: number;
  jobId: number | null;
  posicaoFilaCatalogo: number;
}

interface ResumoBlocoTransmissao {
  id: number;
  ordem: number;
  status: ProdutoTransmissaoBlocoStatus;
  totalItens: number;
  totalSucesso: number;
  totalErro: number;
  mensagem: string | null;
  iniciadoEm: Date | null;
  concluidoEm: Date | null;
}

type ItemTransmissaoPersistido = {
  id: number;
  transmissaoId: number;
  blocoId: number | null;
  ordemExecucao: number | null;
  produtoId: number;
  operacao: ProdutoTransmissaoItemOperacao;
  status: ProdutoTransmissaoItemStatus;
  mensagem?: string | null;
  retornoCodigo?: string | null;
  retornoVersao?: string | null;
  retornoSituacao?: string | null;
};

const UM_DIA_EM_MS = 24 * 60 * 60 * 1000;
const SISCOMEX_CLIENTE_CACHE_TTL_PADRAO_MS = 60000;
const SISCOMEX_TRANSMISSAO_DELAY_PADRAO_MS = 750;
const SISCOMEX_TRANSMISSAO_RETRY_MAX_PADRAO = 3;
const SISCOMEX_TRANSMISSAO_BACKOFF_PADRAO_MS = 2000;
const SISCOMEX_TRANSMISSAO_COOLDOWN_PADRAO_MS = 60000;
const TAMANHO_BLOCO_TRANSMISSAO = 100;
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
  private readonly transmissaoBlocoTamanho = TAMANHO_BLOCO_TRANSMISSAO;

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

  async prepararRetificacaoProduto(
    produtoId: number,
    superUserId: number,
    usuarioCatalogoId?: number | null
  ) {
    if (!Number.isFinite(produtoId)) {
      throw new ValidationError({ produtoId: 'Produto selecionado é inválido.' });
    }

    const produto = await catalogoPrisma.produto.findFirst({
      where: { id: produtoId, catalogo: { superUserId } },
      select: {
        id: true,
        catalogoId: true,
        codigo: true,
        versao: true,
        status: true,
        situacao: true,
        catalogo: { select: { cpf_cnpj: true } },
      },
    });

    if (!produto) {
      throw new ValidationError({ produtoId: 'Produto não encontrado para retificação.' });
    }

    const codigoNormalizado = this.normalizarCodigoSiscomex(produto.codigo);
    const versaoNormalizada = normalizarVersaoSiscomex(produto.versao);
    const status = String(produto.status || '').toUpperCase();
    const situacao = String(produto.situacao || '').toUpperCase();
    const erros: Record<string, string> = {};

    if (situacao !== 'DESATIVADO') {
      erros.situacao = 'Somente produtos DESATIVADO podem ser retificados.';
    }

    if (status !== 'APROVADO' && status !== 'TRANSMITIDO') {
      erros.status = 'Somente produtos aprovados ou já transmitidos podem ser retificados.';
    }

    if (!codigoNormalizado) {
      erros.codigo = 'Produto sem código SISCOMEX para retificação.';
    }

    if (!versaoNormalizada) {
      erros.versao = 'Produto sem versão SISCOMEX válida para retificação.';
    }

    const cpfCnpjRaiz = this.extrairCpfCnpjRaiz(produto.catalogo?.cpf_cnpj);
    if (!cpfCnpjRaiz) {
      erros.catalogoId = 'Catálogo do produto está sem CNPJ válido para retificação no SISCOMEX.';
    }

    const itemAberto = await catalogoPrisma.produtoTransmissaoItem.findFirst({
      where: {
        produtoId,
        transmissao: {
          status: { in: STATUS_TRANSMISSAO_ABERTA },
        },
      },
      select: { transmissaoId: true },
    });

    if (itemAberto) {
      erros.transmissao = `Produto já possui transmissão em aberto (#${itemAberto.transmissaoId}).`;
    }

    if (Object.keys(erros).length > 0) {
      throw new ValidationError(erros);
    }

    return catalogoPrisma.$transaction(async tx => {
      const transmissao = await tx.produtoTransmissao.create({
        data: {
          superUserId,
          catalogoId: produto.catalogoId,
          usuarioCatalogoId: usuarioCatalogoId ?? null,
          modalidade: ProdutoTransmissaoModalidade.PRODUTOS,
          origemTipo: ProdutoTransmissaoOrigemTipo.MANUAL,
          origemContextoJson: {
            acao: 'RETIFICACAO_PRODUTO',
            produtoId,
            codigo: codigoNormalizado,
            versao: versaoNormalizada,
          } as Prisma.InputJsonValue,
          status: ProdutoTransmissaoStatus.AGUARDANDO_CONFIRMACAO,
          totalItens: 1,
          totalSucesso: 0,
          totalErro: 0,
          selecaoJson: [produtoId] as Prisma.InputJsonValue,
        },
      });

      await tx.produtoTransmissaoItem.create({
        data: {
          transmissaoId: transmissao.id,
          produtoId,
          operacao: ProdutoTransmissaoItemOperacao.RETIFICACAO,
          status: ProdutoTransmissaoItemStatus.PENDENTE,
        },
      });

      return { transmissaoId: transmissao.id };
    });
  }

  async transmitirRetificacaoProduto(
    produtoId: number,
    superUserId: number,
    usuarioCatalogoId?: number | null
  ) {
    const { transmissaoId } = await this.prepararRetificacaoProduto(
      produtoId,
      superUserId,
      usuarioCatalogoId
    );

    return this.iniciarTransmissao(transmissaoId, superUserId);
  }

  async iniciarTransmissao(transmissaoId: number, superUserId: number) {
    if (!Number.isFinite(transmissaoId)) {
      throw new ValidationError({ transmissaoId: 'Transmissão selecionada é inválida.' });
    }

    const transmissao = await catalogoPrisma.produtoTransmissao.findFirst({
      where: { id: transmissaoId, superUserId },
      include: {
        itens: {
          orderBy: [{ ordemExecucao: 'asc' }, { id: 'asc' }],
        },
        blocos: {
          orderBy: { ordem: 'asc' },
        },
      },
    });

    if (!transmissao) {
      throw new ValidationError({ transmissaoId: 'Transmissão não encontrada.' });
    }

    if (
      transmissao.status !== ProdutoTransmissaoStatus.AGUARDANDO_CONFIRMACAO &&
      transmissao.status !== ProdutoTransmissaoStatus.INTERROMPIDA
    ) {
      throw new ValidationError({
        transmissaoId:
          'Somente transmissões aguardando confirmação ou interrompidas podem ser iniciadas.',
      });
    }

    const idsSelecionados = transmissao.itens.map(item => item.produtoId);
    if (idsSelecionados.length === 0) {
      throw new ValidationError({
        transmissaoId:
          'A transmissão não possui itens para enviar. Revise ou cancele a pré-transmissão.',
      });
    }

    return catalogoPrisma.$transaction(async tx => {
      if (transmissao.status === ProdutoTransmissaoStatus.AGUARDANDO_CONFIRMACAO) {
        const possuiRetificacao = transmissao.itens.some(
          item => item.operacao === ProdutoTransmissaoItemOperacao.RETIFICACAO
        );
        const preparacao = possuiRetificacao
          ? await this.validarItensPreTransmissaoSemInferirOperacao(
              transmissao.itens,
              transmissao.catalogoId,
              superUserId
            )
          : await this.validarSelecaoParaTransmissao(
              idsSelecionados,
              transmissao.catalogoId,
              superUserId
            );

        await this.prepararItensEBlocosParaFila(
          tx,
          transmissao.id,
          transmissao.itens,
          preparacao
        );

        await tx.produtoTransmissao.update({
          where: { id: transmissao.id },
          data: {
            status: ProdutoTransmissaoStatus.EM_FILA,
            totalItens: preparacao.itens.length,
            totalSucesso: 0,
            totalErro: 0,
            selecaoJson: preparacao.idsSelecionados as Prisma.InputJsonValue,
            asyncJobId: null,
            enfileiradaEm: transmissao.enfileiradaEm ?? new Date(),
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
      } else {
        await this.normalizarItensEmProcessamentoTx(transmissao.id, tx);
        await this.sincronizarBlocosTransmissao(transmissao.id, tx);

        const pendentes = await tx.produtoTransmissaoItem.count({
          where: {
            transmissaoId: transmissao.id,
            status: ProdutoTransmissaoItemStatus.PENDENTE,
          },
        });

        if (pendentes === 0) {
          throw new ValidationError({
            transmissaoId:
              'A transmissão interrompida não possui itens pendentes para retomada.',
          });
        }

        await tx.produtoTransmissao.update({
          where: { id: transmissao.id },
          data: {
            status: ProdutoTransmissaoStatus.EM_FILA,
            asyncJobId: null,
            concluidoEm: null,
            enfileiradaEm: transmissao.enfileiradaEm ?? transmissao.criadoEm,
          },
        });
      }

      const job = await this.dispararTransmissaoSeCabecaDaFila(
        tx,
        transmissao.id,
        transmissao.catalogoId,
        superUserId
      );

      const posicaoFilaCatalogo = await this.calcularPosicaoFilaCatalogoTx(
        tx,
        transmissao.catalogoId,
        transmissao.id
      );

      return {
        transmissaoId: transmissao.id,
        jobId: job?.id ?? null,
        posicaoFilaCatalogo,
      } satisfies ResultadoEnfileiramentoTransmissao;
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
        blocos: {
          orderBy: { ordem: 'asc' },
        },
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
        blocos: {
          orderBy: { ordem: 'asc' },
        },
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
          orderBy: [{ ordemExecucao: 'asc' }, { id: 'asc' }],
        },
      },
    });

    if (!transmissao) {
      return null;
    }

    const resposta = await this.mapearTransmissaoParaResposta(transmissao);
    return { ...resposta, blocos: transmissao.blocos, itens: transmissao.itens };
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
  ): Promise<ProdutoTransmissaoStatus> {
    const transmissao = await catalogoPrisma.produtoTransmissao.findUnique({
      where: { id: transmissaoId },
      include: {
        catalogo: true,
      },
    });

    if (!transmissao || transmissao.superUserId !== superUserId) {
      throw new Error('Transmissão não encontrada para o superusuário informado.');
    }

    if (
      transmissao.status !== ProdutoTransmissaoStatus.EM_FILA &&
      transmissao.status !== ProdutoTransmissaoStatus.PROCESSANDO
    ) {
      return transmissao.status;
    }

    const ids = this.converterSelecaoParaIds(transmissao.selecaoJson);

    if (!ids.length) {
      await this.marcarComoFalha(
        transmissao.id,
        'Nenhum produto encontrado para enviar.',
        heartbeat,
        jobId
      );
      return ProdutoTransmissaoStatus.FALHO;
    }

    const cpfCnpjRaiz = this.extrairCpfCnpjRaiz(transmissao.catalogo.cpf_cnpj);

    if (!cpfCnpjRaiz) {
      await this.marcarComoFalha(
        transmissao.id,
        'Catálogo sem CNPJ válido para transmissão.',
        heartbeat,
        jobId
      );
      return ProdutoTransmissaoStatus.FALHO;
    }

    await this.normalizarItensEmProcessamento(transmissao.id);
    const blocosPersistidos = await this.garantirBlocosPersistidos(transmissao.id);

    await catalogoPrisma.produtoTransmissao.update({
      where: { id: transmissao.id },
      data: {
        status: ProdutoTransmissaoStatus.PROCESSANDO,
        iniciadoEm: transmissao.iniciadoEm ?? new Date(),
        concluidoEm: null,
      },
    });

    if (jobId) {
      await registerJobLog(
        jobId,
        AsyncJobStatus.PROCESSANDO,
        'Preparando transmissão individual de produtos.'
      );
    }
    await heartbeat();

    const itensPersistidos = await catalogoPrisma.produtoTransmissaoItem.findMany({
      where: { transmissaoId: transmissao.id },
      orderBy: [{ ordemExecucao: 'asc' }, { id: 'asc' }],
    });

    if (itensPersistidos.length === 0) {
      await this.marcarComoFalha(
        transmissao.id,
        'Nenhum item de transmissão foi encontrado.',
        heartbeat,
        jobId
      );
      return ProdutoTransmissaoStatus.FALHO;
    }

    if (blocosPersistidos.length === 0) {
      await this.marcarComoFalha(
        transmissao.id,
        'Nenhum bloco de transmissão foi encontrado para processar a fila.',
        heartbeat,
        jobId
      );
      return ProdutoTransmissaoStatus.FALHO;
    }

    const produtos = await this.exportacaoService.buscarProdutosComAtributos(
      ids,
      transmissao.superUserId,
      transmissao.catalogoId
    );
    const produtosPorId = new Map(produtos.map(produto => [produto.id, produto]));
    const produtosExportados = this.exportacaoService.transformarParaSiscomex(produtos, {
      id: transmissao.catalogo.id,
      cpf_cnpj: transmissao.catalogo.cpf_cnpj ?? null,
    });
    const produtosExportadosPorId = new Map(
      produtosExportados.map(produto => [Number(produto.seq), produto])
    );

    const itensParaEnvio = this.montarPlanejamentoItens(
      itensPersistidos,
      produtosExportadosPorId,
      cpfCnpjRaiz
    );
    const planejamentoPorItemId = new Map(itensParaEnvio.map(item => [item.itemId, item]));

    await this.gerarPayloadEnvio(transmissao.id, transmissao.superUserId, itensParaEnvio);
    await heartbeat();

    if (jobId) {
      await registerJobLog(
        jobId,
        AsyncJobStatus.PROCESSANDO,
        `Payload de envio armazenado. ${itensParaEnvio.length} item(ns) elegível(is) para processamento.`
      );
    }

    const itensPorBlocoId = new Map<number, ItemTransmissaoPersistido[]>();
    for (const item of itensPersistidos) {
      if (!item.blocoId) {
        continue;
      }

      const itensBloco = itensPorBlocoId.get(item.blocoId) ?? [];
      itensBloco.push(item);
      itensPorBlocoId.set(item.blocoId, itensBloco);
    }

    let processadosNoCiclo = 0;

    for (const bloco of blocosPersistidos) {
      const itensBloco = (itensPorBlocoId.get(bloco.id) ?? []).sort((a, b) => {
        const ordemA = a.ordemExecucao ?? a.id;
        const ordemB = b.ordemExecucao ?? b.id;
        return ordemA - ordemB;
      });

      if (!itensBloco.some(item => item.status === ProdutoTransmissaoItemStatus.PENDENTE)) {
        await this.sincronizarResumoBloco(bloco.id);
        continue;
      }

      await this.marcarBlocoComoProcessando(bloco.id);
      await heartbeat();

      for (const item of itensBloco) {
        if (item.status !== ProdutoTransmissaoItemStatus.PENDENTE) {
          continue;
        }

        const planejamento = planejamentoPorItemId.get(item.id);

        if (!planejamento) {
          await this.marcarItemComoErro(
            transmissao.id,
            item.blocoId,
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
            item.blocoId,
            item.id,
            'Produto não encontrado no catálogo para processamento da transmissão.'
          );
          processadosNoCiclo += 1;
          continue;
        }

        const statusProduto = String(produtoAtual.status || '').toUpperCase();
        const situacaoProdutoAtual = String(produtoAtual.situacao || '').toUpperCase();
        const isRetificacao = planejamento.operacao === ProdutoTransmissaoItemOperacao.RETIFICACAO;

        if (
          isRetificacao &&
          statusProduto !== 'APROVADO' &&
          statusProduto !== 'TRANSMITIDO'
        ) {
          await this.marcarItemComoErro(
            transmissao.id,
            item.blocoId,
            item.id,
            `Produto não está apto para retificação. Status atual: ${statusProduto || 'desconhecido'}.`
          );
          processadosNoCiclo += 1;
          continue;
        }

        if (isRetificacao && situacaoProdutoAtual !== 'DESATIVADO') {
          await this.marcarItemComoErro(
            transmissao.id,
            item.blocoId,
            item.id,
            `Produto não está desativado para retificação. Situação atual: ${situacaoProdutoAtual || 'desconhecida'}.`
          );
          processadosNoCiclo += 1;
          continue;
        }

        if (!isRetificacao && statusProduto !== 'APROVADO') {
          await this.marcarItemComoErro(
            transmissao.id,
            item.blocoId,
            item.id,
            `Produto não está mais aprovado para transmissão. Status atual: ${statusProduto || 'desconhecido'}.`
          );
          processadosNoCiclo += 1;
          continue;
        }

        await this.marcarItemComoProcessando(transmissao.id, item.blocoId, item.id);
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
            atualizarCodigo: planejamento.operacao === ProdutoTransmissaoItemOperacao.INCLUSAO,
            tipoEventoHistorico: this.resolverTipoEventoHistoricoTransmissao(planejamento.operacao),
            transmissaoId: transmissao.id,
          });

          await this.marcarItemComoSucesso(
            transmissao.id,
            item.blocoId,
            item.id,
            resultado.codigoPersistencia,
            resultado.versao,
            resultado.situacao
          );
          processadosNoCiclo += 1;
        } else if (resultado.tipo === 'erro') {
          await this.marcarItemComoErro(
            transmissao.id,
            item.blocoId,
            item.id,
            resultado.mensagem
          );
          processadosNoCiclo += 1;
        } else {
          await this.interromperTransmissao(
            transmissao.id,
            item.blocoId,
            resultado.mensagem,
            jobId
          );
          await heartbeat();
          return ProdutoTransmissaoStatus.INTERROMPIDA;
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

      await this.sincronizarResumoBloco(bloco.id);
    }

    await this.finalizarTransmissao(transmissao.id, cpfCnpjRaiz, jobId);
    await heartbeat();

    const transmissaoFinal = await catalogoPrisma.produtoTransmissao.findUnique({
      where: { id: transmissao.id },
      select: { status: true },
    });

    return transmissaoFinal?.status ?? ProdutoTransmissaoStatus.CONCLUIDO;
  }

  private async prepararItensEBlocosParaFila(
    tx: Prisma.TransactionClient,
    transmissaoId: number,
    itensPersistidos: Array<{ id: number; produtoId: number }>,
    preparacao: PreparacaoTransmissaoValidada
  ) {
    const itensPorProdutoId = new Map(preparacao.itens.map(item => [item.produtoId, item]));
    let ordemExecucao = 1;

    for (const item of itensPersistidos) {
      const itemAtualizado = itensPorProdutoId.get(item.produtoId);

      if (!itemAtualizado) {
        throw new ValidationError({
          produtos: `O produto ${item.produtoId} não está mais elegível para transmissão.`,
        });
      }

      await tx.produtoTransmissaoItem.update({
        where: { id: item.id },
        data: {
          blocoId: null,
          ordemExecucao,
          operacao: itemAtualizado.operacao,
          status: ProdutoTransmissaoItemStatus.PENDENTE,
          mensagem: null,
          retornoCodigo: null,
          retornoVersao: null,
          retornoSituacao: null,
        },
      });

      ordemExecucao += 1;
    }

    const itensAtualizados = await tx.produtoTransmissaoItem.findMany({
      where: { transmissaoId },
      orderBy: [{ ordemExecucao: 'asc' }, { id: 'asc' }],
    });

    await this.recriarBlocosTransmissao(tx, transmissaoId, itensAtualizados);
    await this.sincronizarBlocosTransmissao(transmissaoId, tx);
  }

  private async recriarBlocosTransmissao(
    tx: Prisma.TransactionClient,
    transmissaoId: number,
    itensOrdenados: Array<{ id: number; ordemExecucao: number | null }>
  ) {
    await tx.produtoTransmissaoBloco.deleteMany({
      where: { transmissaoId },
    });

    let ordemBloco = 1;
    for (let indice = 0; indice < itensOrdenados.length; indice += this.transmissaoBlocoTamanho) {
      const lote = itensOrdenados.slice(indice, indice + this.transmissaoBlocoTamanho);
      const bloco = await tx.produtoTransmissaoBloco.create({
        data: {
          transmissaoId,
          ordem: ordemBloco,
          status: ProdutoTransmissaoBlocoStatus.PENDENTE,
          totalItens: lote.length,
          totalSucesso: 0,
          totalErro: 0,
          mensagem: null,
        },
      });

      await tx.produtoTransmissaoItem.updateMany({
        where: {
          id: { in: lote.map(item => item.id) },
        },
        data: {
          blocoId: bloco.id,
        },
      });

      ordemBloco += 1;
    }
  }

  private async garantirBlocosPersistidos(transmissaoId: number) {
    const blocosExistentes = await catalogoPrisma.produtoTransmissaoBloco.findMany({
      where: { transmissaoId },
      orderBy: { ordem: 'asc' },
    });

    if (blocosExistentes.length > 0) {
      return blocosExistentes;
    }

    await catalogoPrisma.$transaction(async tx => {
      const itens = await tx.produtoTransmissaoItem.findMany({
        where: { transmissaoId },
        orderBy: [{ ordemExecucao: 'asc' }, { id: 'asc' }],
      });

      if (itens.length === 0) {
        return;
      }

      let ordemExecucao = 1;
      for (const item of itens) {
        if (item.ordemExecucao !== ordemExecucao) {
          await tx.produtoTransmissaoItem.update({
            where: { id: item.id },
            data: { ordemExecucao },
          });
        }
        ordemExecucao += 1;
      }

      const itensAtualizados = await tx.produtoTransmissaoItem.findMany({
        where: { transmissaoId },
        orderBy: [{ ordemExecucao: 'asc' }, { id: 'asc' }],
      });

      await this.recriarBlocosTransmissao(tx, transmissaoId, itensAtualizados);
      await this.sincronizarBlocosTransmissao(transmissaoId, tx);
    });

    return catalogoPrisma.produtoTransmissaoBloco.findMany({
      where: { transmissaoId },
      orderBy: { ordem: 'asc' },
    });
  }

  private async listarFilaCatalogoTx(
    tx: Prisma.TransactionClient,
    catalogoId: number
  ) {
    return tx.produtoTransmissao.findMany({
      where: {
        catalogoId,
        status: { in: STATUS_TRANSMISSAO_FILA_CATALOGO },
      },
      orderBy: [{ enfileiradaEm: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        status: true,
        asyncJobId: true,
      },
    });
  }

  private async calcularPosicaoFilaCatalogoTx(
    tx: Prisma.TransactionClient,
    catalogoId: number,
    transmissaoId: number
  ) {
    const fila = await this.listarFilaCatalogoTx(tx, catalogoId);
    const indice = fila.findIndex(item => item.id === transmissaoId);
    return indice >= 0 ? indice + 1 : 0;
  }

  private async calcularPosicaoFilaCatalogo(catalogoId: number, transmissaoId: number) {
    return catalogoPrisma.$transaction(tx =>
      this.calcularPosicaoFilaCatalogoTx(tx, catalogoId, transmissaoId)
    );
  }

  private async dispararTransmissaoSeCabecaDaFila(
    tx: Prisma.TransactionClient,
    transmissaoId: number,
    catalogoId: number,
    superUserId: number
  ) {
    const fila = await this.listarFilaCatalogoTx(tx, catalogoId);
    const cabeca = fila[0];

    if (!cabeca || cabeca.id !== transmissaoId) {
      return null;
    }

    if (cabeca.status !== ProdutoTransmissaoStatus.EM_FILA) {
      return null;
    }

    if (cabeca.asyncJobId) {
      return { id: cabeca.asyncJobId };
    }

    const job = await createAsyncJob(
      {
        tipo: AsyncJobTipo.TRANSMISSAO_PRODUTO,
        payload: {
          transmissaoId,
          superUserId,
        },
      },
      tx
    );

    await tx.produtoTransmissao.update({
      where: { id: transmissaoId },
      data: {
        asyncJobId: job.id,
      },
    });

    return job;
  }

  private async marcarBlocoComoProcessando(blocoId: number) {
    await catalogoPrisma.produtoTransmissaoBloco.update({
      where: { id: blocoId },
      data: {
        status: ProdutoTransmissaoBlocoStatus.PROCESSANDO,
        mensagem: null,
        iniciadoEm: new Date(),
        concluidoEm: null,
      },
    });
  }

  private async interromperTransmissao(
    transmissaoId: number,
    blocoId: number | null,
    mensagem: string,
    jobId?: number
  ) {
    await catalogoPrisma.$transaction(async tx => {
      await tx.produtoTransmissaoItem.updateMany({
        where: {
          transmissaoId,
          status: ProdutoTransmissaoItemStatus.PROCESSANDO,
        },
        data: {
          status: ProdutoTransmissaoItemStatus.PENDENTE,
          mensagem,
        },
      });

      if (blocoId) {
        await tx.produtoTransmissaoBloco.update({
          where: { id: blocoId },
          data: {
            status: ProdutoTransmissaoBlocoStatus.INTERROMPIDO,
            mensagem,
            concluidoEm: null,
          },
        });
      }

      await tx.produtoTransmissao.update({
        where: { id: transmissaoId },
        data: {
          status: ProdutoTransmissaoStatus.INTERROMPIDA,
          asyncJobId: null,
          concluidoEm: null,
        },
      });

      await this.sincronizarBlocosTransmissao(transmissaoId, tx);
      await this.sincronizarTotaisTransmissao(transmissaoId, tx);
    });

    if (jobId) {
      await registerJobLog(jobId, AsyncJobStatus.FALHO, mensagem);
    }
  }

  private async sincronizarResumoBloco(
    blocoId: number,
    tx?: Prisma.TransactionClient
  ) {
    const prisma = tx ?? catalogoPrisma;
    const itens = await prisma.produtoTransmissaoItem.findMany({
      where: { blocoId },
      select: { status: true },
    });

    const totalItens = itens.length;
    const totalSucesso = itens.filter(item => item.status === ProdutoTransmissaoItemStatus.SUCESSO).length;
    const totalErro = itens.filter(item => item.status === ProdutoTransmissaoItemStatus.ERRO).length;
    const totalProcessando = itens.filter(
      item => item.status === ProdutoTransmissaoItemStatus.PROCESSANDO
    ).length;
    const totalPendentes = totalItens - totalSucesso - totalErro - totalProcessando;
    const status = this.determinarStatusBloco({
      totalItens,
      totalSucesso,
      totalErro,
      totalPendentes,
      totalProcessando,
    });

    const data: Prisma.ProdutoTransmissaoBlocoUpdateInput = {
      status,
      totalItens,
      totalSucesso,
      totalErro,
      concluidoEm: this.blocoConcluido(status) ? new Date() : null,
    };

    if (status !== ProdutoTransmissaoBlocoStatus.INTERROMPIDO) {
      data.mensagem = null;
    }

    await prisma.produtoTransmissaoBloco.update({
      where: { id: blocoId },
      data,
    });
  }

  private async sincronizarBlocosTransmissao(
    transmissaoId: number,
    tx?: Prisma.TransactionClient
  ) {
    const prisma = tx ?? catalogoPrisma;
    const blocos = await prisma.produtoTransmissaoBloco.findMany({
      where: { transmissaoId },
      select: { id: true },
      orderBy: { ordem: 'asc' },
    });

    for (const bloco of blocos) {
      if (tx) {
        await this.sincronizarResumoBloco(bloco.id, tx);
      } else {
        await this.sincronizarResumoBloco(bloco.id);
      }
    }
  }

  private determinarStatusBloco(dados: {
    totalItens: number;
    totalSucesso: number;
    totalErro: number;
    totalPendentes: number;
    totalProcessando: number;
  }) {
    if (dados.totalProcessando > 0) {
      return ProdutoTransmissaoBlocoStatus.PROCESSANDO;
    }

    if (dados.totalPendentes === dados.totalItens) {
      return ProdutoTransmissaoBlocoStatus.PENDENTE;
    }

    if (dados.totalPendentes > 0) {
      return ProdutoTransmissaoBlocoStatus.INTERROMPIDO;
    }

    if (dados.totalSucesso === dados.totalItens) {
      return ProdutoTransmissaoBlocoStatus.CONCLUIDO;
    }

    if (dados.totalErro === dados.totalItens) {
      return ProdutoTransmissaoBlocoStatus.FALHO;
    }

    return ProdutoTransmissaoBlocoStatus.PARCIAL;
  }

  private blocoConcluido(status: ProdutoTransmissaoBlocoStatus) {
    return (
      status === ProdutoTransmissaoBlocoStatus.CONCLUIDO ||
      status === ProdutoTransmissaoBlocoStatus.FALHO ||
      status === ProdutoTransmissaoBlocoStatus.PARCIAL
    );
  }

  private async normalizarItensEmProcessamentoTx(
    transmissaoId: number,
    tx: Prisma.TransactionClient
  ) {
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

    await this.sincronizarBlocosTransmissao(transmissaoId, tx);
    await this.sincronizarTotaisTransmissao(transmissaoId, tx);
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

  private async validarItensPreTransmissaoSemInferirOperacao(
    itensPersistidos: Array<{ produtoId: number; operacao: ProdutoTransmissaoItemOperacao }>,
    catalogoId: number,
    superUserId: number
  ): Promise<PreparacaoTransmissaoValidada> {
    if (!Number.isFinite(catalogoId)) {
      throw new ValidationError({ catalogoId: 'Catálogo selecionado é obrigatório para transmitir ao SISCOMEX' });
    }

    const idsSelecionados = [
      ...new Set(
        itensPersistidos
          .map(item => Number(item.produtoId))
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

    const idsInclusaoInvalidos: number[] = [];
    const idsNovaVersaoInvalidos: number[] = [];
    const idsNaoAprovados: number[] = [];
    const idsRetificacaoStatusInvalido: number[] = [];
    const idsRetificacaoSituacaoInvalida: number[] = [];
    const idsRetificacaoSemCodigo: number[] = [];
    const idsRetificacaoSemVersao: number[] = [];

    const itens = itensPersistidos.map(item => {
      const produto = produtosPorId.get(item.produtoId)!;
      const status = String(produto.status || '').toUpperCase();
      const situacao = String(produto.situacao || '').toUpperCase();
      const codigoNormalizado = this.normalizarCodigoSiscomex(produto.codigo);
      const versaoNormalizada = normalizarVersaoSiscomex(produto.versao);

      if (item.operacao === ProdutoTransmissaoItemOperacao.RETIFICACAO) {
        if (status !== 'APROVADO' && status !== 'TRANSMITIDO') {
          idsRetificacaoStatusInvalido.push(item.produtoId);
        }

        if (situacao !== 'DESATIVADO') {
          idsRetificacaoSituacaoInvalida.push(item.produtoId);
        }

        if (!codigoNormalizado) {
          idsRetificacaoSemCodigo.push(item.produtoId);
        }

        if (!versaoNormalizada) {
          idsRetificacaoSemVersao.push(item.produtoId);
        }
      } else {
        if (status !== 'APROVADO') {
          idsNaoAprovados.push(item.produtoId);
        }

        if (item.operacao === ProdutoTransmissaoItemOperacao.INCLUSAO && situacao !== 'RASCUNHO') {
          idsInclusaoInvalidos.push(item.produtoId);
        }

        if (
          item.operacao === ProdutoTransmissaoItemOperacao.NOVA_VERSAO &&
          (situacao !== 'ATIVADO' || !codigoNormalizado)
        ) {
          idsNovaVersaoInvalidos.push(item.produtoId);
        }
      }

      return {
        produtoId: item.produtoId,
        operacao: item.operacao,
      };
    });

    const erros: Record<string, string> = {};

    if (idsNaoAprovados.length > 0) {
      erros.status = `Somente produtos aprovados podem ser transmitidos. IDs inválidos: ${idsNaoAprovados.join(', ')}.`;
    }

    if (idsInclusaoInvalidos.length > 0) {
      erros.inclusao = `Produtos de inclusão precisam estar em situação RASCUNHO. IDs inválidos: ${idsInclusaoInvalidos.join(', ')}.`;
    }

    if (idsNovaVersaoInvalidos.length > 0) {
      erros.novaVersao = `Produtos de nova versão precisam estar ATIVADO e com código SISCOMEX válido. IDs inválidos: ${idsNovaVersaoInvalidos.join(', ')}.`;
    }

    if (idsRetificacaoStatusInvalido.length > 0) {
      erros.statusRetificacao = `Produtos de retificação precisam estar aprovados ou transmitidos. IDs inválidos: ${idsRetificacaoStatusInvalido.join(', ')}.`;
    }

    if (idsRetificacaoSituacaoInvalida.length > 0) {
      erros.situacaoRetificacao = `Produtos de retificação precisam estar DESATIVADO. IDs inválidos: ${idsRetificacaoSituacaoInvalida.join(', ')}.`;
    }

    if (idsRetificacaoSemCodigo.length > 0) {
      erros.codigoRetificacao = `Produtos de retificação precisam ter código SISCOMEX. IDs inválidos: ${idsRetificacaoSemCodigo.join(', ')}.`;
    }

    if (idsRetificacaoSemVersao.length > 0) {
      erros.versaoRetificacao = `Produtos de retificação precisam ter versão SISCOMEX válida. IDs inválidos: ${idsRetificacaoSemVersao.join(', ')}.`;
    }

    if (Object.keys(erros).length > 0) {
      throw new ValidationError(erros);
    }

    return {
      catalogoId,
      cpfCnpjRaiz,
      idsSelecionados,
      itens,
    };
  }

  private montarPlanejamentoItens(
    itensPersistidos: ItemTransmissaoPersistido[],
    produtosExportadosPorId: Map<number, ProdutoExportacaoProdutoDTO>,
    cpfCnpjRaiz: string
  ): PlanejamentoItemTransmissao[] {
    return itensPersistidos
      .flatMap(item => {
        const produtoExportado = produtosExportadosPorId.get(item.produtoId);
        if (!produtoExportado) {
          return [];
        }

        const payloadContratoAtual = this.montarPayloadProdutoSiscomex(produtoExportado);
        const payloadInclusao = { ...payloadContratoAtual };
        const payloadAtualizacaoVersao = { ...payloadContratoAtual };
        const payloadRetificacao = this.aplicarEspacoTemporarioDescricaoRetificacao(payloadContratoAtual);

        const codigoNormalizado = this.normalizarCodigoSiscomex(produtoExportado.codigo);
        const versaoNormalizada = normalizarVersaoSiscomex(produtoExportado.versao);
        const operacao = item.operacao;

        if (operacao === ProdutoTransmissaoItemOperacao.NOVA_VERSAO && !codigoNormalizado) {
          return [];
        }

        if (
          operacao === ProdutoTransmissaoItemOperacao.RETIFICACAO &&
          (!codigoNormalizado || !versaoNormalizada)
        ) {
          return [];
        }

        return [
          {
            itemId: item.id,
            blocoId: item.blocoId,
            ordemExecucao: item.ordemExecucao,
            produtoId: item.produtoId,
            operacao,
            codigo: codigoNormalizado,
            versao: versaoNormalizada,
            endpoint:
              operacao === ProdutoTransmissaoItemOperacao.RETIFICACAO
                ? `/ext/produto/${encodeURIComponent(cpfCnpjRaiz)}/${encodeURIComponent(codigoNormalizado!)}/${encodeURIComponent(versaoNormalizada!)}`
                : operacao === ProdutoTransmissaoItemOperacao.NOVA_VERSAO
                  ? `/ext/produto/${encodeURIComponent(cpfCnpjRaiz)}/${encodeURIComponent(codigoNormalizado!)}`
                  : `/ext/produto/${encodeURIComponent(cpfCnpjRaiz)}`,
            payload:
              operacao === ProdutoTransmissaoItemOperacao.RETIFICACAO
                ? payloadRetificacao
                : operacao === ProdutoTransmissaoItemOperacao.NOVA_VERSAO
                  ? payloadAtualizacaoVersao
                  : payloadInclusao,
          },
        ];
      });
  }

  private aplicarEspacoTemporarioDescricaoRetificacao(payload: Record<string, any>) {
    const descricao = typeof payload.descricao === 'string' ? payload.descricao : '';
    const descricaoComEspacoExtra = descricao.replace(/(\S)(\s+)(?=\S)/, '$1$2 ');

    return {
      ...payload,
      descricao: descricaoComEspacoExtra,
    };
  }

  private montarPayloadProdutoSiscomex(produtoExportado: ProdutoExportacaoProdutoDTO) {
    // O endpoint novo do CATP rejeita metadados do contrato legado, como seq e situacao.
    const {
      catalogoId: _catalogoId,
      seq: _seq,
      codigo: _codigo,
      versao: _versao,
      cpfCnpjRaiz: _cpfCnpjRaiz,
      situacao: _situacao,
      ...payload
    } = produtoExportado;

    return payload;
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
      blocoId: item.blocoId,
      ordemExecucao: item.ordemExecucao,
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
          params.item.operacao === ProdutoTransmissaoItemOperacao.RETIFICACAO
            ? await params.cliente.retificarProduto(
                params.cpfCnpjRaiz,
                params.item.codigo!,
                params.item.versao!,
                params.item.payload as any
              )
            : params.item.operacao === ProdutoTransmissaoItemOperacao.NOVA_VERSAO
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
    const versaoSiscomex = normalizarVersaoSiscomex(payload.versao);

    if (!versaoSiscomex) {
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
      item.operacao === ProdutoTransmissaoItemOperacao.NOVA_VERSAO ||
      item.operacao === ProdutoTransmissaoItemOperacao.RETIFICACAO
        ? item.codigo
        : codigoRetornado;

    return {
      tipo: 'sucesso',
      mensagem: null,
      codigoPersistencia,
      versao: versaoSiscomex,
      situacao: situacaoProduto,
      retorno: {
        produtoId: item.produtoId,
        operacao: item.operacao,
        status: 'SUCESSO',
        endpoint: item.endpoint,
        mensagem: null,
        retorno: {
          codigo: codigoPersistencia,
          versao: versaoSiscomex,
          situacao: situacaoProduto,
        },
      },
    };
  }

  private resolverTipoEventoHistoricoTransmissao(
    operacao: ProdutoTransmissaoItemOperacao
  ): ProdutoHistoricoTipoEvento {
    if (operacao === ProdutoTransmissaoItemOperacao.INCLUSAO) {
      return 'CRIACAO';
    }

    if (operacao === ProdutoTransmissaoItemOperacao.RETIFICACAO) {
      return 'RETIFICACAO';
    }

    return 'ATUALIZACAO';
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

  private async marcarItemComoProcessando(
    transmissaoId: number,
    blocoId: number | null,
    itemId: number
  ) {
    await catalogoPrisma.$transaction(async tx => {
      await tx.produtoTransmissaoItem.update({
        where: { id: itemId },
        data: {
          status: ProdutoTransmissaoItemStatus.PROCESSANDO,
          mensagem: null,
        },
      });

      if (blocoId) {
        await this.sincronizarResumoBloco(blocoId, tx);
      }
      await this.sincronizarTotaisTransmissao(transmissaoId, tx);
    });
  }

  private async marcarItemComoSucesso(
    transmissaoId: number,
    blocoId: number | null,
    itemId: number,
    codigo: string | null,
    versao: string,
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

      if (blocoId) {
        await this.sincronizarResumoBloco(blocoId, tx);
      }
      await this.sincronizarTotaisTransmissao(transmissaoId, tx);
    });
  }

  private async marcarItemComoErro(
    transmissaoId: number,
    blocoId: number | null,
    itemId: number,
    mensagem: string
  ) {
    await catalogoPrisma.$transaction(async tx => {
      await tx.produtoTransmissaoItem.update({
        where: { id: itemId },
        data: {
          status: ProdutoTransmissaoItemStatus.ERRO,
          mensagem,
        },
      });

      if (blocoId) {
        await this.sincronizarResumoBloco(blocoId, tx);
      }
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

      await this.sincronizarBlocosTransmissao(transmissaoId, tx);
      await this.sincronizarTotaisTransmissao(transmissaoId, tx);
    });
  }

  private async normalizarItensEmProcessamento(transmissaoId: number) {
    await catalogoPrisma.$transaction(async tx => {
      await this.normalizarItensEmProcessamentoTx(transmissaoId, tx);
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
    await catalogoPrisma.$transaction(async tx => {
      await this.sincronizarBlocosTransmissao(transmissaoId, tx);
      await this.sincronizarTotaisTransmissao(transmissaoId, tx);
    });

    const transmissao = await catalogoPrisma.produtoTransmissao.findUnique({
      where: { id: transmissaoId },
      include: {
        blocos: {
          orderBy: { ordem: 'asc' },
        },
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
          orderBy: [{ ordemExecucao: 'asc' }, { id: 'asc' }],
        },
      },
    });

    if (!transmissao) {
      return;
    }

    const totalItens = transmissao.itens.length;
    const totalSucesso = transmissao.itens.filter(
      item => item.status === ProdutoTransmissaoItemStatus.SUCESSO
    ).length;
    const totalErro = transmissao.itens.filter(
      item => item.status === ProdutoTransmissaoItemStatus.ERRO
    ).length;
    const totalPendentes = transmissao.itens.filter(
      item =>
        item.status === ProdutoTransmissaoItemStatus.PENDENTE ||
        item.status === ProdutoTransmissaoItemStatus.PROCESSANDO
    ).length;

    if (totalPendentes > 0) {
      return;
    }

    const statusFinal =
      totalSucesso === totalItens
        ? ProdutoTransmissaoStatus.CONCLUIDO
        : totalErro === totalItens
          ? ProdutoTransmissaoStatus.FALHO
          : ProdutoTransmissaoStatus.PARCIAL;

    const provider = storageFactory();
    const caminhoCompleto = `${await this.resolverDiretorioTransmissao(transmissaoId)}/payload-retorno.json`;
    const retorno = transmissao.itens.map<RetornoItemTransmissao>(item => ({
      produtoId: item.produtoId,
      blocoId: item.blocoId ?? null,
      ordemExecucao: item.ordemExecucao ?? null,
      operacao: item.operacao,
      status: item.status === ProdutoTransmissaoItemStatus.SUCESSO ? 'SUCESSO' : 'ERRO',
      endpoint:
        item.operacao === ProdutoTransmissaoItemOperacao.RETIFICACAO
          ? this.normalizarCodigoSiscomex(item.retornoCodigo ?? item.produto?.codigo) && item.retornoVersao
            ? `/ext/produto/${encodeURIComponent(cpfCnpjRaiz)}/${encodeURIComponent(this.normalizarCodigoSiscomex(item.retornoCodigo ?? item.produto?.codigo)!)}/${encodeURIComponent(item.retornoVersao)}`
            : null
          : item.operacao === ProdutoTransmissaoItemOperacao.NOVA_VERSAO
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

    await this.dispararProximaTransmissaoCatalogo(transmissao.catalogoId, transmissao.superUserId);
  }

  private async dispararProximaTransmissaoCatalogo(catalogoId: number, superUserId: number) {
    await catalogoPrisma.$transaction(async tx => {
      const fila = await this.listarFilaCatalogoTx(tx, catalogoId);
      const proxima = fila[0];

      if (!proxima || proxima.status !== ProdutoTransmissaoStatus.EM_FILA || proxima.asyncJobId) {
        return;
      }

      const job = await createAsyncJob(
        {
          tipo: AsyncJobTipo.TRANSMISSAO_PRODUTO,
          payload: {
            transmissaoId: proxima.id,
            superUserId,
          },
        },
        tx
      );

      await tx.produtoTransmissao.update({
        where: { id: proxima.id },
        data: {
          asyncJobId: job.id,
        },
      });
    });
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
    const blocos = Array.isArray(transmissao.blocos) ? transmissao.blocos : [];

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

    const filaCatalogoPosicao = STATUS_TRANSMISSAO_FILA_CATALOGO.includes(transmissao.status)
      ? await this.calcularPosicaoFilaCatalogo(transmissao.catalogoId, transmissao.id)
      : null;
    const blocoAtual =
      blocos.find((bloco: any) => bloco.status === ProdutoTransmissaoBlocoStatus.PROCESSANDO) ??
      blocos.find((bloco: any) => bloco.status === ProdutoTransmissaoBlocoStatus.INTERROMPIDO) ??
      blocos.find((bloco: any) => bloco.status === ProdutoTransmissaoBlocoStatus.PENDENTE) ??
      null;
    const blocosConcluidos = blocos.filter((bloco: any) => this.blocoConcluido(bloco.status)).length;

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
      itensPendentes: Math.max(
        0,
        Number(transmissao.totalItens || 0) -
          Number(transmissao.totalSucesso || 0) -
          Number(transmissao.totalErro || 0)
      ),
      enfileiradaEm: transmissao.enfileiradaEm ?? null,
      filaCatalogoPosicao,
      totalBlocos: blocos.length,
      blocosConcluidos,
      blocoAtual: blocoAtual
        ? {
            id: blocoAtual.id,
            ordem: blocoAtual.ordem,
            status: blocoAtual.status,
            totalItens: blocoAtual.totalItens,
            totalSucesso: blocoAtual.totalSucesso,
            totalErro: blocoAtual.totalErro,
            mensagem: blocoAtual.mensagem ?? null,
            iniciadoEm: blocoAtual.iniciadoEm ?? null,
            concluidoEm: blocoAtual.concluidoEm ?? null,
          }
        : null,
      blocos: blocos.map((bloco: any) => ({
        id: bloco.id,
        ordem: bloco.ordem,
        status: bloco.status,
        totalItens: bloco.totalItens,
        totalSucesso: bloco.totalSucesso,
        totalErro: bloco.totalErro,
        mensagem: bloco.mensagem ?? null,
        iniciadoEm: bloco.iniciadoEm ?? null,
        concluidoEm: bloco.concluidoEm ?? null,
      })) as ResumoBlocoTransmissao[],
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
