// backend/src/services/produto.service.ts
import { catalogoPrisma } from '../utils/prisma';
import { logger } from '../utils/logger';
import { Prisma } from '@prisma/client';
import { AtributoLegacyService } from './atributo-legacy.service';

export interface CreateProdutoDTO {
  codigo: string;
  ncmCodigo: string;
  modalidade: string;
  valoresAtributos?: Prisma.InputJsonValue;
  criadoPor?: string;
}

export class ProdutoService {
  private atributosService = new AtributoLegacyService();
  async listarTodos() {
    return catalogoPrisma.produto.findMany({ include: { atributos: true } });
  }

  async buscarPorId(id: number) {
    return catalogoPrisma.produto.findUnique({ where: { id }, include: { atributos: true } });
  }

  async criar(data: CreateProdutoDTO) {
    const estrutura = await this.obterEstruturaAtributos(
      data.ncmCodigo,
      data.modalidade
    );

    return catalogoPrisma.$transaction(async (tx) => {
      const produto = await tx.produto.create({
        data: {
          codigo: data.codigo,
          versao: 1,
          status: 'RASCUNHO',
          ncmCodigo: data.ncmCodigo,
          modalidade: data.modalidade,
          versaoEstruturaAtributos: 1,
          criadoPor: data.criadoPor || null
        }
      });

      await tx.produtoAtributos.create({
        data: {
          produtoId: produto.id,
          valoresJson: (data.valoresAtributos ?? {}) as Prisma.InputJsonValue,
          estruturaSnapshotJson: estrutura as Prisma.InputJsonValue
        }
      });

      return produto;
    });
  }

  private async obterEstruturaAtributos(
    ncm: string,
    modalidade: string
  ): Promise<Prisma.InputJsonValue> {
    const cache = await catalogoPrisma.atributosCache.findFirst({
      where: { ncmCodigo: ncm, modalidade },
      orderBy: { versao: 'desc' }
    });
    if (cache) {
      return cache.estruturaJson as Prisma.InputJsonValue;
    }

    try {
      const estrutura = await this.atributosService.buscarEstrutura(ncm, modalidade);
      const estruturaJson = estrutura as unknown as Prisma.InputJsonValue;

      await catalogoPrisma.atributosCache.create({
        data: {
          ncmCodigo: ncm,
          modalidade,
          estruturaJson: estruturaJson,
          versao: 1
        }
      });
      return estruturaJson;
    } catch (error) {
      logger.error('Erro ao obter atributos do legacy:', error);
      return {} as Prisma.InputJsonValue;
    }
  }
}
