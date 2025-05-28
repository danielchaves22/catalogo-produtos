// backend/src/services/operador-estrangeiro.service.ts - CORRIGIDO
import { OperadorEstrangeiro, OperadorEstrangeiroStatus, Pais, Subdivisao, AgenciaEmissora } from '@prisma/client';
import { catalogoPrisma } from '../utils/prisma';
import { logger } from '../utils/logger';
import { PrismaError } from '../types/prisma-error';

export interface CreateOperadorEstrangeiroDTO {
  cnpjRaizResponsavel: string; // AGORA SERÁ O CNPJ COMPLETO (14 dígitos)
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
}

export interface UpdateOperadorEstrangeiroDTO extends Partial<CreateOperadorEstrangeiroDTO> {}

export interface OperadorEstrangeiroCompleto extends OperadorEstrangeiro {
  pais: Pais;
  subdivisao: Subdivisao | null;
  identificacoesAdicionais: Array<{
    id: number;
    numero: string;
    agenciaEmissora: AgenciaEmissora;
  }>;
}

export class OperadorEstrangeiroService {
  
  // NOVA FUNÇÃO: Extrai CNPJ raiz (8 dígitos) do CNPJ completo
  private extrairCnpjRaiz(cnpjCompleto: string): string {
    const cnpjLimpo = cnpjCompleto.replace(/\D/g, '');
    return cnpjLimpo.substring(0, 8);
  }

  // NOVA FUNÇÃO: Busca CNPJ completo a partir do CNPJ raiz
  private async buscarCnpjCompletoPorRaiz(cnpjRaiz: string): Promise<string | null> {
    try {
      const catalogo = await catalogoPrisma.catalogo.findFirst({
        where: {
          cpf_cnpj: {
            startsWith: cnpjRaiz
          }
        },
        select: {
          cpf_cnpj: true
        }
      });
      
      return catalogo?.cpf_cnpj || null;
    } catch (error) {
      logger.error(`Erro ao buscar CNPJ completo para raiz ${cnpjRaiz}:`, error);
      return null;
    }
  }

  /**
   * Lista todos os operadores estrangeiros
   */
  async listarTodos(cnpjRaiz?: string): Promise<OperadorEstrangeiroCompleto[]> {
    try {
      let whereClause = {};
      
      if (cnpjRaiz) {
        // Se foi passado um CNPJ raiz (8 dígitos), buscar operadores que começam com esse raiz
        whereClause = {
          cnpjRaizResponsavel: {
            startsWith: cnpjRaiz
          }
        };
      }
      
      return await catalogoPrisma.operadorEstrangeiro.findMany({
        where: whereClause,
        include: {
          pais: true,
          subdivisao: true,
          identificacoesAdicionais: {
            include: {
              agenciaEmissora: true
            }
          }
        },
        orderBy: { dataUltimaAlteracao: 'desc' }
      });
    } catch (error: unknown) {
      logger.error('Erro ao listar operadores estrangeiros:', error);
      throw new Error('Falha ao listar operadores estrangeiros');
    }
  }

  /**
   * Busca um operador estrangeiro pelo ID
   */
  async buscarPorId(id: number): Promise<OperadorEstrangeiroCompleto | null> {
    try {
      return await catalogoPrisma.operadorEstrangeiro.findUnique({
        where: { id },
        include: {
          pais: true,
          subdivisao: true,
          identificacoesAdicionais: {
            include: {
              agenciaEmissora: true
            }
          }
        }
      });
    } catch (error: unknown) {
      logger.error(`Erro ao buscar operador estrangeiro ID ${id}:`, error);
      throw new Error(`Falha ao buscar operador estrangeiro ID ${id}`);
    }
  }

  /**
   * Busca operadores por TIN
   */
  async buscarPorTin(tin: string): Promise<OperadorEstrangeiroCompleto[]> {
    try {
      return await catalogoPrisma.operadorEstrangeiro.findMany({
        where: { 
          tin: {
            contains: tin
          }
        },
        include: {
          pais: true,
          subdivisao: true,
          identificacoesAdicionais: {
            include: {
              agenciaEmissora: true
            }
          }
        }
      });
    } catch (error: unknown) {
      logger.error(`Erro ao buscar operadores por TIN ${tin}:`, error);
      throw new Error(`Falha ao buscar operadores por TIN ${tin}`);
    }
  }

  /**
   * Cria um novo operador estrangeiro
   * CORRIGIDO: Agora aceita CNPJ completo
   */
  async criar(data: CreateOperadorEstrangeiroDTO): Promise<OperadorEstrangeiroCompleto> {
    try {
      const operador = await catalogoPrisma.operadorEstrangeiro.create({
        data: {
          cnpjRaizResponsavel: data.cnpjRaizResponsavel, // Armazena CNPJ completo
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
          identificacoesAdicionais: data.identificacoesAdicionais ? {
            create: data.identificacoesAdicionais
          } : undefined
        },
        include: {
          pais: true,
          subdivisao: true,
          identificacoesAdicionais: {
            include: {
              agenciaEmissora: true
            }
          }
        }
      });

      return operador;
    } catch (error: unknown) {
      logger.error('Erro ao criar operador estrangeiro:', error);
      throw new Error('Falha ao criar operador estrangeiro');
    }
  }

  /**
   * Atualiza um operador estrangeiro existente (gera nova versão)
   */
  async atualizar(id: number, data: UpdateOperadorEstrangeiroDTO): Promise<OperadorEstrangeiroCompleto> {
    try {
      const operadorAtual = await this.buscarPorId(id);
      if (!operadorAtual) {
        throw new Error(`Operador estrangeiro ID ${id} não encontrado`);
      }

      // Desativa a versão atual
      await catalogoPrisma.operadorEstrangeiro.update({
        where: { id },
        data: { situacao: 'INATIVO' }
      });

      // Cria nova versão
      const novaVersao = await catalogoPrisma.operadorEstrangeiro.create({
        data: {
          cnpjRaizResponsavel: data.cnpjRaizResponsavel || operadorAtual.cnpjRaizResponsavel,
          paisCodigo: data.paisCodigo || operadorAtual.paisCodigo,
          tin: data.tin !== undefined ? data.tin : operadorAtual.tin,
          nome: data.nome || operadorAtual.nome,
          email: data.email !== undefined ? data.email : operadorAtual.email,
          codigoInterno: data.codigoInterno !== undefined ? data.codigoInterno : operadorAtual.codigoInterno,
          codigoPostal: data.codigoPostal !== undefined ? data.codigoPostal : operadorAtual.codigoPostal,
          logradouro: data.logradouro !== undefined ? data.logradouro : operadorAtual.logradouro,
          cidade: data.cidade !== undefined ? data.cidade : operadorAtual.cidade,
          subdivisaoCodigo: data.subdivisaoCodigo !== undefined ? data.subdivisaoCodigo : operadorAtual.subdivisaoCodigo,
          versao: operadorAtual.versao + 1,
          situacao: data.situacao || operadorAtual.situacao,
          identificacoesAdicionais: data.identificacoesAdicionais ? {
            create: data.identificacoesAdicionais
          } : undefined
        },
        include: {
          pais: true,
          subdivisao: true,
          identificacoesAdicionais: {
            include: {
              agenciaEmissora: true
            }
          }
        }
      });

      return novaVersao;
    } catch (error: unknown) {
      logger.error(`Erro ao atualizar operador estrangeiro ID ${id}:`, error);
      
      const prismaError = error as PrismaError;
      if (prismaError.code === 'P2025') {
        throw new Error(`Operador estrangeiro ID ${id} não encontrado`);
      }
      
      throw new Error(`Falha ao atualizar operador estrangeiro ID ${id}`);
    }
  }

  /**
   * Remove um operador estrangeiro (desativa)
   */
  async remover(id: number): Promise<void> {
    try {
      await catalogoPrisma.operadorEstrangeiro.update({
        where: { id },
        data: { situacao: 'DESATIVADO' }
      });
    } catch (error: unknown) {
      logger.error(`Erro ao remover operador estrangeiro ID ${id}:`, error);
      
      const prismaError = error as PrismaError;
      if (prismaError.code === 'P2025') {
        throw new Error(`Operador estrangeiro ID ${id} não encontrado`);
      }
      
      throw new Error(`Falha ao remover operador estrangeiro ID ${id}`);
    }
  }

  // ========== SERVIÇOS PARA TABELAS AUXILIARES ==========

  /**
   * Lista todos os países
   */
  async listarPaises(): Promise<Pais[]> {
    try {
      return await catalogoPrisma.pais.findMany({
        orderBy: { nome: 'asc' }
      });
    } catch (error: unknown) {
      logger.error('Erro ao listar países:', error);
      throw new Error('Falha ao listar países');
    }
  }

  /**
   * Lista subdivisões por país
   */
  async listarSubdivisoesPorPais(paisCodigo: string): Promise<Subdivisao[]> {
    try {
      console.log(`Service: Buscando subdivisões para país ${paisCodigo}`);
      
      const subdivisoes = await catalogoPrisma.subdivisao.findMany({
        where: { paisCodigo },
        orderBy: { nome: 'asc' }
      });
      
      console.log(`Service: Encontradas ${subdivisoes.length} subdivisões`);
      return subdivisoes;
    } catch (error: unknown) {
      logger.error(`Erro ao listar subdivisões do país ${paisCodigo}:`, error);
      throw new Error(`Falha ao listar subdivisões do país ${paisCodigo}`);
    }
  }

  /**
   * Lista todas as subdivisões
   */
  async listarSubdivisoes(): Promise<Subdivisao[]> {
    try {
      return await catalogoPrisma.subdivisao.findMany({
        include: { pais: true },
        orderBy: { nome: 'asc' }
      });
    } catch (error: unknown) {
      logger.error('Erro ao listar subdivisões:', error);
      throw new Error('Falha ao listar subdivisões');
    }
  }

  /**
   * Lista CNPJs disponíveis dos catálogos para seleção
   * CORRIGIDO: Retorna CNPJ completo, não apenas a raiz
   */
  async listarCnpjsCatalogos(): Promise<Array<{ cnpjCompleto: string; nome: string }>> {
  try {
    const catalogos = await catalogoPrisma.catalogo.findMany({
      select: {
        cpf_cnpj: true,
        nome: true
      },
      where: {
        cpf_cnpj: {
          not: null
        }
      },
      orderBy: {
        nome: 'asc'
      }
    });

    // Processa os dados e remove duplicatas por CNPJ raiz
    const cnpjsUnicos = new Map<string, { cnpjCompleto: string; nome: string }>();
    
    catalogos.forEach(catalogo => {
      if (catalogo.cpf_cnpj) {
        const cnpjLimpo = catalogo.cpf_cnpj.replace(/\D/g, '');
        
        if (cnpjLimpo.length === 14) {
          const cnpjRaiz = cnpjLimpo.substring(0, 8);
          
          // Evita duplicatas baseado no CNPJ raiz
          if (!cnpjsUnicos.has(cnpjRaiz)) {
            cnpjsUnicos.set(cnpjRaiz, {
              cnpjCompleto: cnpjLimpo,
              nome: catalogo.nome
            });
          }
        }
      }
    });
      // Retorna apenas cnpjCompleto e nome
      return Array.from(cnpjsUnicos.values());
    } catch (error: unknown) {
      logger.error('Erro ao listar CNPJs dos catálogos:', error);
      throw new Error('Falha ao listar CNPJs dos catálogos');
    }
  }


  /**
   * Lista agências emissoras
   */
  async listarAgenciasEmissoras(): Promise<AgenciaEmissora[]> {
    try {
      return await catalogoPrisma.agenciaEmissora.findMany({
        orderBy: { nome: 'asc' }
      });
    } catch (error: unknown) {
      logger.error('Erro ao listar agências emissoras:', error);
      throw new Error('Falha ao listar agências emissoras');
    }
  }

  /**
   * NOVA FUNÇÃO: Obtém CNPJ raiz para API SISCOMEX
   */
  getCnpjRaizParaSiscomex(cnpjCompleto: string): string {
    return this.extrairCnpjRaiz(cnpjCompleto);
  }
}