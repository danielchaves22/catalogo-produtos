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
    const registros = await catalogoPrisma.ncmValoresPadrao.findMany({
      where: { superUserId },
      include: {
        catalogos: {
          include: {
            catalogo: {
              select: { id: true, nome: true, cpf_cnpj: true }
            }
          }
        }
      },
      orderBy: [{ atualizadoEm: 'desc' }, { ncmCodigo: 'asc' }]
    });

    return registros.map(registro => ({
      ...registro,
      catalogos: registro.catalogos.map(item => ({
        id: item.catalogo.id,
        nome: item.catalogo.nome,
        cpf_cnpj: item.catalogo.cpf_cnpj
      }))
    }));
  }

  async buscarPorId(id: number, superUserId: number) {
    const registro = await catalogoPrisma.ncmValoresPadrao.findFirst({
      where: { id, superUserId },
      include: {
        catalogos: {
          include: {
            catalogo: {
              select: { id: true, nome: true, cpf_cnpj: true }
            }
          }
        }
      }
    });

    if (!registro) {
      return null;
    }

    return {
      ...registro,
      catalogos: registro.catalogos.map(item => ({
        id: item.catalogo.id,
        nome: item.catalogo.nome,
        cpf_cnpj: item.catalogo.cpf_cnpj
      }))
    };
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
        ...(catalogoId !== undefined
          ? {
              OR: [
                { catalogos: { some: { catalogoId } } },
                { catalogos: { none: {} } }
              ]
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
      throw new Error('Informe ao menos um catálogo para associar aos valores padrão');
    }

    const catalogoIdsValidados = await this.validarCatalogos(dados.catalogoIds, superUserId);

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

    return catalogoPrisma.ncmValoresPadrao.create({
      data: {
        superUserId,
        ncmCodigo: dados.ncmCodigo,
        modalidade: modalidadeNormalizada,
        valoresJson: (dados.valoresAtributos ?? {}) as Prisma.InputJsonValue,
        estruturaSnapshotJson: dados.estruturaSnapshot ?? Prisma.JsonNull,
        criadoPor: usuario?.nome || null,
        atualizadoPor: usuario?.nome || null,
        catalogos: {
          create: catalogoIdsValidados.map(catalogoId => ({ catalogoId }))
        }
      }
    });
  }

  async atualizar(
    id: number,
    dados: NcmValoresPadraoUpdateInput,
    superUserId: number,
    usuario?: { nome?: string }
  ) {
    const existente = await catalogoPrisma.ncmValoresPadrao.findFirst({
      where: { id, superUserId },
      include: { catalogos: true }
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

    let catalogoIdsValidados: number[] | undefined;
    if (dados.catalogoIds) {
      if (dados.catalogoIds.length === 0) {
        throw new Error('Informe ao menos um catálogo para associar aos valores padrão');
      }
      catalogoIdsValidados = await this.validarCatalogos(dados.catalogoIds, superUserId);
    }

    return catalogoPrisma.ncmValoresPadrao.update({
      where: { id },
      data: {
        valoresJson: (dados.valoresAtributos ?? {}) as Prisma.InputJsonValue,
        estruturaSnapshotJson: dados.estruturaSnapshot ?? Prisma.JsonNull,
        atualizadoPor: usuario?.nome || null,
        ...(dados.catalogoIds
          ? {
              catalogos: {
                deleteMany: {},
                create: catalogoIdsValidados!.map(catalogoId => ({ catalogoId }))
              }
            }
          : {})
      }
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

  private async validarCatalogos(catalogoIds: number[], superUserId: number) {
    const uniqueIds = Array.from(new Set(catalogoIds));
    const catalogos = await catalogoPrisma.catalogo.findMany({
      where: { id: { in: uniqueIds }, superUserId },
      select: { id: true }
    });

    if (catalogos.length !== uniqueIds.length) {
      throw new Error('Catálogo inválido para o superusuário informado');
    }

    return uniqueIds;
  }
}
