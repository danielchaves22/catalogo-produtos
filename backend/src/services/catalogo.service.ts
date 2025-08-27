// backend/src/services/catalogo.service.ts
import { CatalogoStatus } from '@prisma/client';
import { catalogoPrisma } from '../utils/prisma';
import { logger } from '../utils/logger';

export interface CreateCatalogoDTO {
  nome: string;
  cpf_cnpj?: string;
  status: CatalogoStatus;
}

export interface UpdateCatalogoDTO {
  nome: string;
  cpf_cnpj?: string;
  status: CatalogoStatus;
}

export class CatalogoService {
  /**
   * Lista todos os catálogos
   */
  async listarTodos(superUserId: number) {
    try {
      return await catalogoPrisma.catalogo.findMany({
        where: { superUserId },
        orderBy: { ultima_alteracao: 'desc' },
        select: {
          id: true,
          nome: true,
          cpf_cnpj: true,
          ultima_alteracao: true,
          numero: true,
          status: true,
          superUserId: true,
          certificadoId: true
        }
      });
    } catch (error: unknown) {
      logger.error('Erro ao listar catálogos:', error);
      throw new Error('Falha ao listar catálogos');
    }
  }

  /**
   * Busca um catálogo pelo ID
   */
  async buscarPorId(id: number, superUserId: number) {
    try {
      return await catalogoPrisma.catalogo.findFirst({
        where: { id, superUserId },
        select: {
          id: true,
          nome: true,
          cpf_cnpj: true,
          ultima_alteracao: true,
          numero: true,
          status: true,
          superUserId: true,
          certificadoId: true
        }
      });
    } catch (error: unknown) {
      logger.error(`Erro ao buscar catálogo ID ${id}:`, error);
      throw new Error(`Falha ao buscar catálogo ID ${id}`);
    }
  }

  /**
   * Cria um novo catálogo
   */
  async criar(data: CreateCatalogoDTO, superUserId: number) {
    try {
      const existenteNome = await catalogoPrisma.catalogo.findFirst({
        where: { nome: data.nome, superUserId }
      });
      if (existenteNome) {
        throw new Error('Já existe um catálogo com este nome');
      }

      if (data.cpf_cnpj) {
        const existenteCpf = await catalogoPrisma.catalogo.findFirst({
          where: { cpf_cnpj: data.cpf_cnpj, superUserId }
        });
        if (existenteCpf) {
          throw new Error('Já existe um catálogo com este CPF/CNPJ');
        }
      }
      return await catalogoPrisma.catalogo.create({
        data: {
          nome: data.nome,
          cpf_cnpj: data.cpf_cnpj,
          status: data.status,
          ultima_alteracao: new Date(),
          numero: 0,
          superUserId
        },
        select: {
          id: true,
          nome: true,
          cpf_cnpj: true,
          ultima_alteracao: true,
          numero: true,
          status: true,
          superUserId: true,
          certificadoId: true
        }
      });
    } catch (error: unknown) {
      if (error instanceof Error && error.message.includes('Já existe')) {
        throw error;
      }
      logger.error('Erro ao criar catálogo:', error);
      throw new Error('Falha ao criar catálogo');
    }
  }

  /**
   * Atualiza um catálogo existente
   */
  async atualizar(id: number, data: UpdateCatalogoDTO, superUserId: number) {
    try {
      const existenteNome = await catalogoPrisma.catalogo.findFirst({
        where: { nome: data.nome, superUserId, id: { not: id } }
      });
      if (existenteNome) {
        throw new Error('Já existe um catálogo com este nome');
      }

      if (data.cpf_cnpj) {
        const existenteCpf = await catalogoPrisma.catalogo.findFirst({
          where: { cpf_cnpj: data.cpf_cnpj, superUserId, id: { not: id } }
        });
        if (existenteCpf) {
          throw new Error('Já existe um catálogo com este CPF/CNPJ');
        }
      }

      const atualizado = await catalogoPrisma.catalogo.updateMany({
        where: { id, superUserId },
        data: {
          nome: data.nome,
          cpf_cnpj: data.cpf_cnpj,
          status: data.status,
          ultima_alteracao: new Date()
        }
      });

      if (atualizado.count === 0) {
        throw new Error(`Catálogo ID ${id} não encontrado`);
      }

      return (await catalogoPrisma.catalogo.findFirst({
        where: { id, superUserId },
        select: {
          id: true,
          nome: true,
          cpf_cnpj: true,
          ultima_alteracao: true,
          numero: true,
          status: true,
          superUserId: true,
          certificadoId: true
        }
      }))!;
    } catch (error: unknown) {
      if (error instanceof Error && error.message.includes('Já existe')) {
        throw error;
      }
      logger.error(`Erro ao atualizar catálogo ID ${id}:`, error);

      throw new Error(`Falha ao atualizar catálogo ID ${id}`);
    }
  }

  /**
   * Remove um catálogo
   */
  async remover(id: number, superUserId: number): Promise<void> {
    try {
      const removido = await catalogoPrisma.catalogo.deleteMany({
        where: { id, superUserId }
      });

      if (removido.count === 0) {
        throw new Error(`Catálogo ID ${id} não encontrado`);
      }
    } catch (error: unknown) {
      logger.error(`Erro ao remover catálogo ID ${id}:`, error);
      throw new Error(`Falha ao remover catálogo ID ${id}`);
    }
  }

  async vincularCertificado(id: number, certificadoId: number, superUserId: number): Promise<void> {
    await catalogoPrisma.catalogo.updateMany({
      where: { id, superUserId },
      data: { certificadoId }
    });
  }

  async obterCertificadoPath(id: number, superUserId: number): Promise<string | null> {
    const catalogo = await catalogoPrisma.catalogo.findFirst({
      where: { id, superUserId },
      select: { certificado: { select: { pfxPath: true } } }
    });
    return catalogo?.certificado?.pfxPath || null;
  }
}