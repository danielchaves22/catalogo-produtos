// backend/src/controllers/operador-estrangeiro.controller.ts
import { Request, Response } from 'express';
import { OperadorEstrangeiroService } from '../services/operador-estrangeiro.service';
import { logger } from '../utils/logger';

const operadorEstrangeiroService = new OperadorEstrangeiroService();

/**
 * GET /api/operadores-estrangeiros
 * Lista todos os operadores estrangeiros
 */
export async function listarOperadoresEstrangeiros(req: Request, res: Response) {
  try {
    const cnpjRaiz = req.query.cnpjRaiz as string;
    const operadores = await operadorEstrangeiroService.listarTodos(cnpjRaiz);
    return res.status(200).json(operadores);
  } catch (error: unknown) {
    logger.error('Erro ao listar operadores estrangeiros:', error);
    return res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Erro ao listar operadores estrangeiros' 
    });
  }
}

/**
 * GET /api/operadores-estrangeiros/:id
 * Recupera um operador estrangeiro pelo ID
 */
export async function obterOperadorEstrangeiro(req: Request, res: Response) {
  const { id } = req.params;
  
  try {
    const operador = await operadorEstrangeiroService.buscarPorId(Number(id));
    
    if (!operador) {
      return res.status(404).json({ error: 'Operador estrangeiro não encontrado' });
    }
    
    return res.status(200).json(operador);
  } catch (error: unknown) {
    logger.error(`Erro ao obter operador estrangeiro ID ${id}:`, error);
    return res.status(500).json({ 
      error: error instanceof Error ? error.message : `Erro ao obter operador estrangeiro ID ${id}` 
    });
  }
}

/**
 * GET /api/operadores-estrangeiros/buscar-por-tin/:tin
 * Busca operadores estrangeiros pelo TIN
 */
export async function buscarPorTin(req: Request, res: Response) {
  const { tin } = req.params;
  
  try {
    const operadores = await operadorEstrangeiroService.buscarPorTin(tin);
    return res.status(200).json(operadores);
  } catch (error: unknown) {
    logger.error(`Erro ao buscar operadores por TIN ${tin}:`, error);
    return res.status(500).json({ 
      error: error instanceof Error ? error.message : `Erro ao buscar operadores por TIN ${tin}` 
    });
  }
}

/**
 * POST /api/operadores-estrangeiros
 * Cria um novo operador estrangeiro
 */
export async function criarOperadorEstrangeiro(req: Request, res: Response) {
  try {
    const operador = await operadorEstrangeiroService.criar(req.body);
    return res.status(201).json(operador);
  } catch (error: unknown) {
    logger.error('Erro ao criar operador estrangeiro:', error);
    return res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Erro ao criar operador estrangeiro' 
    });
  }
}

/**
 * PUT /api/operadores-estrangeiros/:id
 * Atualiza um operador estrangeiro existente
 */
export async function atualizarOperadorEstrangeiro(req: Request, res: Response) {
  const { id } = req.params;
  
  try {
    const operador = await operadorEstrangeiroService.atualizar(Number(id), req.body);
    return res.status(200).json(operador);
  } catch (error: unknown) {
    logger.error(`Erro ao atualizar operador estrangeiro ID ${id}:`, error);
    
    const errorMessage = error instanceof Error ? error.message : `Erro ao atualizar operador estrangeiro ID ${id}`;
    
    if (errorMessage.includes('não encontrado')) {
      return res.status(404).json({ error: errorMessage });
    }
    
    return res.status(500).json({ error: errorMessage });
  }
}

/**
 * DELETE /api/operadores-estrangeiros/:id
 * Remove um operador estrangeiro (desativa)
 */
export async function removerOperadorEstrangeiro(req: Request, res: Response) {
  const { id } = req.params;
  
  try {
    await operadorEstrangeiroService.remover(Number(id));
    return res.status(204).send();
  } catch (error: unknown) {
    logger.error(`Erro ao remover operador estrangeiro ID ${id}:`, error);
    
    const errorMessage = error instanceof Error ? error.message : `Erro ao remover operador estrangeiro ID ${id}`;
    
    if (errorMessage.includes('não encontrado')) {
      return res.status(404).json({ error: errorMessage });
    }
    
    return res.status(500).json({ error: errorMessage });
  }
}

// ========== CONTROLLERS PARA TABELAS AUXILIARES ==========

/**
 * GET /api/operadores-estrangeiros/aux/paises
 * Lista todos os países
 */
export async function listarPaises(req: Request, res: Response) {
  try {
    const paises = await operadorEstrangeiroService.listarPaises();
    return res.status(200).json(paises);
  } catch (error: unknown) {
    logger.error('Erro ao listar países:', error);
    return res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Erro ao listar países' 
    });
  }
}

/**
 * GET /api/operadores-estrangeiros/aux/subdivisoes/:paisCodigo
 * Lista subdivisões de um país específico
 */
export async function listarSubdivisoesPorPais(req: Request, res: Response) {
  try {
    const { paisCodigo } = req.params;
    console.log(`Buscando subdivisões para país: ${paisCodigo}`);
    
    const subdivisoes = await operadorEstrangeiroService.listarSubdivisoesPorPais(paisCodigo);
    console.log(`Encontradas ${subdivisoes.length} subdivisões para ${paisCodigo}`);
    
    return res.status(200).json(subdivisoes);
  } catch (error: unknown) {
    logger.error('Erro ao listar subdivisões por país:', error);
    return res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Erro ao listar subdivisões por país' 
    });
  }
}

/**
 * GET /api/operadores-estrangeiros/aux/subdivisoes
 * Lista todas as subdivisões
 */
export async function listarSubdivisoes(req: Request, res: Response) {
  try {
    const subdivisoes = await operadorEstrangeiroService.listarSubdivisoes();
    return res.status(200).json(subdivisoes);
  } catch (error: unknown) {
    logger.error('Erro ao listar subdivisões:', error);
    return res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Erro ao listar subdivisões' 
    });
  }
}

/**
 * GET /api/operadores-estrangeiros/aux/cnpjs-catalogos
 * Lista CNPJs disponíveis dos catálogos
 */
export async function listarCnpjsCatalogos(req: Request, res: Response) {
  try {
    const cnpjs = await operadorEstrangeiroService.listarCnpjsCatalogos();
    return res.status(200).json(cnpjs);
  } catch (error: unknown) {
    logger.error('Erro ao listar CNPJs dos catálogos:', error);
    return res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Erro ao listar CNPJs dos catálogos' 
    });
  }
}

/**
 * GET /api/operadores-estrangeiros/aux/agencias-emissoras
 * Lista todas as agências emissoras
 */
export async function listarAgenciasEmissoras(req: Request, res: Response) {
  try {
    const agencias = await operadorEstrangeiroService.listarAgenciasEmissoras();
    return res.status(200).json(agencias);
  } catch (error: unknown) {
    logger.error('Erro ao listar agências emissoras:', error);
    return res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Erro ao listar agências emissoras' 
    });
  }
}