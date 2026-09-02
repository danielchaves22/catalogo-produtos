// backend/src/services/produto.service.ts
import { catalogoPrisma } from '../utils/prisma';
import { logger } from '../utils/logger';
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
import {
  AtributoLegacyService,
  AtributoEstruturaDTO,
  EstruturaComVersao
} from './atributo-legacy.service';
import { ValidationError } from '../types/validation-error';
import {
  calcularResumoProduto,
  flattenEstrutura,
  ProdutoResumoValores,
  ProdutoResumoService,
} from './produto-resumo.service';
import { ResultadoVerificacao } from '../jobs/handlers/verificacao-atributos-ncm.handler';
import {
  DeltaHistoricoProduto,
  gerarDeltaHistoricoProduto,
  gerarResumoDelta,
  normalizarProdutoParaHistorico
} from '../utils/produto-historico-diff';
import {
  compararVersoesSiscomex,
  normalizarVersaoSiscomex,
  ProdutoHistoricoTipoEvento,
  resolverTipoEventoHistoricoSiscomex,
} from '../utils/versao-siscomex';
import {
  condicaoAtributoAtendida,
  filtrarValoresAtributosVisiveis,
  valoresComoArrayCondicional
} from '../utils/atributo-condicional';
import { createAsyncJob } from '../jobs/async-job.repository';
import {
  ProdutoStatusRegra,
  resolverStatusInicialProduto,
  resolverStatusProduto
} from '../utils/produto-status';
import { normalizarAtributosProdutoPorVersao } from '../utils/produto-atributo-normalizacao';
import { STATUS_TRANSMISSAO_ABERTA } from '../constants/transmissao-status';

export interface CreateProdutoDTO {
  codigo?: string;
  versao?: string | number | null;
  ncmCodigo: string;
  modalidade: string;
  catalogoId: number;
  denominacao: string;
  descricao: string;
  valoresAtributos?: Prisma.InputJsonValue;
  codigosInternos?: string[];
  operadoresEstrangeiros?: OperadorEstrangeiroProdutoInput[];
  criadoPor?: string;
  status?:
    | 'PENDENTE'
    | 'APROVADO'
    | 'PROCESSANDO'
    | 'TRANSMITIDO'
    | 'ERRO'
    | 'AJUSTAR_ESTRUTURA';
  situacao?: 'RASCUNHO' | 'ATIVADO' | 'DESATIVADO';
}

export interface UpdateProdutoDTO {
  modalidade?: string;
  status?:
    | 'PENDENTE'
    | 'APROVADO'
    | 'PROCESSANDO'
    | 'TRANSMITIDO'
    | 'ERRO'
    | 'AJUSTAR_ESTRUTURA';
  situacao?: 'RASCUNHO' | 'ATIVADO' | 'DESATIVADO';
  denominacao?: string;
  descricao?: string;
  valoresAtributos?: Prisma.InputJsonValue;
  codigosInternos?: string[];
  operadoresEstrangeiros?: OperadorEstrangeiroProdutoInput[];
  atualizadoPor?: string;
}

interface AtualizarProdutoOpcoes {
  permitirProdutoDesativado?: boolean;
  exigirDenominacaoAlterada?: boolean;
  exigirStatusAprovadoAposAtualizacao?: boolean;
}

export interface OperadorEstrangeiroProdutoInput {
  paisCodigo: string;
  conhecido: boolean;
  operadorEstrangeiroId?: number;
}

export interface CloneProdutoDTO {
  catalogoId: number;
  denominacao: string;
  codigosInternos?: string[];
}

export interface ListarProdutosFiltro {
  status?: Array<
    'PENDENTE' | 'APROVADO' | 'PROCESSANDO' | 'TRANSMITIDO' | 'ERRO' | 'AJUSTAR_ESTRUTURA'
  >;
  situacoes?: Array<'RASCUNHO' | 'ATIVADO' | 'DESATIVADO'>;
  ncm?: string;
  catalogoId?: number;
  busca?: string;
}

export interface ProdutoListItemDTO {
  id: number;
  codigo: string | null;
  ncmCodigo: string;
  status:
    | 'PENDENTE'
    | 'APROVADO'
    | 'PROCESSANDO'
    | 'TRANSMITIDO'
    | 'ERRO'
    | 'AJUSTAR_ESTRUTURA';
  situacao: 'RASCUNHO' | 'ATIVADO' | 'DESATIVADO';
  modalidade: string | null;
  denominacao: string;
  descricao: string;
  atualizadoEm: Date;
  catalogoId: number;
  catalogoNumero?: number | null;
  catalogoNome?: string | null;
  catalogoCpfCnpj?: string | null;
  catalogoAmbiente?: 'HOMOLOGACAO' | 'PRODUCAO' | null;
  codigosInternos: string[];
}

export interface ListarProdutosPaginacao {
  page?: number;
  pageSize?: number;
}

export interface ListarProdutosResponse {
  items: ProdutoListItemDTO[];
  total: number;
  page: number;
  pageSize: number;
}

export interface RemoverProdutosEmMassaDTO {
  todosFiltrados: boolean;
  idsSelecionados?: number[];
  idsDeselecionados?: number[];
  filtros?: ListarProdutosFiltro;
  busca?: string;
}

export interface ProdutoBloqueioExclusaoDTO {
  id: number;
  motivo: string;
}

export interface RemoverProdutosEmMassaResultadoDTO {
  removidos: number;
  bloqueados: ProdutoBloqueioExclusaoDTO[];
  totalSolicitado: number;
}

export interface PendenciaAjusteEstruturaCatalogoDTO {
  catalogoId: number;
  catalogoNome: string | null;
  produtos: Array<{ id: number; denominacao: string }>;
}

export interface PendenciaAjusteEstruturaDTO {
  ncmCodigo: string;
  modalidade: string;
  diferencas?: ResultadoVerificacao['diferencas'];
  catalogos: PendenciaAjusteEstruturaCatalogoDTO[];
}

interface ProdutoPendenciaAjusteEstruturaRow {
  id: number;
  denominacao: string;
  ncmCodigo: string;
  modalidade: string | null;
  catalogoId: number;
  versaoEstruturaAtributos: number | null;
  versaoAtributoId: number | null;
  catalogo: { nome: string | null } | null;
}

export interface TransmissaoGeradaAjusteEstruturaDTO {
  id: number;
  totalItens: number;
}

export interface AjusteEstruturaCatalogoResultadoDTO {
  ajustados: number;
  transmissaoGerada: TransmissaoGeradaAjusteEstruturaDTO | null;
  produtosElegiveis: number;
  produtosIncluidos: number;
  produtosIgnoradosDuplicidade: number;
}

export interface AplicacaoAjusteEstruturaNcmResultadoDTO {
  produtosAnalisados: number;
  produtosMarcados: number;
  produtosSincronizados: number;
}

export interface AjusteEstruturaCatalogoJobPayload {
  superUserId: number;
  catalogoId: number;
  ncmCodigo: string;
  modalidade: string;
}

export interface SolicitarAjusteEstruturaCatalogoResultadoDTO {
  jobId: number;
  reutilizado: boolean;
  status: AsyncJobStatus;
}

export interface CorrecaoStatusAjusteEstruturaJobPayload {
  superUserId: number;
  produtoIds?: number[];
  quantidadeInicialAjustarEstrutura?: number;
}

export interface SolicitarCorrecaoStatusAjusteEstruturaResultadoDTO {
  jobId: number;
  status: AsyncJobStatus;
}

export interface CorrecaoStatusAjusteEstruturaResultadoDTO {
  totalAnalisados: number;
  mantidosAjuste: number;
  restauradosPendente: number;
  restauradosAprovado: number;
  restauradosTransmitido: number;
  sincronizadosVersao: number;
}

interface OrigemTransmissaoAjusteEstruturaContexto {
  ncmCodigo: string;
  modalidade: string;
  catalogoId: number;
  produtoIdsElegiveis: number[];
  produtoIdsIgnoradosDuplicidade: number[];
}

interface PreparacaoTransmissaoAutomaticaResultado {
  transmissaoGerada: TransmissaoGeradaAjusteEstruturaDTO | null;
  produtoIdsIncluidos: number[];
  produtoIdsIgnoradosDuplicidade: number[];
}

export interface ProdutoHistoricoVersaoDTO {
  id: number;
  versaoSiscomex: string;
  tipoEvento: string;
  resumo: string | null;
  delta: DeltaHistoricoProduto | null;
  criadoEm: Date;
}

export class ProdutoService {
  private static readonly ESTRUTURA_CACHE_REVALIDACAO_MS = 30 * 1000; // 30 segundos
  private static readonly AJUSTE_ESTRUTURA_TRANSACTION_TIMEOUT_MS = 10 * 60 * 1000;
  private static readonly CORRECAO_STATUS_AJUSTE_ESTRUTURA_BATCH_SIZE = 100;
  private static estruturaCache = new Map<
    string,
    { dados: EstruturaComVersao; proximaVerificacao: number }
  >();
  private static invalidacaoRegistrada = false;

  constructor(
    private readonly atributosService = new AtributoLegacyService(),
    private readonly produtoResumoService = new ProdutoResumoService()
  ) {
    ProdutoService.registrarInvalidacaoCache();
  }

  private normalizarCodigoSiscomex(codigo?: string | null) {
    if (codigo === null || codigo === undefined) {
      return null;
    }

    const valor = String(codigo).trim();
    return valor.length > 0 ? valor : null;
  }

  private serializarJsonEstavel(valor: unknown): string {
    const normalizar = (entrada: unknown): unknown => {
      if (Array.isArray(entrada)) {
        return entrada.map(item => normalizar(item));
      }

      if (entrada && typeof entrada === 'object') {
        const objeto = entrada as Record<string, unknown>;
        const chaves = Object.keys(objeto).sort();
        return chaves.reduce<Record<string, unknown>>((acc, chave) => {
          acc[chave] = normalizar(objeto[chave]);
          return acc;
        }, {});
      }

      return entrada;
    };

    return JSON.stringify(normalizar(valor));
  }

  private serializarMapaValores(valores: Record<string, any>): string {
    const preenchidos = Object.entries(valores)
      .filter(([, valor]) => this.normalizarValorEntrada(valor).length > 0)
      .reduce<Record<string, unknown>>((acc, [codigo, valor]) => {
        acc[codigo] = valor;
        return acc;
      }, {});

    return this.serializarJsonEstavel(preenchidos);
  }

  private montarChaveNcmModalidade(ncmCodigo: string, modalidade?: string | null) {
    return `${ncmCodigo}|${modalidade?.trim() ?? ''}`;
  }

  private normalizarModalidadeAjusteEstrutura(modalidade?: string | null) {
    return modalidade?.trim() ?? '';
  }

  private montarFiltroModalidadeAjusteEstrutura(modalidade: string): Prisma.ProdutoWhereInput {
    return modalidade.length > 0
      ? { modalidade }
      : {
          OR: [{ modalidade: null }, { modalidade: '' }],
        };
  }

  private async encontrarJobAjusteEstruturaCatalogoAtivo(
    payload: AjusteEstruturaCatalogoJobPayload
  ): Promise<{ id: number; status: AsyncJobStatus } | null> {
    return catalogoPrisma.asyncJob.findFirst({
      where: {
        tipo: AsyncJobTipo.AJUSTE_ESTRUTURA_CATALOGO,
        status: { in: [AsyncJobStatus.PENDENTE, AsyncJobStatus.PROCESSANDO] },
        AND: [
          { payload: { path: '$.superUserId', equals: payload.superUserId } },
          { payload: { path: '$.catalogoId', equals: payload.catalogoId } },
          { payload: { path: '$.ncmCodigo', equals: payload.ncmCodigo } },
          { payload: { path: '$.modalidade', equals: payload.modalidade } },
        ],
      },
      select: {
        id: true,
        status: true,
      },
    });
  }

  private async carregarProdutosPendentesAjusteEstrutura(
    superUserId: number
  ): Promise<ProdutoPendenciaAjusteEstruturaRow[]> {
    return catalogoPrisma.produto.findMany({
      where: { status: 'AJUSTAR_ESTRUTURA', catalogo: { superUserId } },
      select: {
        id: true,
        denominacao: true,
        ncmCodigo: true,
        modalidade: true,
        catalogoId: true,
        versaoEstruturaAtributos: true,
        versaoAtributoId: true,
        catalogo: { select: { nome: true } },
      },
      orderBy: [
        { ncmCodigo: 'asc' },
        { catalogoId: 'asc' },
        { denominacao: 'asc' },
      ],
    });
  }

  private async listarProdutosPendentesAjusteEstrutura(
    superUserId: number
  ): Promise<ProdutoPendenciaAjusteEstruturaRow[]> {
    return this.carregarProdutosPendentesAjusteEstrutura(superUserId);
  }

  private produtoJaTransmitidoParaRegras(produto: {
    situacao: 'RASCUNHO' | 'ATIVADO' | 'DESATIVADO';
    codigo?: string | null;
  }) {
    const codigoSiscomex = this.normalizarCodigoSiscomex(produto.codigo);
    return produto.situacao !== 'RASCUNHO' && codigoSiscomex !== null;
  }

  private obterMotivoBloqueioExclusao(produto: {
    situacao: 'RASCUNHO' | 'ATIVADO' | 'DESATIVADO';
    codigo?: string | null;
  }) {
    if (this.produtoJaTransmitidoParaRegras(produto)) {
      return 'Produto transmitido nao pode ser excluido. Utilize a inativacao no SISCOMEX.';
    }

    return null;
  }

  private obterMotivoBloqueioTransmissaoExclusao() {
    return 'Produto possui item de transmissao em andamento ou concluido com sucesso e nao pode ser excluido.';
  }

  private itemTransmissaoRemovivelNaExclusao(item: {
    status: ProdutoTransmissaoItemStatus;
    transmissao: { status: ProdutoTransmissaoStatus };
  }) {
    if (
      item.transmissao.status === ProdutoTransmissaoStatus.AGUARDANDO_CONFIRMACAO &&
      item.status === ProdutoTransmissaoItemStatus.PENDENTE
    ) {
      return true;
    }

    if (
      item.transmissao.status === ProdutoTransmissaoStatus.CANCELADA &&
      (item.status === ProdutoTransmissaoItemStatus.PENDENTE ||
        item.status === ProdutoTransmissaoItemStatus.ERRO)
    ) {
      return true;
    }

    return (
      this.transmissaoTerminalComRetorno(item.transmissao.status) &&
      item.status === ProdutoTransmissaoItemStatus.ERRO
    );
  }

  private transmissaoTerminalComRetorno(status: ProdutoTransmissaoStatus) {
    return (
      status === ProdutoTransmissaoStatus.CONCLUIDO ||
      status === ProdutoTransmissaoStatus.FALHO ||
      status === ProdutoTransmissaoStatus.PARCIAL
    );
  }

  private determinarStatusTransmissaoAposExclusao(dados: {
    totalItens: number;
    totalSucesso: number;
    totalErro: number;
  }) {
    if (dados.totalSucesso === dados.totalItens) {
      return ProdutoTransmissaoStatus.CONCLUIDO;
    }

    if (dados.totalErro === dados.totalItens) {
      return ProdutoTransmissaoStatus.FALHO;
    }

    return ProdutoTransmissaoStatus.PARCIAL;
  }

  private determinarStatusBlocoTransmissaoAposExclusao(dados: {
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

  private blocoTransmissaoConcluidoAposExclusao(status: ProdutoTransmissaoBlocoStatus) {
    return (
      status === ProdutoTransmissaoBlocoStatus.CONCLUIDO ||
      status === ProdutoTransmissaoBlocoStatus.FALHO ||
      status === ProdutoTransmissaoBlocoStatus.PARCIAL
    );
  }

  private async sincronizarBlocosAposRemoverItensTransmissao(
    tx: Prisma.TransactionClient,
    blocoIds: number[]
  ) {
    const idsUnicos = Array.from(new Set(blocoIds));

    for (const blocoId of idsUnicos) {
      const itens = await tx.produtoTransmissaoItem.findMany({
        where: { blocoId },
        select: { status: true },
      });

      if (itens.length === 0) {
        await tx.produtoTransmissaoBloco.delete({ where: { id: blocoId } });
        continue;
      }

      const totalItens = itens.length;
      const totalSucesso = itens.filter(item => item.status === ProdutoTransmissaoItemStatus.SUCESSO).length;
      const totalErro = itens.filter(item => item.status === ProdutoTransmissaoItemStatus.ERRO).length;
      const totalProcessando = itens.filter(item => item.status === ProdutoTransmissaoItemStatus.PROCESSANDO).length;
      const totalPendentes = totalItens - totalSucesso - totalErro - totalProcessando;
      const status = this.determinarStatusBlocoTransmissaoAposExclusao({
        totalItens,
        totalSucesso,
        totalErro,
        totalPendentes,
        totalProcessando,
      });

      await tx.produtoTransmissaoBloco.update({
        where: { id: blocoId },
        data: {
          status,
          totalItens,
          totalSucesso,
          totalErro,
          concluidoEm: this.blocoTransmissaoConcluidoAposExclusao(status) ? new Date() : null,
        },
      });
    }
  }

  private async sincronizarTransmissoesAposRemoverItensTransmissao(
    tx: Prisma.TransactionClient,
    transmissaoIds: number[]
  ) {
    const idsUnicos = Array.from(new Set(transmissaoIds));

    for (const transmissaoId of idsUnicos) {
      const itens = await tx.produtoTransmissaoItem.findMany({
        where: { transmissaoId },
        select: { id: true, produtoId: true, status: true, ordemExecucao: true },
        orderBy: [{ ordemExecucao: 'asc' }, { id: 'asc' }],
      });

      const totalSucesso = itens.filter(item => item.status === ProdutoTransmissaoItemStatus.SUCESSO).length;
      const totalErro = itens.filter(item => item.status === ProdutoTransmissaoItemStatus.ERRO).length;
      const data: Prisma.ProdutoTransmissaoUpdateInput = {
        totalItens: itens.length,
        totalSucesso,
        totalErro,
        selecaoJson: itens.map(item => item.produtoId) as Prisma.InputJsonValue,
      };

      if (itens.length > 0) {
        const transmissao = await tx.produtoTransmissao.findUnique({
          where: { id: transmissaoId },
          select: { status: true },
        });

        if (transmissao && this.transmissaoTerminalComRetorno(transmissao.status)) {
          data.status = this.determinarStatusTransmissaoAposExclusao({
            totalItens: itens.length,
            totalSucesso,
            totalErro,
          });
        }
      }

      await tx.produtoTransmissao.update({
        where: { id: transmissaoId },
        data,
      });
    }
  }

  private async prepararVinculosTransmissaoParaExclusao(
    tx: Prisma.TransactionClient,
    produtoIds: number[]
  ): Promise<{
    idsLiberados: number[];
    bloqueados: ProdutoBloqueioExclusaoDTO[];
  }> {
    const idsUnicos = Array.from(new Set(produtoIds));

    if (idsUnicos.length === 0) {
      return { idsLiberados: [], bloqueados: [] };
    }

    const itens = await tx.produtoTransmissaoItem.findMany({
      where: { produtoId: { in: idsUnicos } },
      select: {
        id: true,
        produtoId: true,
        transmissaoId: true,
        blocoId: true,
        status: true,
        transmissao: {
          select: { status: true },
        },
      },
    });

    const idsBloqueados = new Set<number>();
    for (const item of itens) {
      if (!this.itemTransmissaoRemovivelNaExclusao(item)) {
        idsBloqueados.add(item.produtoId);
      }
    }

    const motivoBloqueio = this.obterMotivoBloqueioTransmissaoExclusao();
    const bloqueados = idsUnicos
      .filter(id => idsBloqueados.has(id))
      .map(id => ({ id, motivo: motivoBloqueio }));
    const idsLiberados = idsUnicos.filter(id => !idsBloqueados.has(id));

    const idsLiberadosSet = new Set(idsLiberados);
    const itensRemoviveis = itens.filter(item => idsLiberadosSet.has(item.produtoId));

    if (itensRemoviveis.length > 0) {
      const itemIds = itensRemoviveis.map(item => item.id);
      const blocoIds = itensRemoviveis
        .map(item => item.blocoId)
        .filter((id): id is number => id !== null);
      const transmissaoIds = itensRemoviveis.map(item => item.transmissaoId);

      await tx.produtoTransmissaoItem.deleteMany({
        where: { id: { in: itemIds } },
      });

      await this.sincronizarBlocosAposRemoverItensTransmissao(tx, blocoIds);
      await this.sincronizarTransmissoesAposRemoverItensTransmissao(tx, transmissaoIds);
    }

    return { idsLiberados, bloqueados };
  }

  private resolverStatusRestauradoAjusteEstrutura(produto: {
    situacao: 'RASCUNHO' | 'ATIVADO' | 'DESATIVADO';
    codigo?: string | null;
  }, resumo: ProdutoResumoValores) {
    if (resumo.obrigatoriosPendentes > 0) {
      return 'PENDENTE' as const;
    }

    if (this.produtoJaTransmitidoParaRegras(produto)) {
      return 'TRANSMITIDO' as const;
    }

    return 'APROVADO' as const;
  }

  private resolverStatusAposSincronizacaoAutomaticaAjusteEstrutura(produto: {
    status?: ProdutoStatusRegra | null;
    situacao: 'RASCUNHO' | 'ATIVADO' | 'DESATIVADO';
    codigo?: string | null;
  }, resumo: ProdutoResumoValores): ProdutoStatusRegra {
    if (produto.status === 'AJUSTAR_ESTRUTURA') {
      return this.resolverStatusRestauradoAjusteEstrutura(produto, resumo);
    }

    if (resumo.obrigatoriosPendentes > 0) {
      return 'PENDENTE';
    }

    return produto.status ?? 'PENDENTE';
  }

  private diagnosticarImpactoAjusteEstrutura(params: {
    produto: {
      id: number;
      versaoAtributoId?: number | null;
      atributos: Array<{
        id?: number;
        atributoVersaoId?: number | null;
        atributo: { codigo: string; multivalorado: boolean } | null;
        valores: Array<{ valorJson: Prisma.JsonValue; ordem?: number | null }>;
      }>;
    };
    estruturaAtual: EstruturaComVersao | null;
    estruturaAtualizada: EstruturaComVersao;
  }): {
    impactado: boolean;
    valoresProjetados: Record<string, any>;
    resumoProjetado: ProdutoResumoValores;
  } {
    const { produto, estruturaAtual, estruturaAtualizada } = params;
    const valoresOriginais = this.montarValoresDosAtributos(produto.atributos, {
      produtoId: produto.id,
      versaoAtributoId: produto.versaoAtributoId,
      origem: 'produto.corrigirStatusAjusteEstrutura',
    });

    const mapaAtual = estruturaAtual
      ? this.mapearEstruturaPorCodigo(estruturaAtual.estrutura)
      : new Map<string, AtributoEstruturaDTO>();
    const mapaAtualizado = this.mapearEstruturaPorCodigo(estruturaAtualizada.estrutura);

    const valoresAtuais = estruturaAtual
      ? filtrarValoresAtributosVisiveis(valoresOriginais, mapaAtual)
      : valoresOriginais;

    const valoresProjetadosBase = Object.fromEntries(
      Object.entries(valoresOriginais).filter(([codigo]) => mapaAtualizado.has(codigo))
    );
    const valoresProjetados = filtrarValoresAtributosVisiveis(
      valoresProjetadosBase,
      mapaAtualizado
    );

    const estruturaAtualizadaLista = flattenEstrutura(estruturaAtualizada.estrutura);

    const resumoProjetado = calcularResumoProduto(valoresProjetados, estruturaAtualizadaLista);

    const errosAtuais = estruturaAtual
      ? this.validarValores(valoresAtuais, estruturaAtual.estrutura)
      : {};
    const errosProjetados = this.validarValores(
      valoresProjetados,
      estruturaAtualizada.estrutura
    );

    const houveMudancaValores =
      this.serializarMapaValores(valoresAtuais) !==
      this.serializarMapaValores(valoresProjetados);
    const houveNovosErros = Object.entries(errosProjetados).some(
      ([codigo, mensagem]) => errosAtuais[codigo] !== mensagem
    );
    return {
      impactado: houveMudancaValores || houveNovosErros,
      valoresProjetados,
      resumoProjetado,
    };
  }

  private async buscarEstruturaPorVersaoComCache(
    versaoId: number | null | undefined,
    cache: Map<number, EstruturaComVersao | null>
  ): Promise<EstruturaComVersao | null> {
    if (!versaoId) {
      return null;
    }

    if (!cache.has(versaoId)) {
      const estrutura = await this.atributosService.buscarEstruturaPorVersao(versaoId);
      cache.set(versaoId, estrutura ?? null);
    }

    return cache.get(versaoId) ?? null;
  }

  private async prepararPreTransmissaoAutomaticaAjusteEstrutura(
    tx: Prisma.TransactionClient,
    dados: {
      catalogoId: number;
      modalidade: string;
      ncmCodigo: string;
      produtoIdsElegiveis: number[];
      superUserId: number;
    }
  ): Promise<PreparacaoTransmissaoAutomaticaResultado> {
    const produtoIdsElegiveis = [...new Set(dados.produtoIdsElegiveis)];

    if (produtoIdsElegiveis.length === 0) {
      return {
        transmissaoGerada: null,
        produtoIdsIncluidos: [],
        produtoIdsIgnoradosDuplicidade: [],
      };
    }

    const itensDuplicados = await tx.produtoTransmissaoItem.findMany({
      where: {
        produtoId: { in: produtoIdsElegiveis },
        transmissao: {
          catalogoId: dados.catalogoId,
          status: { in: STATUS_TRANSMISSAO_ABERTA },
        },
      },
      select: { produtoId: true },
    });

    const produtoIdsIgnoradosDuplicidade = [
      ...new Set(itensDuplicados.map(item => Number(item.produtoId)).filter(Number.isFinite)),
    ];
    const produtosDuplicadosSet = new Set(produtoIdsIgnoradosDuplicidade);
    const produtoIdsIncluidos = produtoIdsElegiveis.filter(
      produtoId => !produtosDuplicadosSet.has(produtoId)
    );

    if (produtoIdsIncluidos.length === 0) {
      return {
        transmissaoGerada: null,
        produtoIdsIncluidos: [],
        produtoIdsIgnoradosDuplicidade,
      };
    }

    const origemContexto: OrigemTransmissaoAjusteEstruturaContexto = {
      ncmCodigo: dados.ncmCodigo,
      modalidade: dados.modalidade,
      catalogoId: dados.catalogoId,
      produtoIdsElegiveis,
      produtoIdsIgnoradosDuplicidade,
    };

    const transmissao = await tx.produtoTransmissao.create({
      data: {
        superUserId: dados.superUserId,
        catalogoId: dados.catalogoId,
        usuarioCatalogoId: null,
        modalidade: ProdutoTransmissaoModalidade.PRODUTOS,
        origemTipo: ProdutoTransmissaoOrigemTipo.AJUSTE_ESTRUTURA,
        origemContextoJson: origemContexto as unknown as Prisma.InputJsonValue,
        status: ProdutoTransmissaoStatus.AGUARDANDO_CONFIRMACAO,
        totalItens: produtoIdsIncluidos.length,
        totalSucesso: 0,
        totalErro: 0,
        selecaoJson: produtoIdsIncluidos as Prisma.InputJsonValue,
      },
    });

    await tx.produtoTransmissaoItem.createMany({
      data: produtoIdsIncluidos.map(produtoId => ({
        transmissaoId: transmissao.id,
        produtoId,
        operacao: ProdutoTransmissaoItemOperacao.NOVA_VERSAO,
        status: ProdutoTransmissaoItemStatus.PENDENTE,
      })),
    });

    return {
      transmissaoGerada: {
        id: transmissao.id,
        totalItens: produtoIdsIncluidos.length,
      },
      produtoIdsIncluidos,
      produtoIdsIgnoradosDuplicidade,
    };
  }

  private static registrarInvalidacaoCache() {
    if (this.invalidacaoRegistrada) return;

    AtributoLegacyService.registrarInvalidacao((ncm, modalidade) => {
      ProdutoService.invalidarEstruturaCache(ncm, modalidade);
    });

    this.invalidacaoRegistrada = true;
  }
  private montarCondicoesBase(
    filtros: ListarProdutosFiltro = {},
    superUserId: number,
    busca?: string
  ): Prisma.ProdutoWhereInput {
    const where: Prisma.ProdutoWhereInput = {
      catalogo: { superUserId }
    };

    if (filtros.status?.length) {
      where.status = { in: filtros.status };
    }
    if (filtros.ncm) {
      where.ncmCodigo = filtros.ncm;
    }
    if (filtros.situacoes?.length) {
      where.situacao = { in: filtros.situacoes };
    }
    if (filtros.catalogoId) {
      where.catalogoId = filtros.catalogoId;
    }

    const termoBusca = busca?.trim() || filtros.busca?.trim();
    if (termoBusca) {
      const like = {
        contains: termoBusca
      };
      const ncmSomenteDigitos = termoBusca.replace(/\D/g, '');

      const orConditions: Prisma.ProdutoWhereInput[] = [
        { denominacao: like },
        { descricao: like },
        { codigo: like },
        {
          codigosInternos: {
            some: {
              codigo: like
            }
          }
        }
      ];

      if (ncmSomenteDigitos) {
        orConditions.push({
          ncmCodigo: {
            contains: ncmSomenteDigitos
          }
        });
      }

      where.OR = orConditions;
    }

    return where;
  }

  async listarTodos(
    filtros: ListarProdutosFiltro = {},
    superUserId: number,
    paginacao: ListarProdutosPaginacao = {}
  ): Promise<ListarProdutosResponse> {
    const where = this.montarCondicoesBase(filtros, superUserId);

    const page = Math.max(1, paginacao.page ?? 1);
    const size = Math.max(1, Math.min(paginacao.pageSize ?? 20, 1000));

    // Primeiro carrega apenas id e codigo para ordenar numericamente em memória
    const todosProdutos = await catalogoPrisma.produto.findMany({
      where,
      select: {
        id: true,
        codigo: true
      }
    });

    const sortedIds = todosProdutos
      .slice()
      .sort((a, b) => {
        const aCodigoRaw = (a.codigo ?? '').trim();
        const bCodigoRaw = (b.codigo ?? '').trim();

        const aNum = aCodigoRaw !== '' ? Number(aCodigoRaw) : NaN;
        const bNum = bCodigoRaw !== '' ? Number(bCodigoRaw) : NaN;

        const aIsNum = Number.isFinite(aNum);
        const bIsNum = Number.isFinite(bNum);

        if (aIsNum && bIsNum) {
          if (aNum !== bNum) {
            return aNum - bNum;
          }
        } else if (aIsNum && !bIsNum) {
          // Valores numéricos vêm antes de valores não numéricos ou vazios
          return -1;
        } else if (!aIsNum && bIsNum) {
          return 1;
        }

        // Empate: ordena por código como texto para estabilidade
        if (aCodigoRaw !== bCodigoRaw) {
          return aCodigoRaw.localeCompare(bCodigoRaw);
        }

        // Último critério: id
        return a.id - b.id;
      })
      .map(p => p.id);

    const total = sortedIds.length;
    const totalPages = Math.max(1, Math.ceil(total / size));
    const paginaAjustada = Math.min(page, totalPages);
    const skip = (paginaAjustada - 1) * size;
    const pageIds = sortedIds.slice(skip, skip + size);

    if (pageIds.length === 0) {
      return {
        items: [],
        total,
        page: paginaAjustada,
        pageSize: size
      };
    }

    // Busca dados completos apenas dos registros da página atual
    const produtosPagina = await catalogoPrisma.produto.findMany({
      where: {
        id: { in: pageIds }
      },
      select: {
        id: true,
        codigo: true,
        ncmCodigo: true,
        status: true,
        situacao: true,
        modalidade: true,
        denominacao: true,
        descricao: true,
        atualizadoEm: true,
        catalogoId: true,
        catalogo: {
          select: {
            numero: true,
            nome: true,
            cpf_cnpj: true,
            ambiente: true
          }
        },
        codigosInternos: {
          select: {
            codigo: true
          }
        }
      }
    });

    const produtosPorId = new Map(produtosPagina.map(p => [p.id, p]));
    const produtosOrdenados = pageIds
      .map(id => produtosPorId.get(id))
      .filter((p): p is NonNullable<typeof p> => Boolean(p));

    const items: ProdutoListItemDTO[] = produtosOrdenados.map(p => ({
      id: p.id,
      codigo: p.codigo ?? null,
      ncmCodigo: p.ncmCodigo,
      status: p.status,
      situacao: p.situacao,
      modalidade: p.modalidade ?? null,
      denominacao: p.denominacao,
      descricao: p.descricao,
      atualizadoEm: p.atualizadoEm,
      catalogoId: p.catalogoId,
      catalogoNumero: p.catalogo?.numero,
      catalogoNome: p.catalogo?.nome,
      catalogoCpfCnpj: p.catalogo?.cpf_cnpj,
      catalogoAmbiente: p.catalogo?.ambiente,
      codigosInternos: p.codigosInternos.map(ci => ci.codigo)
    }));

    return {
      items,
      total,
      page: paginaAjustada,
      pageSize: size
    };
  }

  async buscarPorId(id: number, superUserId: number) {
    const p = await catalogoPrisma.produto.findFirst({
      where: { id, catalogo: { superUserId } },
      include: {
        atributos: {
          include: {
            atributo: { select: { codigo: true, multivalorado: true } },
            valores: { orderBy: { ordem: 'asc' } }
          }
        },
        estruturaVersao: true,
        catalogo: true,
        codigosInternos: true,
        operadoresEstrangeiros: {
          include: {
            pais: true,
            operadorEstrangeiro: {
              include: {
                catalogo: {
                  select: {
                    id: true,
                    cpf_cnpj: true,
                    nome: true,
                    ambiente: true
                  }
                }
              }
            }
          }
        }
      }
    });
    if (!p) return null;

    const estrutura = p.versaoAtributoId
      ? await this.atributosService.buscarEstruturaPorVersao(p.versaoAtributoId)
      : null;

    const valoresMap = this.montarValoresDosAtributos(p.atributos, {
      produtoId: p.id,
      versaoAtributoId: p.versaoAtributoId,
      origem: 'produto.buscarPorId',
    });

    return {
      ...p,
      numero: p.numero,
      atributos: [
        {
          valoresJson: valoresMap,
          estruturaSnapshotJson: estrutura?.estrutura ?? []
        }
      ],
      versaoEstruturaAtributos: estrutura?.versaoNumero ?? p.versaoEstruturaAtributos,
      codigosInternos: p.codigosInternos.map(ci => ci.codigo),
      operadoresEstrangeiros: p.operadoresEstrangeiros.map(o => ({
        id: o.id,
        paisCodigo: o.paisCodigo,
        paisNome: o.pais.nome,
        conhecido: o.conhecido,
        operadorEstrangeiroId: o.operadorEstrangeiroId,
        operadorEstrangeiro: o.operadorEstrangeiro
      })),
      catalogoNumero: p.catalogo?.numero,
      catalogoNome: p.catalogo?.nome,
      catalogoCpfCnpj: p.catalogo?.cpf_cnpj,
      catalogoAmbiente: p.catalogo?.ambiente
    };
  }

  async listarHistorico(id: number, superUserId: number): Promise<ProdutoHistoricoVersaoDTO[]> {
    const produto = await catalogoPrisma.produto.findFirst({
      where: { id, catalogo: { superUserId } },
      select: { id: true }
    });

    if (!produto) {
      throw new Error(`Produto ID ${id} não encontrado`);
    }

    const historico = await catalogoPrisma.produtoHistoricoVersao.findMany({
      where: { produtoId: id },
      orderBy: [{ criadoEm: 'desc' }]
    });

    return historico
      .sort((a, b) => {
        const comparacaoVersao = compararVersoesSiscomex(b.versaoSiscomex, a.versaoSiscomex);
        return comparacaoVersao !== 0 ? comparacaoVersao : b.criadoEm.getTime() - a.criadoEm.getTime();
      })
      .map(item => ({
        id: item.id,
        versaoSiscomex: item.versaoSiscomex,
        tipoEvento: item.tipoEvento,
        resumo: item.resumo,
        delta: (item.deltaJson as DeltaHistoricoProduto | null) ?? null,
        criadoEm: item.criadoEm
      }));
  }

  async obterSnapshotParaHistorico(
    produtoId: number,
    superUserId: number,
    tx?: Prisma.TransactionClient
  ): Promise<Record<string, unknown>> {
    const prisma = tx ?? catalogoPrisma;
    const produto = await prisma.produto.findFirst({
      where: { id: produtoId, catalogo: { superUserId } },
      include: {
        atributos: {
          include: {
            atributo: { select: { codigo: true, multivalorado: true } },
            valores: { orderBy: { ordem: 'asc' } }
          }
        },
        codigosInternos: { select: { codigo: true } },
        operadoresEstrangeiros: {
          select: {
            paisCodigo: true,
            conhecido: true,
            operadorEstrangeiroId: true
          }
        }
      }
    });

    if (!produto) {
      throw new Error(`Produto ID ${produtoId} não encontrado`);
    }

    const valoresAtributos = this.montarValoresDosAtributos(produto.atributos, {
      produtoId: produto.id,
      versaoAtributoId: produto.versaoAtributoId,
      origem: 'produto.obterSnapshotParaHistorico',
    });

    return normalizarProdutoParaHistorico({
      codigo: produto.codigo,
      versao: produto.versao,
      ncmCodigo: produto.ncmCodigo,
      modalidade: produto.modalidade,
      denominacao: produto.denominacao,
      descricao: produto.descricao,
      situacao: produto.situacao,
      codigosInternos: produto.codigosInternos.map(item => item.codigo),
      operadoresEstrangeiros: produto.operadoresEstrangeiros,
      valoresAtributos
    });
  }

  async registrarHistoricoVersao(params: {
    produtoId: number;
    superUserId: number;
    versaoSiscomex: string;
    tipoEvento?: ProdutoHistoricoTipoEvento;
    transmissaoId?: number;
    snapshotAnterior?: Record<string, unknown>;
    tx?: Prisma.TransactionClient;
  }) {
    const prisma = params.tx ?? catalogoPrisma;
    const snapshotAtual = await this.obterSnapshotParaHistorico(
      params.produtoId,
      params.superUserId,
      params.tx
    );
    const snapshotAnterior = params.snapshotAnterior ?? null;
    const versaoSiscomex = normalizarVersaoSiscomex(params.versaoSiscomex);

    if (!versaoSiscomex) {
      throw new Error('Versão SISCOMEX inválida para histórico do produto.');
    }

    const delta = gerarDeltaHistoricoProduto(snapshotAnterior, snapshotAtual);
    const tipoEvento = resolverTipoEventoHistoricoSiscomex(versaoSiscomex, params.tipoEvento);
    const resumo = gerarResumoDelta(delta, versaoSiscomex, tipoEvento);
    const isCheckpoint = this.isCheckpointHistoricoSiscomex(versaoSiscomex, tipoEvento);
    const deltaJson = delta as unknown as Prisma.InputJsonValue;
    const snapshotJson = isCheckpoint
      ? (snapshotAtual as unknown as Prisma.InputJsonValue)
      : Prisma.JsonNull;

    await prisma.produtoHistoricoVersao.upsert({
      where: {
        uk_hist_produto_versao: {
          produtoId: params.produtoId,
          versaoSiscomex
        }
      },
      update: {
        tipoEvento,
        resumo,
        deltaJson,
        snapshotJson,
        isCheckpoint,
        transmissaoId: params.transmissaoId ?? null
      },
      create: {
        produtoId: params.produtoId,
        versaoSiscomex,
        tipoEvento,
        resumo,
        deltaJson,
        snapshotJson,
        isCheckpoint,
        transmissaoId: params.transmissaoId ?? null
      }
    });
  }

  private isCheckpointHistoricoSiscomex(
    versaoSiscomex: string,
    tipoEvento: ProdutoHistoricoTipoEvento
  ) {
    if (tipoEvento === 'CRIACAO') {
      return true;
    }

    const [principal, retificacao] = versaoSiscomex.split('.').map(parte => Number(parte));
    return Number.isInteger(principal) && (retificacao ?? 0) === 0 && principal > 0 && principal % 10 === 0;
  }

  async criar(
    data: CreateProdutoDTO,
    superUserId: number,
    transacao?: Prisma.TransactionClient
  ) {
    const estruturaInfo = await this.obterEstruturaAtributos(
      data.ncmCodigo,
      data.modalidade,
      { verificarAtualizacaoLegado: true }
    );

    const estrutura = estruturaInfo.estrutura;

    const mapaEstrutura = this.mapearEstruturaPorCodigo(estrutura);
    const valores = filtrarValoresAtributosVisiveis(
      (data.valoresAtributos ?? {}) as Record<string, any>,
      mapaEstrutura
    );

    const erros = this.validarValores(valores, estrutura);
    if (Object.keys(erros).length > 0) {
      throw new ValidationError(erros);
    }

    const preencheuObrigatorios = this.todosObrigatoriosPreenchidos(valores, estrutura);

    const catalogo = await catalogoPrisma.catalogo.findFirst({
      where: { id: data.catalogoId, superUserId }
    });
    if (!catalogo) {
      throw new Error('Catálogo não encontrado para o superusuário');
    }

    const atributosParaCriacao = this.montarAtributosParaCriacao(
      estruturaInfo,
      valores
    );
    const statusInicial = resolverStatusInicialProduto({
      possuiObrigatoriosPendentes: !preencheuObrigatorios,
      statusSolicitado: data.status
    });

    const executarCriacao = async (delegate: typeof catalogoPrisma.produto) => {
      return delegate.create({
        data: {
          codigo: data.codigo ?? null,
          versao: normalizarVersaoSiscomex(data.versao),
          status: statusInicial,
          situacao: data.situacao ?? undefined,
          ncmCodigo: data.ncmCodigo,
          modalidade: data.modalidade,
          denominacao: data.denominacao,
          descricao: data.descricao,
          numero: 0,
          catalogoId: data.catalogoId,
          versaoEstruturaAtributos: estruturaInfo.versaoNumero,
          versaoAtributoId: estruturaInfo.versaoId,
          criadoPor: data.criadoPor || null,
          codigosInternos: data.codigosInternos
            ? { create: data.codigosInternos.map(c => ({ codigo: c })) }
            : undefined
          ,
          operadoresEstrangeiros: data.operadoresEstrangeiros
            ? {
                create: data.operadoresEstrangeiros.map(o => ({
                  paisCodigo: o.paisCodigo,
                  conhecido: o.conhecido,
                  operadorEstrangeiroId: o.operadorEstrangeiroId ?? null
                }))
              }
            : undefined,
          atributos: atributosParaCriacao.length > 0
            ? {
                create: atributosParaCriacao,
              }
            : undefined
        },
        select: {
          id: true,
          codigo: true,
          ncmCodigo: true,
          modalidade: true,
          denominacao: true,
          descricao: true,
          status: true,
          situacao: true,
          catalogoId: true,
        }
      });
    };

    const produtoCriado = transacao
      ? await executarCriacao(transacao.produto)
      : await executarCriacao(catalogoPrisma.produto);

    if (transacao) {
      return produtoCriado;
    }

    return this.buscarPorId(produtoCriado.id, superUserId);
  }

  async atualizar(
    id: number,
    data: UpdateProdutoDTO,
    superUserId: number,
    opcoes: AtualizarProdutoOpcoes = {}
  ) {
    const atual = await catalogoPrisma.produto.findFirst({
      where: { id, catalogo: { superUserId } },
      include: {
        atributos: {
          include: {
            atributo: { select: { codigo: true, multivalorado: true } },
            valores: { orderBy: { ordem: 'asc' } }
          }
        },
        codigosInternos: true,
        operadoresEstrangeiros: {
          select: {
            paisCodigo: true,
            conhecido: true,
            operadorEstrangeiroId: true,
          }
        }
      }
    });
    if (!atual) {
      throw new Error(`Produto ID ${id} não encontrado`);
    }

    if (atual.situacao === 'DESATIVADO' && !opcoes.permitirProdutoDesativado) {
      throw new Error('Produto desativado nao pode ser alterado');
    }

    if (opcoes.exigirDenominacaoAlterada) {
      const denominacaoAtual = this.normalizarTextoComparacao(atual.denominacao);
      const denominacaoNova = this.normalizarTextoComparacao(data.denominacao);

      if (!denominacaoNova || denominacaoNova === denominacaoAtual) {
        throw new ValidationError({
          denominacao: 'Altere a denominação do produto para salvar e criar nova versão.',
        });
      }
    }

    const incoming: any = data as any;
    if (incoming.ncmCodigo && incoming.ncmCodigo !== atual.ncmCodigo) {
      throw new Error('NCM não pode ser alterado');
    }
    if (incoming.catalogoId && incoming.catalogoId !== atual.catalogoId) {
      throw new Error('Catálogo não pode ser alterado');
    }

    const ncm = atual.ncmCodigo;
    const modalidade = data.modalidade || atual.modalidade || '';

    let estruturaInfo: EstruturaComVersao | null = null;
    if (data.valoresAtributos === undefined && atual.versaoAtributoId) {
      estruturaInfo = await this.atributosService.buscarEstruturaPorVersao(
        atual.versaoAtributoId
      );
    }
    if (!estruturaInfo) {
      estruturaInfo = await this.obterEstruturaAtributos(ncm, modalidade);
    }

    const mapaEstrutura = this.mapearEstruturaPorCodigo(estruturaInfo.estrutura);
    const valoresExistentes = filtrarValoresAtributosVisiveis(
      this.montarValoresDosAtributos(atual.atributos, {
        produtoId: atual.id,
        versaoAtributoId: atual.versaoAtributoId,
        origem: 'produto.atualizar',
      }),
      mapaEstrutura
    );
    const valoresInformados = data.valoresAtributos !== undefined
      ? filtrarValoresAtributosVisiveis(
          (data.valoresAtributos ?? {}) as Record<string, any>,
          mapaEstrutura
        )
      : undefined;
    const valores = valoresInformados ?? valoresExistentes;

    const erros = this.validarValores(valores, estruturaInfo.estrutura);
    if (Object.keys(erros).length > 0) {
      throw new ValidationError(erros);
    }

    const preencheuObrigatorios = this.todosObrigatoriosPreenchidos(valores, estruturaInfo.estrutura);

    const versaoAtualizadaId =
      data.valoresAtributos !== undefined
        ? estruturaInfo.versaoId
        : atual.versaoAtributoId ?? estruturaInfo.versaoId;

    const versaoAtualizadaNumero =
      data.valoresAtributos !== undefined
        ? estruturaInfo.versaoNumero
        : atual.versaoEstruturaAtributos ?? estruturaInfo.versaoNumero;

    const serializarJsonEstavel = (valor: unknown): string => {
      const normalizar = (entrada: unknown): unknown => {
        if (Array.isArray(entrada)) {
          return entrada.map(item => normalizar(item));
        }

        if (entrada && typeof entrada === 'object') {
          const objeto = entrada as Record<string, unknown>;
          const chaves = Object.keys(objeto).sort();
          return chaves.reduce<Record<string, unknown>>((acc, chave) => {
            acc[chave] = normalizar(objeto[chave]);
            return acc;
          }, {});
        }

        return entrada;
      };

      return JSON.stringify(normalizar(valor));
    };

    const normalizarCodigosInternos = (codigos: string[] | undefined): string[] => {
      return (codigos ?? [])
        .map(codigo => codigo.trim())
        .filter(codigo => codigo.length > 0)
        .sort();
    };

    const normalizarOperadores = (
      operadores:
        | OperadorEstrangeiroProdutoInput[]
        | Array<{ paisCodigo: string; conhecido: boolean; operadorEstrangeiroId: number | null }>
        | undefined
    ): Array<{ paisCodigo: string; conhecido: boolean; operadorEstrangeiroId: number | null }> => {
      return (operadores ?? [])
        .map(operador => ({
          paisCodigo: operador.paisCodigo,
          conhecido: operador.conhecido,
          operadorEstrangeiroId: operador.operadorEstrangeiroId ?? null,
        }))
        .sort((a, b) => {
          const comparacaoPais = a.paisCodigo.localeCompare(b.paisCodigo);
          if (comparacaoPais !== 0) return comparacaoPais;

          const comparacaoOperador = (a.operadorEstrangeiroId ?? 0) - (b.operadorEstrangeiroId ?? 0);
          if (comparacaoOperador !== 0) return comparacaoOperador;

          return Number(a.conhecido) - Number(b.conhecido);
        });
    };

    await catalogoPrisma.$transaction(async tx => {
      const statusAtual = atual.status ?? 'PENDENTE';
      const houveAlteracaoDadosProduto =
        (data.modalidade !== undefined && data.modalidade !== atual.modalidade) ||
        (data.denominacao !== undefined && data.denominacao !== atual.denominacao) ||
        (data.descricao !== undefined && data.descricao !== atual.descricao) ||
        (data.valoresAtributos !== undefined &&
          serializarJsonEstavel(valoresInformados ?? {}) !== serializarJsonEstavel(valoresExistentes)) ||
        (data.codigosInternos !== undefined &&
          serializarJsonEstavel(normalizarCodigosInternos(data.codigosInternos)) !==
            serializarJsonEstavel(normalizarCodigosInternos(atual.codigosInternos.map(codigo => codigo.codigo)))) ||
        (data.operadoresEstrangeiros !== undefined &&
          serializarJsonEstavel(normalizarOperadores(data.operadoresEstrangeiros)) !==
            serializarJsonEstavel(normalizarOperadores(atual.operadoresEstrangeiros)));

      const status = resolverStatusProduto({
        statusAtual,
        statusSolicitado: data.status,
        possuiObrigatoriosPendentes: !preencheuObrigatorios,
        houveAlteracaoDadosProduto,
      });

      if (opcoes.exigirStatusAprovadoAposAtualizacao && status !== 'APROVADO') {
        throw new ValidationError({
          produto:
            'Produto precisa estar aprovado após o salvamento para criar nova versão no SISCOMEX.',
        });
      }

      const updated = await tx.produto.updateMany({
        where: { id, catalogo: { superUserId } },
        data: {
          modalidade: data.modalidade,
          status,
          situacao: data.situacao,
          denominacao: data.denominacao,
          descricao: data.descricao,
          versaoEstruturaAtributos: versaoAtualizadaNumero,
          versaoAtributoId: versaoAtualizadaId
        }
      });
      if (updated.count === 0) {
        throw new Error(`Produto ID ${id} não encontrado`);
      }

      if (data.valoresAtributos !== undefined) {
        await tx.produtoAtributo.deleteMany({
          where: { produtoId: id, produto: { catalogo: { superUserId } } }
        });
        await this.salvarValoresProduto(tx, id, estruturaInfo!, valores);
      }

      if (data.codigosInternos) {
        await tx.codigoInternoProduto.deleteMany({ where: { produtoId: id, produto: { catalogo: { superUserId } } } });
        await tx.codigoInternoProduto.createMany({
          data: data.codigosInternos.map(c => ({ codigo: c, produtoId: id }))
        });
      }

      if (data.operadoresEstrangeiros) {
        await tx.operadorEstrangeiroProduto.deleteMany({ where: { produtoId: id, produto: { catalogo: { superUserId } } } });
        await tx.operadorEstrangeiroProduto.createMany({
          data: data.operadoresEstrangeiros.map(o => ({
            paisCodigo: o.paisCodigo,
            conhecido: o.conhecido,
            operadorEstrangeiroId: o.operadorEstrangeiroId ?? null,
            produtoId: id
          }))
        });
      }

      await this.produtoResumoService.recalcularResumoProduto(id, tx);
    });

    return this.buscarPorId(id, superUserId);
  }

  async marcarComoTransmitido(
    id: number,
    superUserId: number,
    dados: {
      codigo?: string | number | null;
      versao: number | string;
      situacao?: 'RASCUNHO' | 'ATIVADO' | 'DESATIVADO';
      atualizarCodigo?: boolean;
      transmissaoId?: number;
      tipoEventoHistorico?: ProdutoHistoricoTipoEvento;
    }
  ) {
    const versaoSiscomex = normalizarVersaoSiscomex(dados.versao);

    if (!versaoSiscomex) {
      throw new Error('Versão inválida retornada pelo SISCOMEX');
    }

    const atualizarCodigo = dados.atualizarCodigo !== false;
    const codigoNormalizado =
      dados.codigo === null || dados.codigo === undefined || dados.codigo === ''
        ? null
        : String(dados.codigo);

    const dadosAtualizacao: Prisma.ProdutoUpdateManyMutationInput = {
      versao: versaoSiscomex,
      status: 'TRANSMITIDO',
      situacao: dados.situacao ?? 'ATIVADO'
    };

    if (atualizarCodigo) {
      dadosAtualizacao.codigo = codigoNormalizado;
    }

    await catalogoPrisma.$transaction(async tx => {
      const snapshotAnterior = await this.obterSnapshotParaHistorico(id, superUserId, tx);

      const atualizado = await tx.produto.updateMany({
        where: { id, catalogo: { superUserId } },
        data: dadosAtualizacao
      });

      if (atualizado.count === 0) {
        throw new Error('Produto não encontrado ou não pertence ao superusuário');
      }

      await this.registrarHistoricoVersao({
        produtoId: id,
        superUserId,
        versaoSiscomex,
        tipoEvento: dados.tipoEventoHistorico,
        transmissaoId: dados.transmissaoId,
        snapshotAnterior,
        tx
      });

      await this.produtoResumoService.recalcularResumoProduto(id, tx);
    });

    return this.buscarPorId(id, superUserId);
  }

  async remover(id: number, superUserId: number) {
    const deletado = await catalogoPrisma.$transaction(async tx => {
      const produto = await tx.produto.findFirst({
        where: { id, catalogo: { superUserId } },
        select: {
          id: true,
          codigo: true,
          situacao: true,
        }
      });

      if (!produto) {
        return 0;
      }

      const motivoBloqueio = this.obterMotivoBloqueioExclusao(produto);
      if (motivoBloqueio) {
        throw new ValidationError({ produto: motivoBloqueio }, motivoBloqueio);
      }

      const preparoTransmissao = await this.prepararVinculosTransmissaoParaExclusao(tx, [produto.id]);
      if (preparoTransmissao.bloqueados.length > 0) {
        const motivoTransmissao = preparoTransmissao.bloqueados[0].motivo;
        throw new ValidationError({ produto: motivoTransmissao }, motivoTransmissao);
      }

      await tx.produtoAtributo.deleteMany({
        where: { produtoId: produto.id, produto: { catalogo: { superUserId } } }
      });

      await this.produtoResumoService.removerResumoProduto(produto.id, tx);

      await tx.produto.delete({ where: { id: produto.id } });

      return 1;
    });

    if (deletado === 0) {
      throw new Error(`Produto ID ${id} não encontrado`);
    }
  }

  async removerEmMassa(
    dados: RemoverProdutosEmMassaDTO,
    superUserId: number
  ): Promise<RemoverProdutosEmMassaResultadoDTO> {
    const idsParaExcluir = await this.resolverSelecaoProdutos(dados, superUserId, {
      mensagemErroVazio: 'Nenhum produto selecionado para exclusão',
      mensagemErroConsulta: 'Nenhum produto correspondente encontrado para exclusão'
    });

    const produtosSelecionados = await catalogoPrisma.produto.findMany({
      where: {
        id: { in: idsParaExcluir },
        catalogo: { superUserId },
      },
      select: {
        id: true,
        codigo: true,
        situacao: true,
      },
    });

    const bloqueados: ProdutoBloqueioExclusaoDTO[] = [];
    const idsElegiveis: number[] = [];

    for (const produto of produtosSelecionados) {
      const motivoBloqueio = this.obterMotivoBloqueioExclusao(produto);
      if (motivoBloqueio) {
        bloqueados.push({ id: produto.id, motivo: motivoBloqueio });
      } else {
        idsElegiveis.push(produto.id);
      }
    }

    if (idsElegiveis.length === 0) {
      throw new ValidationError(
        { produtos: 'Nenhum produto elegivel para exclusao na selecao informada.' },
        'Nenhum produto elegivel para exclusao na selecao informada.'
      );
    }

    const resultadoExclusao = await catalogoPrisma.$transaction(async tx => {
      const preparoTransmissao = await this.prepararVinculosTransmissaoParaExclusao(tx, idsElegiveis);
      const idsParaRemover = preparoTransmissao.idsLiberados;

      if (idsParaRemover.length === 0) {
        return { removidos: 0, bloqueados: preparoTransmissao.bloqueados };
      }

      await tx.produtoAtributo.deleteMany({ where: { produtoId: { in: idsParaRemover } } });
      await tx.codigoInternoProduto.deleteMany({ where: { produtoId: { in: idsParaRemover } } });
      await tx.operadorEstrangeiroProduto.deleteMany({ where: { produtoId: { in: idsParaRemover } } });

      for (const idProduto of idsParaRemover) {
        await this.produtoResumoService.removerResumoProduto(idProduto, tx);
      }

      const resultado = await tx.produto.deleteMany({ where: { id: { in: idsParaRemover } } });
      return { removidos: resultado.count, bloqueados: preparoTransmissao.bloqueados };
    });

    bloqueados.push(...resultadoExclusao.bloqueados);

    if (resultadoExclusao.removidos === 0) {
      throw new Error('Nenhum produto foi excluído');
    }

    return {
      removidos: resultadoExclusao.removidos,
      bloqueados,
      totalSolicitado: produtosSelecionados.length,
    };
  }

  async contarPendenciasAjusteEstrutura(superUserId: number): Promise<number> {
    const produtos = await this.listarProdutosPendentesAjusteEstrutura(superUserId);
    return produtos.length;
  }

  private lerResultadosVerificacao(conteudoBase64?: string | null): ResultadoVerificacao[] {
    if (!conteudoBase64) return [];

    try {
      const texto = Buffer.from(conteudoBase64, 'base64').toString('utf8');
      const parsed = JSON.parse(texto);
      return Array.isArray(parsed) ? (parsed as ResultadoVerificacao[]) : [];
    } catch {
      return [];
    }
  }

  private async carregarMapaDivergencias(): Promise<Map<string, ResultadoVerificacao>> {
    const job = await catalogoPrisma.asyncJob.findFirst({
      where: { tipo: AsyncJobTipo.AJUSTE_ESTRUTURA },
      orderBy: { criadoEm: 'desc' },
      include: { arquivo: true },
    });

    const resultados = this.lerResultadosVerificacao(job?.arquivo?.conteudoBase64);
    const mapa = new Map<string, ResultadoVerificacao>();

    resultados
      .filter(item => item.divergente)
      .forEach(item => {
        const chave = this.montarChaveNcmModalidade(item.ncmCodigo, item.modalidade);
        if (!mapa.has(chave)) {
          mapa.set(chave, item);
        }
      });

    return mapa;
  }

  async listarPendenciasAjusteEstruturaDetalhadas(superUserId: number): Promise<{
    itens: PendenciaAjusteEstruturaDTO[];
    totalProdutos: number;
  }> {
    const produtos = await this.listarProdutosPendentesAjusteEstrutura(superUserId);

    const mapaDivergencias = await this.carregarMapaDivergencias();
    const agrupados = new Map<string, PendenciaAjusteEstruturaDTO>();

    for (const produto of produtos) {
      const modalidade = produto.modalidade || '';
      const chave = this.montarChaveNcmModalidade(produto.ncmCodigo, modalidade);
      if (!agrupados.has(chave)) {
        agrupados.set(chave, {
          ncmCodigo: produto.ncmCodigo,
          modalidade,
          diferencas: mapaDivergencias.get(chave)?.diferencas,
          catalogos: [],
        });
      }

      const grupo = agrupados.get(chave)!;
      const catalogoExistente = grupo.catalogos.find(
        item => item.catalogoId === produto.catalogoId
      );

      if (catalogoExistente) {
        catalogoExistente.produtos.push({ id: produto.id, denominacao: produto.denominacao });
      } else {
        grupo.catalogos.push({
          catalogoId: produto.catalogoId,
          catalogoNome: produto.catalogo?.nome ?? null,
          produtos: [{ id: produto.id, denominacao: produto.denominacao }],
        });
      }
    }

    const itens = Array.from(agrupados.values());
    return { itens, totalProdutos: produtos.length };
  }

  async aplicarAjusteEstruturaNcm(
    parametros: {
      ncmCodigo: string;
      modalidade: string;
      superUserId: number;
      estruturaAtualizada: EstruturaComVersao;
      onProgresso?: () => Promise<void>;
    }
  ): Promise<AplicacaoAjusteEstruturaNcmResultadoDTO> {
    const ncmCodigo = String(parametros.ncmCodigo ?? '').trim();
    const modalidade = this.normalizarModalidadeAjusteEstrutura(parametros.modalidade);
    const filtroModalidade = this.montarFiltroModalidadeAjusteEstrutura(modalidade);

    const produtosBase = await catalogoPrisma.produto.findMany({
      where: {
        ncmCodigo,
        ...filtroModalidade,
        catalogo: { superUserId: parametros.superUserId },
      },
      select: { id: true },
      orderBy: { id: 'asc' },
    });

    const resultado: AplicacaoAjusteEstruturaNcmResultadoDTO = {
      produtosAnalisados: 0,
      produtosMarcados: 0,
      produtosSincronizados: 0,
    };

    const estruturaVersaoCache = new Map<number, EstruturaComVersao | null>();

    for (
      let indiceLote = 0;
      indiceLote < produtosBase.length;
      indiceLote += ProdutoService.CORRECAO_STATUS_AJUSTE_ESTRUTURA_BATCH_SIZE
    ) {
      const loteIds = produtosBase
        .slice(indiceLote, indiceLote + ProdutoService.CORRECAO_STATUS_AJUSTE_ESTRUTURA_BATCH_SIZE)
        .map(produto => produto.id);

      const produtos = await catalogoPrisma.produto.findMany({
        where: {
          id: { in: loteIds },
          catalogo: { superUserId: parametros.superUserId },
        },
        include: {
          atributos: {
            include: {
              atributo: { select: { codigo: true, multivalorado: true } },
              valores: { orderBy: { ordem: 'asc' } },
            },
          },
        },
        orderBy: { id: 'asc' },
      });

      for (const [indiceProduto, produto] of produtos.entries()) {
        if (parametros.onProgresso && indiceProduto % 10 === 0) {
          await parametros.onProgresso();
        }

        const estruturaAtual = await this.buscarEstruturaPorVersaoComCache(
          produto.versaoAtributoId,
          estruturaVersaoCache
        );
        const diagnostico = this.diagnosticarImpactoAjusteEstrutura({
          produto,
          estruturaAtual,
          estruturaAtualizada: parametros.estruturaAtualizada,
        });

        resultado.produtosAnalisados += 1;

        if (diagnostico.impactado) {
          if (produto.status !== 'AJUSTAR_ESTRUTURA') {
            await catalogoPrisma.produto.updateMany({
              where: { id: produto.id, catalogo: { superUserId: parametros.superUserId } },
              data: { status: 'AJUSTAR_ESTRUTURA' },
            });
          }

          resultado.produtosMarcados += 1;
          continue;
        }

        const precisaSincronizarVersao =
          produto.versaoAtributoId !== parametros.estruturaAtualizada.versaoId ||
          produto.versaoEstruturaAtributos !== parametros.estruturaAtualizada.versaoNumero;
        const statusProjetado = this.resolverStatusAposSincronizacaoAutomaticaAjusteEstrutura(
          {
            status: produto.status as ProdutoStatusRegra,
            situacao: produto.situacao,
            codigo: produto.codigo,
          },
          diagnostico.resumoProjetado
        );
        const precisaAtualizarStatus = produto.status !== statusProjetado;

        if (!precisaSincronizarVersao && !precisaAtualizarStatus) {
          continue;
        }

        await catalogoPrisma.$transaction(async tx => {
          if (precisaSincronizarVersao) {
            await tx.produtoAtributo.deleteMany({ where: { produtoId: produto.id } });

            if (Object.keys(diagnostico.valoresProjetados).length > 0) {
              await this.salvarValoresProduto(
                tx,
                produto.id,
                parametros.estruturaAtualizada,
                diagnostico.valoresProjetados
              );
            }
          }

          await this.produtoResumoService.salvarResumoProduto(
            produto.id,
            produto.catalogoId,
            diagnostico.resumoProjetado,
            tx
          );

          const data = {
            ...(precisaSincronizarVersao
              ? {
                  versaoAtributoId: parametros.estruturaAtualizada.versaoId,
                  versaoEstruturaAtributos: parametros.estruturaAtualizada.versaoNumero,
                }
              : {}),
            ...(precisaAtualizarStatus ? { status: statusProjetado } : {}),
          };

          if (Object.keys(data).length > 0) {
            await tx.produto.update({
              where: { id: produto.id },
              data,
            });
          }
        });

        resultado.produtosSincronizados += 1;
      }

      if (parametros.onProgresso) {
        await parametros.onProgresso();
      }
    }

    return resultado;
  }

  async solicitarAjusteEstruturaCatalogo(
    parametros: { ncmCodigo: string; modalidade: string; catalogoId: number },
    superUserId: number
  ): Promise<SolicitarAjusteEstruturaCatalogoResultadoDTO> {
    const ncmCodigo = String(parametros.ncmCodigo ?? '').trim();
    const modalidade = this.normalizarModalidadeAjusteEstrutura(parametros.modalidade);
    const filtroModalidade = this.montarFiltroModalidadeAjusteEstrutura(modalidade);

    const produtoPendente = await catalogoPrisma.produto.findFirst({
      where: {
        ncmCodigo,
        ...filtroModalidade,
        catalogoId: parametros.catalogoId,
        catalogo: { superUserId },
        status: 'AJUSTAR_ESTRUTURA',
      },
      select: { id: true },
    });

    if (!produtoPendente) {
      throw new Error('Nenhum produto pendente encontrado para o catálogo informado.');
    }

    const payload: AjusteEstruturaCatalogoJobPayload = {
      superUserId,
      catalogoId: parametros.catalogoId,
      ncmCodigo,
      modalidade,
    };

    const jobAtivo = await this.encontrarJobAjusteEstruturaCatalogoAtivo(payload);
    if (jobAtivo) {
      return {
        jobId: jobAtivo.id,
        reutilizado: true,
        status: jobAtivo.status,
      };
    }

    const job = await createAsyncJob({
      tipo: AsyncJobTipo.AJUSTE_ESTRUTURA_CATALOGO,
      payload: payload as unknown as Prisma.InputJsonValue,
      prioridade: 1,
    });

    return {
      jobId: job.id,
      reutilizado: false,
      status: job.status,
    };
  }

  async solicitarCorrecaoStatusAjusteEstrutura(
    dados: { produtoIds?: number[] },
    superUserId: number
  ): Promise<SolicitarCorrecaoStatusAjusteEstruturaResultadoDTO> {
    const produtoIds = Array.isArray(dados.produtoIds)
      ? [...new Set(
          dados.produtoIds
            .map(id => Number(id))
            .filter(id => Number.isInteger(id) && id > 0)
        )]
      : [];

    const quantidadeInicialAjustarEstrutura = await catalogoPrisma.produto.count({
      where: {
        status: 'AJUSTAR_ESTRUTURA',
        catalogo: { superUserId },
        ...(produtoIds.length ? { id: { in: produtoIds } } : {}),
      },
    });

    if (quantidadeInicialAjustarEstrutura === 0) {
      throw new Error('Nenhum produto em AJUSTAR_ESTRUTURA encontrado para a correção informada.');
    }

    const payload: CorrecaoStatusAjusteEstruturaJobPayload = {
      superUserId,
      quantidadeInicialAjustarEstrutura,
      ...(produtoIds.length ? { produtoIds } : {}),
    };

    const job = await createAsyncJob({
      tipo: AsyncJobTipo.CORRECAO_STATUS_AJUSTE_ESTRUTURA,
      payload: payload as unknown as Prisma.InputJsonValue,
      prioridade: 1,
    });

    return {
      jobId: job.id,
      status: job.status,
    };
  }

  async ajustarEstruturaCatalogo(
    parametros: { ncmCodigo: string; modalidade: string; catalogoId: number },
    superUserId: number,
    opcoes?: { onHeartbeat?: () => Promise<void> }
  ): Promise<AjusteEstruturaCatalogoResultadoDTO> {
    const ncmCodigo = parametros.ncmCodigo;
    const modalidade = this.normalizarModalidadeAjusteEstrutura(parametros.modalidade);
    const filtroModalidade = this.montarFiltroModalidadeAjusteEstrutura(modalidade);

    const produtos = await catalogoPrisma.produto.findMany({
      where: {
        ncmCodigo,
        ...filtroModalidade,
        catalogoId: parametros.catalogoId,
        catalogo: { superUserId },
        status: 'AJUSTAR_ESTRUTURA',
      },
      include: {
        atributos: {
          include: {
            atributo: { select: { codigo: true, multivalorado: true } },
            valores: { select: { valorJson: true, ordem: true }, orderBy: { ordem: 'asc' } },
          },
        },
      },
    });

    if (!produtos.length) {
      throw new Error('Nenhum produto pendente encontrado para o catálogo informado.');
    }

    const estruturaInfo = await this.obterEstruturaAtributos(ncmCodigo, modalidade);
    const mapaEstrutura = this.mapearEstruturaPorCodigo(estruturaInfo.estrutura);
    const estruturaLista = flattenEstrutura(estruturaInfo.estrutura);

    const resultado = await catalogoPrisma.$transaction(
      async tx => {
        const produtoIdsElegiveis: number[] = [];

        for (const [indice, produto] of produtos.entries()) {
          if (opcoes?.onHeartbeat && indice % 10 === 0) {
            await opcoes.onHeartbeat();
          }

          const valoresOriginais = this.montarValoresDosAtributos(produto.atributos, {
            produtoId: produto.id,
            versaoAtributoId: produto.versaoAtributoId,
            origem: 'produto.ajustarEstruturaCatalogo',
          });
          const valoresFiltrados = Object.fromEntries(
            Object.entries(valoresOriginais).filter(([codigo]) => mapaEstrutura.has(codigo))
          );

          await tx.produtoAtributo.deleteMany({ where: { produtoId: produto.id } });

          await tx.produto.update({
            where: { id: produto.id },
            data: {
              versaoAtributoId: estruturaInfo.versaoId,
              versaoEstruturaAtributos: estruturaInfo.versaoNumero,
            },
          });

          if (Object.keys(valoresFiltrados).length > 0) {
            await this.salvarValoresProduto(tx, produto.id, estruturaInfo, valoresFiltrados);
          }

          const resumo = calcularResumoProduto(valoresFiltrados, estruturaLista);
          const statusAtual = produto.status ?? 'AJUSTAR_ESTRUTURA';
          const novoStatus = resolverStatusProduto({
            statusAtual,
            possuiObrigatoriosPendentes: resumo.obrigatoriosPendentes > 0,
          });

          await this.produtoResumoService.salvarResumoProduto(
            produto.id,
            parametros.catalogoId,
            resumo,
            tx
          );

          await tx.produto.update({
            where: { id: produto.id },
            data: { status: novoStatus },
          });

          if (produto.situacao === 'ATIVADO' && novoStatus === 'APROVADO') {
            produtoIdsElegiveis.push(produto.id);
          }
        }

        if (opcoes?.onHeartbeat) {
          await opcoes.onHeartbeat();
        }

        const preparoTransmissao = await this.prepararPreTransmissaoAutomaticaAjusteEstrutura(tx, {
          catalogoId: parametros.catalogoId,
          modalidade,
          ncmCodigo,
          produtoIdsElegiveis,
          superUserId,
        });

        return {
          ajustados: produtos.length,
          transmissaoGerada: preparoTransmissao.transmissaoGerada,
          produtosElegiveis: produtoIdsElegiveis.length,
          produtosIncluidos: preparoTransmissao.produtoIdsIncluidos.length,
          produtosIgnoradosDuplicidade: preparoTransmissao.produtoIdsIgnoradosDuplicidade.length,
        };
      },
      {
        timeout: ProdutoService.AJUSTE_ESTRUTURA_TRANSACTION_TIMEOUT_MS,
      }
    );

    return resultado;
  }

  async corrigirStatusAjusteEstruturaProdutos(
    dados: { produtoIds?: number[] },
    superUserId: number,
    opcoes?: { onHeartbeat?: () => Promise<void> }
  ): Promise<CorrecaoStatusAjusteEstruturaResultadoDTO> {
    const produtoIds = Array.isArray(dados.produtoIds)
      ? [...new Set(
          dados.produtoIds
            .map(id => Number(id))
            .filter(id => Number.isInteger(id) && id > 0)
        )]
      : [];

    const produtosBase = await catalogoPrisma.produto.findMany({
      where: {
        status: 'AJUSTAR_ESTRUTURA',
        catalogo: { superUserId },
        ...(produtoIds.length ? { id: { in: produtoIds } } : {}),
      },
      select: { id: true },
      orderBy: { id: 'asc' },
    });

    if (!produtosBase.length) {
      throw new Error('Nenhum produto em AJUSTAR_ESTRUTURA encontrado para correção.');
    }

    const estruturaAtualizadaCache = new Map<string, EstruturaComVersao>();
    const estruturaVersaoCache = new Map<number, EstruturaComVersao | null>();
    const resumo: CorrecaoStatusAjusteEstruturaResultadoDTO = {
      totalAnalisados: 0,
      mantidosAjuste: 0,
      restauradosPendente: 0,
      restauradosAprovado: 0,
      restauradosTransmitido: 0,
      sincronizadosVersao: 0,
    };

    const carregarEstruturaAtualizada = async (ncmCodigo: string, modalidade: string | null) => {
      const modalidadeNormalizada = this.normalizarModalidade(modalidade ?? '');
      const chave = ProdutoService.montarChaveEstrutura(ncmCodigo, modalidadeNormalizada);
      if (!estruturaAtualizadaCache.has(chave)) {
        const estrutura = await this.obterEstruturaAtributos(ncmCodigo, modalidadeNormalizada);
        estruturaAtualizadaCache.set(chave, estrutura);
      }
      return estruturaAtualizadaCache.get(chave)!;
    };

    for (
      let indiceLote = 0;
      indiceLote < produtosBase.length;
      indiceLote += ProdutoService.CORRECAO_STATUS_AJUSTE_ESTRUTURA_BATCH_SIZE
    ) {
      const loteIds = produtosBase
        .slice(indiceLote, indiceLote + ProdutoService.CORRECAO_STATUS_AJUSTE_ESTRUTURA_BATCH_SIZE)
        .map(produto => produto.id);

      const produtos = await catalogoPrisma.produto.findMany({
        where: { id: { in: loteIds }, catalogo: { superUserId } },
        include: {
          atributos: {
            include: {
              atributo: { select: { codigo: true, multivalorado: true } },
              valores: { orderBy: { ordem: 'asc' } },
            },
          },
        },
        orderBy: { id: 'asc' },
      });

      for (const [indiceProduto, produto] of produtos.entries()) {
        if (opcoes?.onHeartbeat && indiceProduto % 10 === 0) {
          await opcoes.onHeartbeat();
        }

        const estruturaAtual = await this.buscarEstruturaPorVersaoComCache(
          produto.versaoAtributoId,
          estruturaVersaoCache
        );
        const estruturaAtualizada = await carregarEstruturaAtualizada(
          produto.ncmCodigo,
          produto.modalidade
        );
        const diagnostico = this.diagnosticarImpactoAjusteEstrutura({
          produto,
          estruturaAtual,
          estruturaAtualizada,
        });

        resumo.totalAnalisados += 1;

        if (diagnostico.impactado) {
          resumo.mantidosAjuste += 1;
          continue;
        }

        const statusRestaurado = this.resolverStatusRestauradoAjusteEstrutura(
          produto,
          diagnostico.resumoProjetado
        );
        const precisaSincronizarVersao =
          produto.versaoAtributoId !== estruturaAtualizada.versaoId ||
          produto.versaoEstruturaAtributos !== estruturaAtualizada.versaoNumero;

        await catalogoPrisma.$transaction(async tx => {
          if (precisaSincronizarVersao) {
            await tx.produtoAtributo.deleteMany({ where: { produtoId: produto.id } });

            await tx.produto.update({
              where: { id: produto.id },
              data: {
                versaoAtributoId: estruturaAtualizada.versaoId,
                versaoEstruturaAtributos: estruturaAtualizada.versaoNumero,
              },
            });

            if (Object.keys(diagnostico.valoresProjetados).length > 0) {
              await this.salvarValoresProduto(
                tx,
                produto.id,
                estruturaAtualizada,
                diagnostico.valoresProjetados
              );
            }
          }

          await this.produtoResumoService.salvarResumoProduto(
            produto.id,
            produto.catalogoId,
            diagnostico.resumoProjetado,
            tx
          );

          await tx.produto.update({
            where: { id: produto.id },
            data: { status: statusRestaurado },
          });
        });

        if (precisaSincronizarVersao) {
          resumo.sincronizadosVersao += 1;
        }

        if (statusRestaurado === 'TRANSMITIDO') {
          resumo.restauradosTransmitido += 1;
        } else if (statusRestaurado === 'PENDENTE') {
          resumo.restauradosPendente += 1;
        } else {
          resumo.restauradosAprovado += 1;
        }
      }

      if (opcoes?.onHeartbeat) {
        await opcoes.onHeartbeat();
      }
    }

    return resumo;
  }

  async resolverSelecaoProdutos(
    dados: RemoverProdutosEmMassaDTO,
    superUserId: number,
    mensagens?: {
      mensagemErroVazio?: string;
      mensagemErroConsulta?: string;
    }
  ): Promise<number[]> {
    const idsSelecionados = Array.isArray(dados.idsSelecionados)
      ? [...new Set(
          dados.idsSelecionados
            .map(id => Number(id))
            .filter(id => Number.isInteger(id) && id > 0)
        )]
      : [];
    const idsDeselecionados = Array.isArray(dados.idsDeselecionados)
      ? [...new Set(
          dados.idsDeselecionados
            .map(id => Number(id))
            .filter(id => Number.isInteger(id) && id > 0)
        )]
      : [];

    if (!dados.todosFiltrados && idsSelecionados.length === 0) {
      throw new ValidationError({
        produtos: mensagens?.mensagemErroVazio ?? 'Nenhum produto selecionado',
      });
    }

    const whereBase = this.montarCondicoesBase(dados.filtros ?? {}, superUserId, dados.busca);
    const where: Prisma.ProdutoWhereInput = { ...whereBase };

    if (dados.todosFiltrados) {
      if (idsDeselecionados.length > 0) {
        where.id = { notIn: idsDeselecionados };
      }
    } else {
      where.id = { in: idsSelecionados };
    }

    const produtos = await catalogoPrisma.produto.findMany({
      where,
      select: { id: true },
    });

    if (!produtos.length) {
      throw new ValidationError({
        produtos: mensagens?.mensagemErroConsulta ?? 'Nenhum produto correspondente encontrado',
      });
    }

    return produtos.map(p => p.id);
  }

  async clonar(id: number, data: CloneProdutoDTO, superUserId: number) {
    const original = await catalogoPrisma.produto.findFirst({
      where: { id, catalogo: { superUserId } },
      include: {
        atributos: {
          include: {
            atributo: { select: { codigo: true, multivalorado: true } },
            valores: { orderBy: { ordem: 'asc' } }
          }
        },
        codigosInternos: true,
        operadoresEstrangeiros: true
      }
    });

    if (!original) {
      throw new Error(`Produto ID ${id} não encontrado`);
    }

    const catalogoDestino = await catalogoPrisma.catalogo.findFirst({
      where: { id: data.catalogoId, superUserId }
    });

    if (!catalogoDestino) {
      throw new Error('Catálogo de destino não encontrado para o superusuário');
    }

    const skus = (data.codigosInternos ?? [])
      .map(codigo => codigo.trim())
      .filter(codigo => codigo.length > 0);

    if (new Set(skus).size !== skus.length) {
      throw new ValidationError({
        codigosInternos: 'Códigos internos duplicados não são permitidos'
      });
    }

    let estruturaInfo = original.versaoAtributoId
      ? await this.atributosService.buscarEstruturaPorVersao(original.versaoAtributoId)
      : null;

    if (!estruturaInfo) {
      estruturaInfo = await this.obterEstruturaAtributos(original.ncmCodigo, original.modalidade || '');
    }

    const valoresOriginais = this.montarValoresDosAtributos(original.atributos, {
      produtoId: original.id,
      versaoAtributoId: original.versaoAtributoId,
      origem: 'produto.clonar',
    });
    const valoresParaStatus = filtrarValoresAtributosVisiveis(
      valoresOriginais,
      this.mapearEstruturaPorCodigo(estruturaInfo!.estrutura)
    );
    const preencheuObrigatorios = this.todosObrigatoriosPreenchidos(
      valoresParaStatus,
      estruturaInfo!.estrutura
    );
    const statusInicial = resolverStatusInicialProduto({
      possuiObrigatoriosPendentes: !preencheuObrigatorios
    });

    const novoId = await catalogoPrisma.$transaction(async (tx) => {
      const novo = await tx.produto.create({
        data: {
          codigo: null,
          versao: null,
          status: statusInicial,
          situacao: 'RASCUNHO',
          ncmCodigo: original.ncmCodigo,
          modalidade: original.modalidade,
          denominacao: data.denominacao.trim(),
          descricao: original.descricao,
          numero: 0,
          catalogoId: data.catalogoId,
          versaoEstruturaAtributos: estruturaInfo?.versaoNumero ?? original.versaoEstruturaAtributos,
          versaoAtributoId: estruturaInfo?.versaoId ?? original.versaoAtributoId,
          criadoPor: original.criadoPor,
          codigosInternos: skus.length
            ? {
                create: skus.map(codigo => ({ codigo }))
              }
            : undefined,
          operadoresEstrangeiros: original.operadoresEstrangeiros.length
            ? {
                create: original.operadoresEstrangeiros.map((oe) => ({
                  paisCodigo: oe.paisCodigo,
                  conhecido: oe.conhecido,
                  operadorEstrangeiroId:
                    data.catalogoId === original.catalogoId
                      ? oe.operadorEstrangeiroId ?? null
                      : null
                }))
              }
            : undefined
        }
      });

      await this.salvarValoresProduto(tx, novo.id, estruturaInfo!, valoresOriginais);

      await this.produtoResumoService.recalcularResumoProduto(novo.id, tx);

      return novo.id;
    });

    const produto = await this.buscarPorId(novoId, superUserId);
    if (!produto) {
      throw new Error('Falha ao carregar produto clonado');
    }

    return produto;
  }

  private static montarChaveEstrutura(ncm: string, modalidade: string) {
    const ncmNormalizado = (ncm ?? '').trim().toUpperCase();
    const modalidadeNormalizada = (modalidade ?? '').trim().toUpperCase();
    return `${ncmNormalizado}::${modalidadeNormalizada}`;
  }

  private static invalidarEstruturaCache(ncm: string, modalidade: string) {
    const chave = this.montarChaveEstrutura(ncm, modalidade);
    this.estruturaCache.delete(chave);
  }

  static limparCacheEstrutura() {
    this.estruturaCache.clear();
  }

  private normalizarModalidade(modalidade: string) {
    const valor = (modalidade ?? '').trim();
    return valor ? valor : 'IMPORTACAO';
  }

  private normalizarTextoComparacao(valor: unknown) {
    return String(valor ?? '').replace(/\s+/g, ' ').trim();
  }

  private async obterEstruturaAtributos(
    ncm: string,
    modalidade: string,
    opcoes: { verificarAtualizacaoLegado?: boolean } = {}
  ): Promise<EstruturaComVersao> {
    const modalidadeNormalizada = this.normalizarModalidade(modalidade);
    const chave = ProdutoService.montarChaveEstrutura(ncm, modalidadeNormalizada);
    const emCache = ProdutoService.estruturaCache.get(chave);
    const agora = Date.now();

    if (opcoes.verificarAtualizacaoLegado) {
      try {
        const estrutura = await this.atributosService.buscarEstruturaAtualizada(
          ncm,
          modalidadeNormalizada
        );
        ProdutoService.estruturaCache.set(chave, {
          dados: estrutura,
          proximaVerificacao:
            Date.now() + ProdutoService.ESTRUTURA_CACHE_REVALIDACAO_MS
        });
        return estrutura;
      } catch (error) {
        logger.warn(
          'Não foi possível verificar a estrutura atualizada no legacy, usando estrutura local',
          error
        );
        return this.obterEstruturaAtributos(ncm, modalidadeNormalizada);
      }
    }

    if (emCache) {
      if (agora < emCache.proximaVerificacao) {
        return emCache.dados;
      }

      try {
        const versaoAtualId = await this.obterVersaoAtualId(
          ncm,
          modalidadeNormalizada
        );

        const versaoCache = emCache.dados.versaoId;
        if (
          versaoAtualId !== null &&
          versaoAtualId !== undefined &&
          versaoAtualId === versaoCache
        ) {
          const atualizada = {
            dados: emCache.dados,
            proximaVerificacao:
              agora + ProdutoService.ESTRUTURA_CACHE_REVALIDACAO_MS
          };
          ProdutoService.estruturaCache.set(chave, atualizada);
          return atualizada.dados;
        }

        if (versaoAtualId === null && versaoCache === 0) {
          const atualizada = {
            dados: emCache.dados,
            proximaVerificacao:
              agora + ProdutoService.ESTRUTURA_CACHE_REVALIDACAO_MS
          };
          ProdutoService.estruturaCache.set(chave, atualizada);
          return atualizada.dados;
        }
      } catch (error) {
        logger.warn(
          'Não foi possível verificar a versão da estrutura de atributos, refazendo sincronização',
          error
        );
      }

      ProdutoService.estruturaCache.delete(chave);
    }

    try {
      const estrutura = await this.atributosService.buscarEstrutura(
        ncm,
        modalidadeNormalizada
      );
      ProdutoService.estruturaCache.set(chave, {
        dados: estrutura,
        proximaVerificacao:
          Date.now() + ProdutoService.ESTRUTURA_CACHE_REVALIDACAO_MS
      });
      return estrutura;
    } catch (error) {
      logger.error('Erro ao obter atributos do legacy:', error);
      return {
        versaoId: 0,
        versaoNumero: 0,
        estrutura: []
      };
    }
  }

  private async obterVersaoAtualId(ncm: string, modalidade: string) {
    const versao = await catalogoPrisma.atributoVersao.findFirst({
      where: { ncmCodigo: ncm, modalidade },
      orderBy: { versao: 'desc' },
      select: { id: true }
    });

    return versao?.id ?? null;
  }

  private mapearEstruturaPorCodigo(
    estrutura: AtributoEstruturaDTO[]
  ): Map<string, AtributoEstruturaDTO> {
    const mapa = new Map<string, AtributoEstruturaDTO>();
    const percorrer = (lista: AtributoEstruturaDTO[]) => {
      for (const item of lista) {
        mapa.set(item.codigo, item);
        if (item.subAtributos) percorrer(item.subAtributos);
      }
    };
    percorrer(estrutura);
    return mapa;
  }

  private montarValoresDosAtributos(
    registros: Array<{
      id?: number;
      atributoVersaoId?: number | null;
      atributo: { codigo: string; multivalorado: boolean } | null;
      valores: Array<{ valorJson: Prisma.JsonValue; ordem?: number | null }>;
    }>,
    opcoes?: {
      produtoId?: number;
      versaoAtributoId?: number | null;
      origem?: string;
    }
  ): Record<string, any> {
    const resultado: Record<string, any> = {};
    const registrosNormalizados = normalizarAtributosProdutoPorVersao(registros, opcoes);

    for (const registro of registrosNormalizados) {
      if (!registro.atributo) continue;
      const codigo = registro.atributo.codigo;
      const valores = registro.valores.map(v => v.valorJson as any);
      if (registro.atributo.multivalorado) {
        resultado[codigo] = valores;
      } else {
        resultado[codigo] = valores.length > 0 ? valores[0] : null;
      }
    }
    return resultado;
  }

  private normalizarValorEntrada(valor: any): any[] {
    if (Array.isArray(valor)) {
      return valor.flatMap(item => this.normalizarValorEntrada(item));
    }
    if (valor === undefined || valor === null) return [];
    return [valor];
  }

  private async salvarValoresProduto(
    tx: Prisma.TransactionClient,
    produtoId: number,
    estruturaInfo: EstruturaComVersao,
    valores: Record<string, any>
  ) {
    const mapa = this.mapearEstruturaPorCodigo(estruturaInfo.estrutura);
    for (const [codigo, valor] of Object.entries(valores)) {
      const atributo = mapa.get(codigo);
      if (!atributo?.id) continue;
      const valoresNormalizados = this.normalizarValorEntrada(valor);
      if (!valoresNormalizados.length) continue;

      await tx.produtoAtributo.create({
        data: {
          produtoId,
          atributoId: atributo.id,
          atributoVersaoId: estruturaInfo.versaoId,
          valores: {
            create: valoresNormalizados.map((item, ordem) => ({
              valorJson: item as Prisma.InputJsonValue,
              ordem
            }))
          }
        }
      });
    }
  }

  private montarAtributosParaCriacao(
    estruturaInfo: EstruturaComVersao,
    valores: Record<string, any>
  ): Prisma.ProdutoAtributoCreateWithoutProdutoInput[] {
    const mapa = this.mapearEstruturaPorCodigo(estruturaInfo.estrutura);
    const atributos: Prisma.ProdutoAtributoCreateWithoutProdutoInput[] = [];

    for (const [codigo, valor] of Object.entries(valores)) {
      const atributo = mapa.get(codigo);
      if (!atributo?.id) continue;

      const valoresNormalizados = this.normalizarValorEntrada(valor);
      if (!valoresNormalizados.length) continue;

      atributos.push({
        atributo: {
          connect: { id: atributo.id },
        },
        versao: {
          connect: { id: estruturaInfo.versaoId },
        },
        valores: {
          create: valoresNormalizados.map((item, ordem) => ({
            valorJson: item as Prisma.InputJsonValue,
            ordem,
          })),
        },
      });
    }

    return atributos;
  }

  private todosObrigatoriosPreenchidos(
    valores: Record<string, any>,
    estrutura: AtributoEstruturaDTO[]
  ): boolean {
    const todos: AtributoEstruturaDTO[] = [];
    function coletar(attrs: AtributoEstruturaDTO[]) {
      for (const a of attrs) {
        todos.push(a);
        if (a.subAtributos) coletar(a.subAtributos);
      }
    }
    coletar(estrutura);

    const mapa = new Map<string, AtributoEstruturaDTO>();
    for (const a of todos) mapa.set(a.codigo, a);

    for (const attr of todos) {
      if (!attr.obrigatorio) continue;
      if (!condicaoAtributoAtendida(attr, valores, mapa)) continue;
      const v = valores[attr.codigo];
      if (valoresComoArrayCondicional(v).length === 0) return false;
    }
    return true;
  }

  private validarValores(valores: Record<string, any>, estrutura: AtributoEstruturaDTO[]): Record<string, string> {
    const erros: Record<string, string> = {};

    const todos: AtributoEstruturaDTO[] = [];
    function coletar(attrs: AtributoEstruturaDTO[]) {
      for (const a of attrs) {
        todos.push(a);
        if (a.subAtributos) coletar(a.subAtributos);
      }
    }
    coletar(estrutura);

    const mapa = new Map<string, AtributoEstruturaDTO>();
    for (const a of todos) mapa.set(a.codigo, a);

    for (const attr of todos) {
      if (!condicaoAtributoAtendida(attr, valores, mapa)) continue;
      const v = valores[attr.codigo];
      const valoresAttr = valoresComoArrayCondicional(v);
      if (valoresAttr.length === 0) continue;

      if (attr.validacoes?.tamanho_maximo && valoresAttr.some(item => item.length > attr.validacoes.tamanho_maximo)) {
        erros[attr.codigo] = 'Tamanho máximo excedido';
        continue;
      }
      switch (attr.tipo) {
        case 'NUMERO_INTEIRO':
          if (valoresAttr.some(item => !/^[-]?\d+$/.test(item))) {
            erros[attr.codigo] = 'Número inteiro inválido';
          }
          break;
        case 'NUMERO_REAL':
          if (valoresAttr.some(item => isNaN(Number(item)))) {
            erros[attr.codigo] = 'Número real inválido';
          }
          break;
        case 'LISTA_ESTATICA':
          if (
            attr.dominio &&
            !valoresAttr.every(item => attr.dominio!.some(d => String(d.codigo) === item))
          ) {
            erros[attr.codigo] = 'Valor fora do domínio';
          }
          break;
        case 'BOOLEANO':
          if (valoresAttr.some(item => item !== 'true' && item !== 'false')) {
            erros[attr.codigo] = 'Valor booleano inválido';
          }
          break;
      }
    }
    return erros;
  }
}

