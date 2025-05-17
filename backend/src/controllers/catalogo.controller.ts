// src/controllers/catalogo.controller.ts
import { Request, Response } from 'express';
import { CatalogoService } from '../services/catalogo.service';

const catalogoService = new CatalogoService();

/**
 * GET /api/catalogos
 * Lista todos os catálogos
 */
export async function listarCatalogos(req: Request, res: Response) {
  try {
    const catalogos = await catalogoService.listarTodos();
    return res.status(200).json(catalogos);
  } catch (error: unknown) {
    return res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Erro ao listar catálogos' 
    });
  }
}

/**
 * GET /api/catalogos/:id
 * Recupera um catálogo pelo ID
 */
export async function obterCatalogo(req: Request, res: Response) {
  const { id } = req.params;
  
  try {
    const catalogo = await catalogoService.buscarPorId(Number(id));
    
    if (!catalogo) {
      return res.status(404).json({ error: 'Catálogo não encontrado' });
    }
    
    return res.status(200).json(catalogo);
  } catch (error: unknown) {
    return res.status(500).json({ 
      error: error instanceof Error ? error.message : `Erro ao obter catálogo ID ${id}` 
    });
  }
}

/**
 * POST /api/catalogos
 * Cria um novo catálogo
 */
export async function criarCatalogo(req: Request, res: Response) {
  try {
    const catalogo = await catalogoService.criar(req.body);
    return res.status(201).json(catalogo);
  } catch (error: unknown) {
    return res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Erro ao criar catálogo' 
    });
  }
}

/**
 * PUT /api/catalogos/:id
 * Atualiza um catálogo existente
 */
export async function atualizarCatalogo(req: Request, res: Response) {
  const { id } = req.params;
  
  try {
    const catalogo = await catalogoService.atualizar(Number(id), req.body);
    return res.status(200).json(catalogo);
  } catch (error: unknown) {
    // Verifica se é erro de "não encontrado" pela mensagem
    const errorMessage = error instanceof Error ? error.message : `Erro ao atualizar catálogo ID ${id}`;
    
    if (errorMessage.includes('não encontrado')) {
      return res.status(404).json({ error: errorMessage });
    }
    
    return res.status(500).json({ error: errorMessage });
  }
}

/**
 * DELETE /api/catalogos/:id
 * Remove um catálogo
 */
export async function removerCatalogo(req: Request, res: Response) {
  const { id } = req.params;
  
  try {
    await catalogoService.remover(Number(id));
    return res.status(204).send();
  } catch (error: unknown) {
    // Verifica se é erro de "não encontrado" pela mensagem
    const errorMessage = error instanceof Error ? error.message : `Erro ao remover catálogo ID ${id}`;
    
    if (errorMessage.includes('não encontrado')) {
      return res.status(404).json({ error: errorMessage });
    }
    
    return res.status(500).json({ error: errorMessage });
  }
}