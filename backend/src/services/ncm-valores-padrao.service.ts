// backend/src/services/ncm-valores-padrao.service.ts
import { Prisma } from '@prisma/client';
import { catalogoPrisma } from '../utils/prisma';

export interface NcmValoresPadraoCreateInput {
  ncmCodigo: string;
  modalidade?: string | null;
  valoresAtributos?: Prisma.InputJsonValue;
  estruturaSnapshot?: Prisma.InputJsonValue;
  catalogoIds: number[];
}

export interface NcmValoresPadraoUpdateInput {
  ncmCodigo?: string;
  modalidade?: string | null;
  valoresAtributos?: Prisma.InputJsonValue;
  estruturaSnapshot?: Prisma.InputJsonValue;
  catalogoIds?: number[];
}

export class NcmValoresPadraoService {
  async listar(superUserId: number) {
    return catalogoPrisma.ncmValoresPadrao.findMany({
      where: { superUserId },
      include: {
        catalogos: {
          orderBy: {
            catalogo: {
              nome: 'asc'
            }
          },
          include: {
            catalogo: {
              select: { id: true, nome: true, numero: true, cpf_cnpj: true }
            }
          }
        }
      },
      orderBy: [{ atualizadoEm: 'desc' }, { ncmCodigo: 'asc' }]
    });
  }

  async buscarPorId(id: number, superUserId: number) {
    return catalogoPrisma.ncmValoresPadrao.findFirst({
      where: { id, superUserId },
      include: {
        catalogos: {
          orderBy: {
            catalogo: {
              nome: 'asc'
            }
          },
          include: {
            catalogo: {
              select: { id: true, nome: true, numero: true, cpf_cnpj: true }
            }
          }
        }
      }
    });
  }

  async buscarPorNcm(
    ncmCodigo: string,
    superUserId: number,
    modalidade?: string | null,
    catalogoId?: number
  ) {
    const modalidadeNormalizada = modalidade?.toUpperCase() ?? null;
    return catalogoPrisma.ncmValoresPadrao.findFirst({
      where: {
        ncmCodigo,
        superUserId,
        modalidade: modalidadeNormalizada,
        ...(catalogoId
          ? {
              catalogos: {
                some: {
                  catalogoId
                }
              }
            }
          : {})
      }
    });
  }

  async criar(
    dados: NcmValoresPadraoCreateInput,
    superUserId: number,
    usuario?: { nome?: string }
  ) {
    const modalidadeNormalizada = dados.modalidade?.toUpperCase() ?? null;
    if (!dados.catalogoIds?.length) {
      throw new Error('Informe ao menos um catálogo para aplicar os valores padrão.');
    }

    const catalogoIdsUnicos = Array.from(new Set(dados.catalogoIds));
    const catalogosValidos = await catalogoPrisma.catalogo.findMany({
      where: {
        id: { in: catalogoIdsUnicos },
        superUserId
      },
      select: { id: true }
    });

    if (catalogosValidos.length !== catalogoIdsUnicos.length) {
      throw new Error('Catálogo inválido para o superusuário informado.');
    }

    const existente = await catalogoPrisma.ncmValoresPadrao.findFirst({
      where: {
        ncmCodigo: dados.ncmCodigo,
        superUserId,
        modalidade: modalidadeNormalizada
      }
    });
    if (existente) {
      throw new Error('Já existe um valor padrão cadastrado para esta NCM e modalidade');
    }

    return catalogoPrisma.$transaction(async prisma => {
      const registro = await prisma.ncmValoresPadrao.create({
        data: {
          superUserId,
          ncmCodigo: dados.ncmCodigo,
          modalidade: modalidadeNormalizada,
          valoresJson: (dados.valoresAtributos ?? {}) as Prisma.InputJsonValue,
          estruturaSnapshotJson: dados.estruturaSnapshot ?? Prisma.JsonNull,
          criadoPor: usuario?.nome || null,
          atualizadoPor: usuario?.nome || null
        }
      });

      await prisma.ncmValoresPadraoCatalogo.createMany({
        data: catalogoIdsUnicos.map(catalogoId => ({
          valorPadraoId: registro.id,
          catalogoId
        }))
      });

      return prisma.ncmValoresPadrao.findFirst({
        where: { id: registro.id },
        include: {
          catalogos: {
            orderBy: {
              catalogo: {
                nome: 'asc'
              }
            },
            include: {
              catalogo: {
                select: { id: true, nome: true, numero: true, cpf_cnpj: true }
              }
            }
          }
        }
      });
    });
  }

  async atualizar(
    id: number,
    dados: NcmValoresPadraoUpdateInput,
    superUserId: number,
    usuario?: { nome?: string }
  ) {
    const existente = await catalogoPrisma.ncmValoresPadrao.findFirst({
      where: { id, superUserId }
    });
    if (!existente) {
      throw new Error('Grupo de valores padrão não encontrado');
    }

    if (dados.ncmCodigo && dados.ncmCodigo !== existente.ncmCodigo) {
      throw new Error('Não é permitido alterar a NCM do valor padrão');
    }

    if (dados.modalidade && dados.modalidade.toUpperCase() !== existente.modalidade) {
      throw new Error('Não é permitido alterar a modalidade do valor padrão');
    }

    if (dados.catalogoIds && dados.catalogoIds.length === 0) {
      throw new Error('Informe ao menos um catálogo para aplicar os valores padrão.');
    }

    const catalogoIdsUnicos = dados.catalogoIds
      ? Array.from(new Set(dados.catalogoIds))
      : undefined;

    if (catalogoIdsUnicos) {
      const catalogosValidos = await catalogoPrisma.catalogo.findMany({
        where: {
          id: { in: catalogoIdsUnicos },
          superUserId
        },
        select: { id: true }
      });

      if (catalogosValidos.length !== catalogoIdsUnicos.length) {
        throw new Error('Catálogo inválido para o superusuário informado.');
      }
    }

    return catalogoPrisma.$transaction(async prisma => {
      await prisma.ncmValoresPadrao.update({
        where: { id },
        data: {
          valoresJson: (dados.valoresAtributos ?? {}) as Prisma.InputJsonValue,
          estruturaSnapshotJson: dados.estruturaSnapshot ?? Prisma.JsonNull,
          atualizadoPor: usuario?.nome || null
        }
      });

      if (catalogoIdsUnicos) {
        await prisma.ncmValoresPadraoCatalogo.deleteMany({
          where: {
            valorPadraoId: id,
            catalogoId: { notIn: catalogoIdsUnicos }
          }
        });

        const existentesCatalogos = await prisma.ncmValoresPadraoCatalogo.findMany({
          where: { valorPadraoId: id },
          select: { catalogoId: true }
        });
        const existentesSet = new Set(existentesCatalogos.map(item => item.catalogoId));

        const novosCatalogos = catalogoIdsUnicos.filter(catalogoId => !existentesSet.has(catalogoId));
        if (novosCatalogos.length > 0) {
          await prisma.ncmValoresPadraoCatalogo.createMany({
            data: novosCatalogos.map(catalogoId => ({ valorPadraoId: id, catalogoId }))
          });
        }
      }

      return prisma.ncmValoresPadrao.findFirst({
        where: { id },
        include: {
          catalogos: {
            orderBy: {
              catalogo: {
                nome: 'asc'
              }
            },
            include: {
              catalogo: {
                select: { id: true, nome: true, numero: true, cpf_cnpj: true }
              }
            }
          }
        }
      });
    });
  }

  async remover(id: number, superUserId: number) {
    const existente = await catalogoPrisma.ncmValoresPadrao.findFirst({
      where: { id, superUserId }
    });
    if (!existente) {
      throw new Error('Grupo de valores padrão não encontrado');
    }

    await catalogoPrisma.ncmValoresPadrao.delete({ where: { id } });
  }
}
