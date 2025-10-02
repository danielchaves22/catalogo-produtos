// backend/src/services/ncm-valores-padrao.service.ts
import { Prisma } from '@prisma/client';
import { catalogoPrisma } from '../utils/prisma';

export interface NcmValoresPadraoCreateInput {
  ncmCodigo: string;
  modalidade?: string | null;
  valoresAtributos?: Prisma.InputJsonValue;
  estruturaSnapshot?: Prisma.InputJsonValue;
}

export interface NcmValoresPadraoUpdateInput {
  ncmCodigo?: string;
  modalidade?: string | null;
  valoresAtributos?: Prisma.InputJsonValue;
  estruturaSnapshot?: Prisma.InputJsonValue;
}

export class NcmValoresPadraoService {
  async listar(superUserId: number) {
    return catalogoPrisma.ncmValoresPadrao.findMany({
      where: { superUserId },
      orderBy: [{ atualizadoEm: 'desc' }, { ncmCodigo: 'asc' }]
    });
  }

  async buscarPorId(id: number, superUserId: number) {
    return catalogoPrisma.ncmValoresPadrao.findFirst({
      where: { id, superUserId }
    });
  }

  async buscarPorNcm(ncmCodigo: string, superUserId: number, modalidade?: string | null) {
    const modalidadeNormalizada = modalidade?.toUpperCase() ?? null;
    return catalogoPrisma.ncmValoresPadrao.findFirst({
      where: {
        ncmCodigo,
        superUserId,
        modalidade: modalidadeNormalizada
      }
    });
  }

  async criar(
    dados: NcmValoresPadraoCreateInput,
    superUserId: number,
    usuario?: { nome?: string }
  ) {
    const modalidadeNormalizada = dados.modalidade?.toUpperCase() ?? null;
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
        atualizadoPor: usuario?.nome || null
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

    return catalogoPrisma.ncmValoresPadrao.update({
      where: { id },
      data: {
        valoresJson: (dados.valoresAtributos ?? {}) as Prisma.InputJsonValue,
        estruturaSnapshotJson: dados.estruturaSnapshot ?? Prisma.JsonNull,
        atualizadoPor: usuario?.nome || null
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
}
