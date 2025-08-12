// backend/src/services/catalogo.service.ts
import { Catalogo, CatalogoStatus } from '@prisma/client';
import { catalogoPrisma } from '../utils/prisma';
import { logger } from '../utils/logger';
import { PrismaError } from '../types/prisma-error';

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
  async listarTodos(): Promise<Catalogo[]> {
    try {
      return await catalogoPrisma.catalogo.findMany({
        orderBy: { ultima_alteracao: 'desc' }
      });
    } catch (error: unknown) {
      logger.error('Erro ao listar catálogos:', error);
      throw new Error('Falha ao listar catálogos');
    }
  }

  /**
   * Busca um catálogo pelo ID
   */
  async buscarPorId(id: number): Promise<Catalogo | null> {
    try {
      // Correção: é necessário usar um objeto com a propriedade id
      return await catalogoPrisma.catalogo.findUnique({
        where: { 
          id: id // id explícito como chave-valor
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
  async criar(data: CreateCatalogoDTO): Promise<Catalogo> {
    try {
      const existente = await catalogoPrisma.catalogo.findFirst({
        where: { nome: data.nome }
      });
      if (existente) {
        throw new Error('Já existe um catálogo com este nome');
      }
      return await catalogoPrisma.catalogo.create({
        data: {
          nome: data.nome,
          cpf_cnpj: data.cpf_cnpj,
          status: data.status,
          ultima_alteracao: new Date(),
          numero: 0 // O valor real será gerado pelo trigger no banco
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
  async atualizar(id: number, data: UpdateCatalogoDTO): Promise<Catalogo> {
    try {
      const existente = await catalogoPrisma.catalogo.findFirst({
        where: { nome: data.nome, id: { not: id } }
      });
      if (existente) {
        throw new Error('Já existe um catálogo com este nome');
      }
      return await catalogoPrisma.catalogo.update({
        where: {
          id: id // Corrigido também
        },
        data: {
          nome: data.nome,
          cpf_cnpj: data.cpf_cnpj,
          status: data.status,
          ultima_alteracao: new Date()
        }
      });
    } catch (error: unknown) {
      if (error instanceof Error && error.message.includes('Já existe')) {
        throw error;
      }
      logger.error(`Erro ao atualizar catálogo ID ${id}:`, error);

      // Verifica se o erro é de registro não encontrado
      const prismaError = error as PrismaError;
      if (prismaError.code === 'P2025') {
        throw new Error(`Catálogo ID ${id} não encontrado`);
      }

      throw new Error(`Falha ao atualizar catálogo ID ${id}`);
    }
  }

  /**
   * Remove um catálogo
   */
  async remover(id: number): Promise<void> {
    try {
      await catalogoPrisma.catalogo.delete({
        where: { 
          id: id // Corrigido também
        }
      });
    } catch (error: unknown) {
      logger.error(`Erro ao remover catálogo ID ${id}:`, error);
      
      // Verifica se o erro é de registro não encontrado
      const prismaError = error as PrismaError;
      if (prismaError.code === 'P2025') {
        throw new Error(`Catálogo ID ${id} não encontrado`);
      }
      
      throw new Error(`Falha ao remover catálogo ID ${id}`);
    }
  }
}