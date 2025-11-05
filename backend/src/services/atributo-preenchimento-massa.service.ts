import { AsyncJobStatus, AsyncJobTipo, Prisma } from '@prisma/client';
import { catalogoPrisma } from '../utils/prisma';
import {
  AtributoLegacyService,
  EstruturaComVersao,
  AtributoEstruturaDTO
} from './atributo-legacy.service';
import { ProdutoResumoService } from './produto-resumo.service';
import { createAsyncJob } from '../jobs/async-job.repository';

export interface AtributoPreenchimentoMassaCreateInput {
  ncmCodigo: string;
  modalidade?: string | null;
  catalogoIds?: number[];
  valoresAtributos?: Prisma.InputJsonValue;
  estruturaSnapshot?: Prisma.InputJsonValue;
  produtosExcecao?: Array<{ id: number } | { id: number; [chave: string]: any }>;
}

type RegistroMassaPayload = Prisma.AtributoPreenchimentoMassaGetPayload<{
  include: { asyncJob: { select: { id: true; status: true; finalizadoEm: true } } };
}>;

export interface AtributoPreenchimentoMassaJobPayload {
  registroId: number;
  superUserId: number;
  solicitanteNome?: string | null;
  ncmCodigo: string;
  modalidade: string | null;
  catalogoIds: number[];
  catalogosDetalhes: Array<{ id: number; nome: string | null; numero: number | null; cpf_cnpj: string | null }>;
  valoresAtributos: Record<string, unknown>;
  atributosParaAtualizar: Array<{
    atributoId: number;
    codigo: string;
    valores: Prisma.InputJsonValue[];
  }>;
  estruturaVersaoId: number;
  estruturaVersaoNumero: number;
  estruturaSnapshot: EstruturaComVersao['estrutura'] | null;
  produtosExcecaoIds: number[];
  produtosExcecaoDetalhes: Array<{
    id: number;
    codigo: string | null;
    denominacao: string;
    catalogo?: { id: number; nome: string | null; numero: number | null; cpf_cnpj: string | null } | null;
  }>;
}

export interface AtributoPreenchimentoMassaJobAgendado {
  jobId: number;
}

export interface ProdutoImpactadoResumo {
  id: number;
  denominacao: string;
  codigos: string[];
  catalogo?: { id: number; nome: string | null; numero: number | null; cpf_cnpj: string | null } | null;
}

export interface AtributoPreenchimentoMassaResumo {
  id: number;
  superUserId: number;
  ncmCodigo: string;
  modalidade: string | null;
  catalogoIds: number[];
  catalogos: Array<{ id: number; nome: string | null; numero: number | null; cpf_cnpj: string | null }>;
  valoresAtributos: Record<string, unknown>;
  estruturaSnapshot: EstruturaComVersao['estrutura'] | null;
  produtosExcecao: Array<{
    id: number;
    codigo: string | null;
    denominacao: string;
    catalogo?: { id: number; nome: string | null; numero: number | null; cpf_cnpj: string | null } | null;
  }>;
  produtosImpactados: number;
  produtosImpactadosDetalhes: ProdutoImpactadoResumo[];
  criadoEm: Date;
  criadoPor: string | null;
  jobId: number | null;
  jobStatus: AsyncJobStatus | null;
  jobFinalizadoEm: Date | null;
}

export class AtributoPreenchimentoMassaService {
  private readonly atributosService = new AtributoLegacyService();
  private readonly produtoResumoService = new ProdutoResumoService();

  async listar(superUserId: number): Promise<AtributoPreenchimentoMassaResumo[]> {
    const registros = await catalogoPrisma.atributoPreenchimentoMassa.findMany({
      where: { superUserId },
      orderBy: { criadoEm: 'desc' },
      include: { asyncJob: { select: { id: true, status: true, finalizadoEm: true } } }
    });

    return registros.map(registro => this.montarResposta(registro));
  }

  async buscarPorId(id: number, superUserId: number): Promise<AtributoPreenchimentoMassaResumo | null> {
    const registro = await catalogoPrisma.atributoPreenchimentoMassa.findFirst({
      where: { id, superUserId },
      include: { asyncJob: { select: { id: true, status: true, finalizadoEm: true } } }
    });

    if (!registro) return null;

    const resposta = this.montarResposta(registro);
    const produtosImpactadosDetalhes = await this.carregarProdutosImpactadosDetalhes(resposta);

    return { ...resposta, produtosImpactadosDetalhes };
  }

  async criar(
    dados: AtributoPreenchimentoMassaCreateInput,
    superUserId: number,
    usuario?: { nome?: string }
  ): Promise<AtributoPreenchimentoMassaJobAgendado> {
    const payloadBase = await this.montarJobPayload(dados, superUserId, usuario?.nome ?? null);

    const resultado = await catalogoPrisma.$transaction(async tx => {
      const registro = await tx.atributoPreenchimentoMassa.create({
        data: this.montarDadosRegistro(payloadBase, 0, []),
        include: { asyncJob: { select: { id: true, status: true, finalizadoEm: true } } }
      });

      const job = await createAsyncJob(
        {
          tipo: AsyncJobTipo.ALTERACAO_ATRIBUTOS,
          payload: {
            ...payloadBase,
            registroId: registro.id
          } as unknown as Prisma.InputJsonValue
        },
        tx
      );

      await tx.atributoPreenchimentoMassa.update({
        where: { id: registro.id },
        data: { asyncJobId: job.id }
      });

      return { jobId: job.id };
    });

    return resultado;
  }

  private async montarJobPayload(
    dados: AtributoPreenchimentoMassaCreateInput,
    superUserId: number,
    solicitanteNome?: string | null
  ): Promise<AtributoPreenchimentoMassaJobPayload> {
    const modalidadeNormalizada = dados.modalidade?.toUpperCase() ?? null;
    const catalogoIdsUnicos = dados.catalogoIds
      ? Array.from(
          new Set(
            dados.catalogoIds
              .map(valor => Number(valor))
              .filter(valor => Number.isInteger(valor) && valor > 0)
          )
        )
      : [];

    if (catalogoIdsUnicos.length) {
      const catalogosValidos = await catalogoPrisma.catalogo.findMany({
        where: { id: { in: catalogoIdsUnicos }, superUserId },
        select: { id: true, nome: true, numero: true, cpf_cnpj: true }
      });
      if (catalogosValidos.length !== catalogoIdsUnicos.length) {
        throw new Error('Catálogo inválido para o superusuário informado.');
      }
    }

    const valoresEntrada = (dados.valoresAtributos ?? {}) as Record<string, unknown>;
    const estruturaInfo = await this.obterEstruturaAtributos(
      dados.ncmCodigo,
      modalidadeNormalizada || 'IMPORTACAO'
    );

    const mapaEstrutura = this.mapearEstruturaPorCodigo(estruturaInfo.estrutura);
    const valoresFiltrados: Record<string, unknown> = {};
    const atributosParaAtualizar: AtributoPreenchimentoMassaJobPayload['atributosParaAtualizar'] = [];

    for (const [codigo, valor] of Object.entries(valoresEntrada)) {
      const atributo = mapaEstrutura.get(codigo);
      if (!atributo?.id) continue;
      const valoresNormalizados = this.normalizarValorEntrada(valor);
      if (!valoresNormalizados.length) continue;

      valoresFiltrados[codigo] = valor as unknown;
      atributosParaAtualizar.push({
        atributoId: atributo.id,
        codigo,
        valores: valoresNormalizados.map(item => item as Prisma.InputJsonValue)
      });
    }

    if (!atributosParaAtualizar.length) {
      throw new Error('Informe ao menos um atributo válido para aplicar em massa.');
    }

    const produtosExcecaoIds = Array.from(
      new Set(
        (dados.produtosExcecao ?? [])
          .map(item => Number(item?.id))
          .filter(valor => Number.isInteger(valor) && valor > 0)
      )
    );

    let produtosExcecaoDetalhes: AtributoPreenchimentoMassaJobPayload['produtosExcecaoDetalhes'] = [];

    if (produtosExcecaoIds.length) {
      const produtos = await catalogoPrisma.produto.findMany({
        where: { id: { in: produtosExcecaoIds }, catalogo: { superUserId } },
        select: {
          id: true,
          codigo: true,
          denominacao: true,
          catalogo: { select: { id: true, nome: true, numero: true, cpf_cnpj: true } }
        }
      });
      if (produtos.length !== produtosExcecaoIds.length) {
        throw new Error('Produto informado como exceção não encontrado para este superusuário.');
      }
      produtosExcecaoDetalhes = produtos.map(produto => ({
        id: produto.id,
        codigo: produto.codigo ?? null,
        denominacao: produto.denominacao,
        catalogo: produto.catalogo
          ? {
              id: produto.catalogo.id,
              nome: produto.catalogo.nome,
              numero: produto.catalogo.numero,
              cpf_cnpj: produto.catalogo.cpf_cnpj
            }
          : null
      }));
    }

    const catalogosDetalhes = catalogoIdsUnicos.length
      ? await catalogoPrisma.catalogo.findMany({
          where: { id: { in: catalogoIdsUnicos } },
          select: { id: true, nome: true, numero: true, cpf_cnpj: true }
        })
      : [];

    const estruturaSnapshot = Array.isArray(dados.estruturaSnapshot)
      ? (dados.estruturaSnapshot as unknown as EstruturaComVersao['estrutura'])
      : estruturaInfo.estrutura;

    return {
      registroId: 0,
      superUserId,
      solicitanteNome: solicitanteNome ?? null,
      ncmCodigo: dados.ncmCodigo,
      modalidade: modalidadeNormalizada,
      catalogoIds: catalogoIdsUnicos,
      catalogosDetalhes: catalogosDetalhes.map(item => ({
        id: item.id,
        nome: item.nome ?? null,
        numero: item.numero ?? null,
        cpf_cnpj: item.cpf_cnpj ?? null
      })),
      valoresAtributos: valoresFiltrados,
      atributosParaAtualizar,
      estruturaVersaoId: estruturaInfo.versaoId,
      estruturaVersaoNumero: estruturaInfo.versaoNumero,
      estruturaSnapshot,
      produtosExcecaoIds,
      produtosExcecaoDetalhes
    };
  }

  async processarJob(
    payload: AtributoPreenchimentoMassaJobPayload,
    heartbeat?: () => Promise<void>
  ): Promise<AtributoPreenchimentoMassaResumo> {
    if (!payload.registroId || payload.registroId <= 0) {
      throw new Error('Registro associado ao job de preenchimento em massa não informado.');
    }

    await heartbeat?.();

    const produtos = await catalogoPrisma.produto.findMany({
      where: {
        ncmCodigo: payload.ncmCodigo,
        catalogo: {
          superUserId: payload.superUserId,
          ...(payload.catalogoIds.length ? { id: { in: payload.catalogoIds } } : {})
        },
        ...(payload.modalidade ? { modalidade: payload.modalidade } : {})
      },
      select: { id: true, status: true }
    });

    const excecaoSet = new Set(payload.produtosExcecaoIds);
    const produtosParaAtualizar = produtos.filter(produto => !excecaoSet.has(produto.id));

    let atualizados = 0;

    for (const produto of produtosParaAtualizar) {
      let statusAtual = produto.status;
      await catalogoPrisma.$transaction(async tx => {
        await tx.produto.update({
          where: { id: produto.id },
          data: {
            versaoAtributoId: payload.estruturaVersaoId,
            versaoEstruturaAtributos: payload.estruturaVersaoNumero
          }
        });

        for (const atributo of payload.atributosParaAtualizar) {
          if (!atributo.valores.length) {
            await tx.produtoAtributo.deleteMany({
              where: { produtoId: produto.id, atributoId: atributo.atributoId }
            });
            continue;
          }

          await tx.produtoAtributo.upsert({
            where: {
              uk_produto_atributo: {
                produtoId: produto.id,
                atributoId: atributo.atributoId
              }
            },
            create: {
              produtoId: produto.id,
              atributoId: atributo.atributoId,
              atributoVersaoId: payload.estruturaVersaoId,
              valores: {
                create: atributo.valores.map((item, ordem) => ({
                  valorJson: item,
                  ordem
                }))
              }
            },
            update: {
              atributoVersaoId: payload.estruturaVersaoId,
              valores: {
                deleteMany: {},
                create: atributo.valores.map((item, ordem) => ({
                  valorJson: item,
                  ordem
                }))
              }
            }
          });
        }

        const resumo = await this.produtoResumoService.recalcularResumoProduto(produto.id, tx);

        if (resumo) {
          let novoStatus = statusAtual;

          if (resumo.obrigatoriosPendentes > 0) {
            novoStatus = 'PENDENTE';
          } else if (statusAtual === 'PENDENTE') {
            novoStatus = 'APROVADO';
          }

          if (novoStatus !== statusAtual) {
            await tx.produto.update({
              where: { id: produto.id },
              data: { status: novoStatus }
            });
            statusAtual = novoStatus;
          }
        }
      });

      atualizados += 1;

      if (heartbeat && atualizados % 10 === 0) {
        await heartbeat();
      }
    }

    const produtosImpactadosDetalhes = produtosParaAtualizar.length
      ? await catalogoPrisma.produto.findMany({
          where: { id: { in: produtosParaAtualizar.map(produto => produto.id) } },
          select: {
            id: true,
            denominacao: true,
            catalogo: { select: { id: true, nome: true, numero: true, cpf_cnpj: true } },
            codigosInternos: { select: { codigo: true }, orderBy: { id: 'asc' } }
          },
          orderBy: { id: 'asc' }
        })
      : [];

    const registro = await catalogoPrisma.atributoPreenchimentoMassa.update({
      where: { id: payload.registroId },
      data: this.montarDadosRegistro(
        payload,
        produtosParaAtualizar.length,
        produtosImpactadosDetalhes.map(produto => ({
          id: produto.id,
          denominacao: produto.denominacao,
          catalogo: produto.catalogo
            ? {
                id: produto.catalogo.id,
                nome: produto.catalogo.nome ?? null,
                numero: produto.catalogo.numero ?? null,
                cpf_cnpj: produto.catalogo.cpf_cnpj ?? null
              }
            : null,
          codigos: produto.codigosInternos.map(item => item.codigo)
        }))
      ),
      include: { asyncJob: { select: { id: true, status: true, finalizadoEm: true } } }
    });

    await heartbeat?.();

    return this.montarResposta(registro);
  }

  private montarResposta(registro: RegistroMassaPayload): AtributoPreenchimentoMassaResumo {
    const catalogoIds = Array.isArray(registro.catalogoIdsJson)
      ? (registro.catalogoIdsJson as unknown[])
          .map(valor => Number(valor))
          .filter(valor => Number.isInteger(valor))
      : [];

    const catalogos = Array.isArray(registro.catalogosJson)
      ? (registro.catalogosJson as Array<{ id: number; nome?: string | null; numero?: number | null; cpf_cnpj?: string | null }>).map(
          catalogo => ({
            id: catalogo.id,
            nome: catalogo.nome ?? null,
            numero: catalogo.numero ?? null,
            cpf_cnpj: catalogo.cpf_cnpj ?? null
          })
        )
      : [];

    const produtosExcecao = Array.isArray(registro.produtosExcecaoJson)
      ? (registro.produtosExcecaoJson as Array<{
          id: number;
          codigo?: string | null;
          denominacao?: string;
          catalogo?: { id: number; nome?: string | null; numero?: number | null; cpf_cnpj?: string | null } | null;
        }>).map(item => ({
          id: item.id,
          codigo: item.codigo ?? null,
          denominacao: item.denominacao ?? '',
          catalogo: item.catalogo
            ? {
                id: item.catalogo.id,
                nome: item.catalogo.nome ?? null,
                numero: item.catalogo.numero ?? null,
                cpf_cnpj: item.catalogo.cpf_cnpj ?? null
              }
            : null
        }))
      : [];

    const valoresAtributos = (registro.valoresJson as Record<string, unknown>) ?? {};
    const estruturaSnapshot = Array.isArray(registro.estruturaSnapshotJson)
      ? (registro.estruturaSnapshotJson as unknown as EstruturaComVersao['estrutura'])
      : null;

    const produtosImpactadosDetalhes = Array.isArray(registro.produtosImpactadosDetalhesJson)
      ? (registro.produtosImpactadosDetalhesJson as Array<{
          id: number;
          denominacao?: string;
          codigos?: string[];
          catalogo?: { id: number; nome?: string | null; numero?: number | null; cpf_cnpj?: string | null } | null;
        }>).map(item => ({
          id: item.id,
          denominacao: item.denominacao ?? '',
          codigos: Array.isArray(item.codigos) ? item.codigos.filter(Boolean) : [],
          catalogo: item.catalogo
            ? {
                id: item.catalogo.id,
                nome: item.catalogo.nome ?? null,
                numero: item.catalogo.numero ?? null,
                cpf_cnpj: item.catalogo.cpf_cnpj ?? null
              }
            : null
        }))
      : [];

    return {
      id: registro.id,
      superUserId: registro.superUserId,
      ncmCodigo: registro.ncmCodigo,
      modalidade: registro.modalidade ?? null,
      catalogoIds,
      catalogos,
      valoresAtributos,
      estruturaSnapshot,
      produtosExcecao,
      produtosImpactados: registro.produtosImpactados,
      produtosImpactadosDetalhes,
      criadoEm: registro.criadoEm,
      criadoPor: registro.criadoPor ?? null,
      jobId: registro.asyncJob?.id ?? null,
      jobStatus: registro.asyncJob?.status ?? null,
      jobFinalizadoEm: registro.asyncJob?.finalizadoEm ?? null
    };
  }

  private async carregarProdutosImpactadosDetalhes(
    registro: AtributoPreenchimentoMassaResumo
  ): Promise<ProdutoImpactadoResumo[]> {
    if (registro.produtosImpactadosDetalhes.length || registro.produtosImpactados === 0) {
      return registro.produtosImpactadosDetalhes;
    }

    return [];
  }

  private montarDadosRegistro(
    payload: AtributoPreenchimentoMassaJobPayload,
    produtosImpactados: number,
    produtosImpactadosDetalhes: ProdutoImpactadoResumo[]
  ): Omit<Prisma.AtributoPreenchimentoMassaUncheckedCreateInput, 'id' | 'asyncJobId'> {
    return {
      superUserId: payload.superUserId,
      ncmCodigo: payload.ncmCodigo,
      modalidade: payload.modalidade ?? null,
      catalogoIdsJson:
        payload.catalogoIds.length > 0
          ? (payload.catalogoIds as unknown as Prisma.InputJsonValue)
          : Prisma.DbNull,
      catalogosJson:
        payload.catalogosDetalhes.length > 0
          ? (payload.catalogosDetalhes as unknown as Prisma.InputJsonValue)
          : Prisma.DbNull,
      valoresJson: payload.valoresAtributos as unknown as Prisma.InputJsonValue,
      estruturaSnapshotJson: payload.estruturaSnapshot
        ? (payload.estruturaSnapshot as unknown as Prisma.InputJsonValue)
        : Prisma.DbNull,
      produtosExcecaoJson:
        payload.produtosExcecaoDetalhes.length > 0
          ? (payload.produtosExcecaoDetalhes as unknown as Prisma.InputJsonValue)
          : Prisma.DbNull,
      produtosImpactadosDetalhesJson:
        produtosImpactadosDetalhes.length > 0
          ? (produtosImpactadosDetalhes as unknown as Prisma.InputJsonValue)
          : Prisma.DbNull,
      produtosImpactados,
      criadoPor: payload.solicitanteNome ?? null,
    };
  }

  private async obterEstruturaAtributos(ncmCodigo: string, modalidade: string): Promise<EstruturaComVersao> {
    return this.atributosService.buscarEstrutura(ncmCodigo, modalidade || 'IMPORTACAO');
  }

  private mapearEstruturaPorCodigo(
    estrutura: EstruturaComVersao['estrutura']
  ): Map<string, AtributoEstruturaDTO & { id?: number }> {
    const mapa = new Map<string, AtributoEstruturaDTO & { id?: number }>();
    const percorrer = (lista: AtributoEstruturaDTO[] | undefined) => {
      if (!lista) return;
      for (const item of lista) {
        mapa.set(item.codigo, item);
        if (item.subAtributos?.length) percorrer(item.subAtributos);
      }
    };
    percorrer(estrutura);
    return mapa;
  }

  private normalizarValorEntrada(valor: unknown): any[] {
    if (Array.isArray(valor)) {
      return valor.flatMap(item => this.normalizarValorEntrada(item));
    }
    if (valor === undefined || valor === null) return [];
    return [valor];
  }
}
