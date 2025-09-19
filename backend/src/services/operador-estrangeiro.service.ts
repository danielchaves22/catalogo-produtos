// backend/src/services/operador-estrangeiro.service.ts
import { OperadorEstrangeiro, OperadorEstrangeiroStatus, Pais, Subdivisao, AgenciaEmissora, Catalogo } from '@prisma/client';
import { catalogoPrisma } from '../utils/prisma';
import { logger } from '../utils/logger';
import { PrismaError } from '../types/prisma-error';

export interface CreateOperadorEstrangeiroDTO {
  catalogoId: number;
  paisCodigo: string;
  tin?: string;
  nome: string;
  email?: string;
  codigoInterno?: string;
  codigoPostal?: string;
  logradouro?: string;
  cidade?: string;
  subdivisaoCodigo?: string;
  situacao: OperadorEstrangeiroStatus;
  dataReferencia?: Date;
  identificacoesAdicionais?: Array<{
    numero: string;
    agenciaEmissoraCodigo: string;
  }>;
  superUserId: number;
}

export interface UpdateOperadorEstrangeiroDTO extends Partial<CreateOperadorEstrangeiroDTO> {}

export interface OperadorEstrangeiroCompleto extends OperadorEstrangeiro {
  catalogo: Catalogo;
  pais: Pais;
  subdivisao: Subdivisao | null;
  identificacoesAdicionais: Array<{
    id: number;
    numero: string;
    agenciaEmissora: AgenciaEmissora;
  }>;
}

export class OperadorEstrangeiroService {
  // Lista todos
  async listarTodos(catalogoId: number | undefined, superUserId: number): Promise<OperadorEstrangeiroCompleto[]> {
    try {
      const whereClause: any = { catalogo: { superUserId } };
      if (catalogoId) whereClause.catalogoId = catalogoId;

      return await catalogoPrisma.operadorEstrangeiro.findMany({
        where: whereClause,
        include: {
          catalogo: true,
          pais: true,
          subdivisao: true,
          identificacoesAdicionais: { include: { agenciaEmissora: true } }
        },
        orderBy: { dataUltimaAlteracao: 'desc' }
      });
    } catch (error: unknown) {
      logger.error('Erro ao listar operadores estrangeiros:', error);
      throw new Error('Falha ao listar operadores estrangeiros');
    }
  }

  // Buscar por ID
  async buscarPorId(id: number, superUserId: number): Promise<OperadorEstrangeiroCompleto | null> {
    try {
      return await catalogoPrisma.operadorEstrangeiro.findFirst({
        where: { id, catalogo: { superUserId } },
        include: {
          catalogo: true,
          pais: true,
          subdivisao: true,
          identificacoesAdicionais: { include: { agenciaEmissora: true } }
        }
      });
    } catch (error: unknown) {
      logger.error(`Erro ao buscar operador estrangeiro ID ${id}:`, error);
      throw new Error(`Falha ao buscar operador estrangeiro ID ${id}`);
    }
  }

  // Buscar por TIN
  async buscarPorTin(tin: string, superUserId: number): Promise<OperadorEstrangeiroCompleto[]> {
    try {
      return await catalogoPrisma.operadorEstrangeiro.findMany({
        where: { tin: { contains: tin }, catalogo: { superUserId } },
        include: {
          catalogo: true,
          pais: true,
          subdivisao: true,
          identificacoesAdicionais: { include: { agenciaEmissora: true } }
        }
      });
    } catch (error: unknown) {
      logger.error(`Erro ao buscar operadores por TIN ${tin}:`, error);
      throw new Error(`Falha ao buscar operadores por TIN ${tin}`);
    }
  }

  // Criar
  async criar(data: CreateOperadorEstrangeiroDTO): Promise<OperadorEstrangeiroCompleto> {
    try {
      const operador = await catalogoPrisma.operadorEstrangeiro.create({
        data: {
          catalogoId: data.catalogoId,
          paisCodigo: data.paisCodigo,
          tin: data.tin,
          nome: data.nome,
          email: data.email,
          codigoInterno: data.codigoInterno,
          codigoPostal: data.codigoPostal,
          logradouro: data.logradouro,
          cidade: data.cidade,
          subdivisaoCodigo: data.subdivisaoCodigo || null,
          situacao: data.situacao,
          dataReferencia: data.dataReferencia,
          identificacoesAdicionais: data.identificacoesAdicionais ? { create: data.identificacoesAdicionais } : undefined
        },
        include: {
          catalogo: true,
          pais: true,
          subdivisao: true,
          identificacoesAdicionais: { include: { agenciaEmissora: true } }
        }
      });

      return operador;
    } catch (error: unknown) {
      logger.error('Erro ao criar operador estrangeiro:', error);
      throw new Error('Falha ao criar operador estrangeiro');
    }
  }

  // Atualizar (sem nova versão)
  async atualizar(id: number, data: UpdateOperadorEstrangeiroDTO): Promise<OperadorEstrangeiroCompleto> {
    try {
      const atual = await this.buscarPorId(id, data.superUserId!);
      if (!atual) throw new Error(`Operador estrangeiro ID ${id} não encontrado`);

      const opt = (v: unknown) => (v === '' ? null : (v as any));

      const atualizado = await catalogoPrisma.operadorEstrangeiro.update({
        where: { id },
        data: {
          catalogoId: (data.catalogoId ?? undefined),
          paisCodigo: (data.paisCodigo ?? undefined),
          tin: (data.tin ?? undefined),
          nome: (data.nome ?? undefined),
          email: (data.email ?? undefined),
          codigoInterno: (data.codigoInterno ?? undefined),
          codigoPostal: (data.codigoPostal ?? undefined),
          logradouro: (data.logradouro ?? undefined),
          cidade: (data.cidade ?? undefined),
          subdivisaoCodigo: (opt(data.subdivisaoCodigo) ?? undefined),
          situacao: (data.situacao ?? undefined),
          dataReferencia: (data.dataReferencia ?? undefined),
          ...(data.identificacoesAdicionais !== undefined
            ? {
                identificacoesAdicionais: {
                  deleteMany: {},
                  ...(data.identificacoesAdicionais.length > 0 ? { create: data.identificacoesAdicionais } : {})
                }
              }
            : {})
        },
        include: {
          catalogo: true,
          pais: true,
          subdivisao: true,
          identificacoesAdicionais: { include: { agenciaEmissora: true } }
        }
      });

      return atualizado;
    } catch (error: unknown) {
      logger.error(`Erro ao atualizar operador estrangeiro ID ${id}:`, error);

      const prismaError = error as PrismaError;
      if (prismaError.code === 'P2025') {
        throw new Error(`Operador estrangeiro ID ${id} não encontrado`);
      }

      throw new Error(`Falha ao atualizar operador estrangeiro ID ${id}`);
    }
  }

  // Remover (desativar)
  async remover(id: number, superUserId: number): Promise<void> {
    try {
      const operador = await this.buscarPorId(id, superUserId);
      if (!operador) throw new Error(`Operador estrangeiro ID ${id} não encontrado`);

      await catalogoPrisma.operadorEstrangeiro.update({ where: { id }, data: { situacao: 'DESATIVADO' } });
    } catch (error: unknown) {
      logger.error(`Erro ao remover operador estrangeiro ID ${id}:`, error);

      const prismaError = error as PrismaError;
      if (prismaError.code === 'P2025') {
        throw new Error(`Operador estrangeiro ID ${id} não encontrado`);
      }

      throw new Error(`Falha ao remover operador estrangeiro ID ${id}`);
    }
  }

  // ====== Auxiliares ======
  async listarPaises(): Promise<Pais[]> {
    try {
      return await catalogoPrisma.pais.findMany({ orderBy: { nome: 'asc' } });
    } catch (error: unknown) {
      logger.error('Erro ao listar países:', error);
      throw new Error('Falha ao listar países');
    }
  }

  async listarSubdivisoesPorPais(paisCodigo: string): Promise<Subdivisao[]> {
    try {
      const subdivisoes = await catalogoPrisma.subdivisao.findMany({ where: { paisCodigo }, orderBy: { nome: 'asc' } });
      return subdivisoes;
    } catch (error: unknown) {
      logger.error(`Erro ao listar subdivisões do país ${paisCodigo}:`, error);
      throw new Error(`Falha ao listar subdivisões do país ${paisCodigo}`);
    }
  }

  async listarSubdivisoes(): Promise<Subdivisao[]> {
    try {
      return await catalogoPrisma.subdivisao.findMany({ include: { pais: true }, orderBy: { nome: 'asc' } });
    } catch (error: unknown) {
      logger.error('Erro ao listar subdivisões:', error);
      throw new Error('Falha ao listar subdivisões');
    }
  }

  async listarCatalogos(superUserId: number): Promise<Array<{ id: number; cpf_cnpj: string | null; nome: string; ambiente: Catalogo['ambiente'] }>> {
    try {
      return await catalogoPrisma.catalogo.findMany({
        select: { id: true, cpf_cnpj: true, nome: true, ambiente: true },
        where: { superUserId },
        orderBy: { nome: 'asc' }
      });
    } catch (error: unknown) {
      logger.error('Erro ao listar catálogos:', error);
      throw new Error('Falha ao listar catálogos');
    }
  }

  async listarAgenciasEmissoras(): Promise<AgenciaEmissora[]> {
    try {
      return await catalogoPrisma.agenciaEmissora.findMany({ orderBy: { nome: 'asc' } });
    } catch (error: unknown) {
      logger.error('Erro ao listar agências emissoras:', error);
      throw new Error('Falha ao listar agências emissoras');
    }
  }
}

