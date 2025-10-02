// backend/src/services/ncm-valores-padrao.service.ts
import { Prisma } from '@prisma/client';
import { catalogoPrisma } from '../utils/prisma';

export interface NcmValoresPadraoInput {
  ncmCodigo: string;
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

  async buscarPorNcm(ncmCodigo: string, superUserId: number) {
    return catalogoPrisma.ncmValoresPadrao.findFirst({
      where: { ncmCodigo, superUserId }
    });
  }

  async criar(
    dados: NcmValoresPadraoInput,
    superUserId: number,
    usuario?: { nome?: string }
  ) {
    const existente = await catalogoPrisma.ncmValoresPadrao.findFirst({
      where: { ncmCodigo: dados.ncmCodigo, superUserId }
    });
    if (existente) {
      throw new Error('Já existe um valor padrão cadastrado para esta NCM');
    }

    return catalogoPrisma.ncmValoresPadrao.create({
      data: {
        superUserId,
        ncmCodigo: dados.ncmCodigo,
        modalidade: dados.modalidade ?? null,
        valoresJson: (dados.valoresAtributos ?? {}) as Prisma.InputJsonValue,
        estruturaSnapshotJson: dados.estruturaSnapshot ?? Prisma.JsonNull,
        criadoPor: usuario?.nome || null,
        atualizadoPor: usuario?.nome || null
      }
    });
  }

  async atualizar(
    id: number,
    dados: NcmValoresPadraoInput,
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
      const duplicado = await catalogoPrisma.ncmValoresPadrao.findFirst({
        where: {
          superUserId,
          ncmCodigo: dados.ncmCodigo,
          NOT: { id }
        }
      });
      if (duplicado) {
        throw new Error('Já existe um valor padrão cadastrado para esta NCM');
      }
    }

    return catalogoPrisma.ncmValoresPadrao.update({
      where: { id },
      data: {
        ncmCodigo: dados.ncmCodigo,
        modalidade: dados.modalidade ?? null,
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
