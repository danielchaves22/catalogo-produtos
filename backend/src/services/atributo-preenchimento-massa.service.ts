import { Prisma } from '@prisma/client';
import { catalogoPrisma } from '../utils/prisma';
import {
  AtributoLegacyService,
  EstruturaComVersao,
  AtributoEstruturaDTO
} from './atributo-legacy.service';
import { ProdutoResumoService } from './produto-resumo.service';

export interface AtributoPreenchimentoMassaCreateInput {
  ncmCodigo: string;
  modalidade?: string | null;
  catalogoIds?: number[];
  valoresAtributos?: Prisma.InputJsonValue;
  estruturaSnapshot?: Prisma.InputJsonValue;
  produtosExcecao?: Array<{ id: number } | { id: number; [chave: string]: any }>;
}

type RegistroMassaPayload = Prisma.AtributoPreenchimentoMassaGetPayload<{}>;

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
  criadoEm: Date;
  criadoPor: string | null;
}

export class AtributoPreenchimentoMassaService {
  private readonly atributosService = new AtributoLegacyService();
  private readonly produtoResumoService = new ProdutoResumoService();

  async listar(superUserId: number): Promise<AtributoPreenchimentoMassaResumo[]> {
    const registros = await catalogoPrisma.atributoPreenchimentoMassa.findMany({
      where: { superUserId },
      orderBy: { criadoEm: 'desc' }
    });

    return registros.map(registro => this.montarResposta(registro));
  }

  async buscarPorId(id: number, superUserId: number): Promise<AtributoPreenchimentoMassaResumo | null> {
    const registro = await catalogoPrisma.atributoPreenchimentoMassa.findFirst({
      where: { id, superUserId }
    });

    if (!registro) return null;

    return this.montarResposta(registro);
  }

  async criar(
    dados: AtributoPreenchimentoMassaCreateInput,
    superUserId: number,
    usuario?: { nome?: string }
  ): Promise<AtributoPreenchimentoMassaResumo> {
    const modalidadeNormalizada = dados.modalidade?.toUpperCase() ?? null;
    const catalogoIdsUnicos = dados.catalogoIds
      ? Array.from(
          new Set(
            dados.catalogoIds
              .map(valor => Number(valor))
              .filter(valor => Number.isInteger(valor) && valor > 0)
          )
        )
      : undefined;

    if (catalogoIdsUnicos?.length) {
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
    for (const [codigo, valor] of Object.entries(valoresEntrada)) {
      const atributo = mapaEstrutura.get(codigo);
      if (!atributo?.id) continue;
      const valoresNormalizados = this.normalizarValorEntrada(valor);
      if (!valoresNormalizados.length) continue;
      valoresFiltrados[codigo] = valor as unknown;
    }

    if (Object.keys(valoresFiltrados).length === 0) {
      throw new Error('Informe ao menos um atributo válido para aplicar em massa.');
    }

    const produtosExcecaoIds = Array.from(
      new Set(
        (dados.produtosExcecao ?? [])
          .map(item => Number(item?.id))
          .filter(valor => Number.isInteger(valor) && valor > 0)
      )
    );

    let produtosExcecaoDetalhes: Array<{
      id: number;
      codigo: string | null;
      denominacao: string;
      catalogo?: { id: number; nome: string | null; numero: number | null; cpf_cnpj: string | null } | null;
    }> = [];

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

    const produtos = await catalogoPrisma.produto.findMany({
      where: {
        ncmCodigo: dados.ncmCodigo,
        catalogo: {
          superUserId,
          ...(catalogoIdsUnicos?.length ? { id: { in: catalogoIdsUnicos } } : {})
        },
        ...(modalidadeNormalizada ? { modalidade: modalidadeNormalizada } : {})
      },
      select: {
        id: true,
        codigo: true,
        denominacao: true,
        catalogoId: true,
        versaoAtributoId: true,
        versaoEstruturaAtributos: true,
        catalogo: { select: { id: true, nome: true, numero: true, cpf_cnpj: true } }
      }
    });

    const excecaoSet = new Set(produtosExcecaoIds);
    const produtosParaAtualizar = produtos.filter(produto => !excecaoSet.has(produto.id));

    await catalogoPrisma.$transaction(async tx => {
      for (const produto of produtosParaAtualizar) {
        await tx.produto.update({
          where: { id: produto.id },
          data: {
            versaoAtributoId: estruturaInfo.versaoId,
            versaoEstruturaAtributos: estruturaInfo.versaoNumero
          }
        });

        for (const [codigo, valor] of Object.entries(valoresFiltrados)) {
          const atributo = mapaEstrutura.get(codigo);
          if (!atributo?.id) continue;
          const valoresNormalizados = this.normalizarValorEntrada(valor);
          if (!valoresNormalizados.length) {
            await tx.produtoAtributo.deleteMany({
              where: { produtoId: produto.id, atributoId: atributo.id }
            });
            continue;
          }

          await tx.produtoAtributo.upsert({
            where: { uk_produto_atributo: { produtoId: produto.id, atributoId: atributo.id } },
            create: {
              produtoId: produto.id,
              atributoId: atributo.id,
              atributoVersaoId: estruturaInfo.versaoId,
              valores: {
                create: valoresNormalizados.map((item, ordem) => ({
                  valorJson: item as Prisma.InputJsonValue,
                  ordem
                }))
              }
            },
            update: {
              atributoVersaoId: estruturaInfo.versaoId,
              valores: {
                deleteMany: {},
                create: valoresNormalizados.map((item, ordem) => ({
                  valorJson: item as Prisma.InputJsonValue,
                  ordem
                }))
              }
            }
          });
        }

        await this.produtoResumoService.recalcularResumoProduto(produto.id, tx);
      }
    });

    const catalogosDetalhes = catalogoIdsUnicos?.length
      ? await catalogoPrisma.catalogo.findMany({
          where: { id: { in: catalogoIdsUnicos } },
          select: { id: true, nome: true, numero: true, cpf_cnpj: true }
        })
      : [];

    const registro = await catalogoPrisma.atributoPreenchimentoMassa.create({
      data: {
        superUserId,
        ncmCodigo: dados.ncmCodigo,
        modalidade: modalidadeNormalizada,
        catalogoIdsJson:
          catalogoIdsUnicos && catalogoIdsUnicos.length > 0
            ? (catalogoIdsUnicos as Prisma.InputJsonValue)
            : Prisma.DbNull,
        catalogosJson: catalogosDetalhes,
        valoresJson: valoresFiltrados as Prisma.InputJsonValue,
        estruturaSnapshotJson:
          (dados.estruturaSnapshot as Prisma.InputJsonValue | undefined) ??
          ((estruturaInfo.estrutura as unknown) as Prisma.InputJsonValue),
        produtosExcecaoJson: produtosExcecaoDetalhes,
        produtosImpactados: produtosParaAtualizar.length,
        criadoPor: usuario?.nome ?? null
      }
    });

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
      criadoEm: registro.criadoEm,
      criadoPor: registro.criadoPor ?? null
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
