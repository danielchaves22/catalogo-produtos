// src/controllers/catalogo.controller.ts
import { Request, Response } from 'express';
import { CatalogoAmbiente } from '@prisma/client';
import { CatalogoService } from '../services/catalogo.service';
import { storageFactory } from '../services/storage.factory';

const catalogoService = new CatalogoService();

/**
 * GET /api/catalogos
 * Lista todos os catálogos
 */
export async function listarCatalogos(req: Request, res: Response) {
  try {
    const catalogos = await catalogoService.listarTodos(req.user!.superUserId);
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
    const catalogo = await catalogoService.buscarPorId(Number(id), req.user!.superUserId);
    
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
    const catalogo = await catalogoService.criar(req.body, req.user!.superUserId);
    return res.status(201).json(catalogo);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Erro ao criar catálogo';
    if (message.includes('Já existe um catálogo')) {
      return res.status(400).json({ error: message });
    }
    return res.status(500).json({ error: message });
  }
}

/**
 * PUT /api/catalogos/:id
 * Atualiza um catálogo existente
 */
export async function atualizarCatalogo(req: Request, res: Response) {
  const { id } = req.params;
  
  try {
    const catalogo = await catalogoService.atualizar(Number(id), req.body, req.user!.superUserId);
    return res.status(200).json(catalogo);
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : `Erro ao atualizar catalogo ID ${id}`;
    if (errorMessage.includes('Já existe um catálogo')) {
      return res.status(400).json({ error: errorMessage });
    }
    if (errorMessage.includes('não encontrado')) {
      return res.status(404).json({ error: errorMessage });
    }
    return res.status(500).json({ error: errorMessage });
  }
}


export async function alterarAmbienteCatalogo(req: Request, res: Response) {
  const { id } = req.params;

  try {
    const { ambiente } = req.body as { ambiente: CatalogoAmbiente };
    const catalogo = await catalogoService.alterarAmbiente(
      Number(id),
      ambiente,
      req.user!.superUserId
    );
    return res.status(200).json(catalogo);
  } catch (error: unknown) {
    const message = error instanceof Error
      ? error.message
      : `Erro ao alterar ambiente do catalogo ID ${id}`;

    if (message.includes('nao encontrado')) {
      return res.status(404).json({ error: message });
    }

    if (message.includes('retornar') || message.includes('permitida')) {
      return res.status(400).json({ error: message });
    }

    return res.status(500).json({ error: message });
  }
}

export async function downloadCertificado(req: Request, res: Response) {
  const { id } = req.params;
  try {
    const path = await catalogoService.obterCertificadoPath(Number(id), req.user!.superUserId);
    if (!path) {
      return res.status(404).json({ error: 'Certificado não encontrado' });
    }
    const provider = storageFactory();
    const file = await provider.get(path);
    res.setHeader('Content-Type', 'application/x-pkcs12');
    res.setHeader('Content-Disposition', `attachment; filename=certificado-${id}.pfx`);
    return res.send(file);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro ao baixar certificado';
    return res.status(500).json({ error: message });
  }
}

export async function vincularCertificado(req: Request, res: Response) {
  const { id } = req.params;
  const { certificadoId } = req.body as { certificadoId: number };
  try {
    await catalogoService.vincularCertificado(Number(id), certificadoId, req.user!.superUserId);
    return res.status(204).send();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro ao vincular certificado';
    return res.status(500).json({ error: message });
  }
}

export async function clonarCatalogo(req: Request, res: Response) {
  const { id } = req.params;
  const { cpf_cnpj, nome } = req.body as { cpf_cnpj: string; nome: string };
  try {
    const catalogo = await catalogoService.clonar(
      Number(id),
      nome,
      cpf_cnpj,
      req.user!.superUserId
    );
    return res.status(201).json(catalogo);
  } catch (error) {
    const message = error instanceof Error ? error.message : `Erro ao clonar catálogo ID ${id}`;
    if (message.includes('vinculado a um catálogo')) {
      return res.status(400).json({ error: message });
    }
    if (message.includes('Já existe um catálogo')) {
      return res.status(400).json({ error: message });
    }
    if (message.includes('não encontrado')) {
      return res.status(404).json({ error: message });
    }
    return res.status(500).json({ error: message });
  }
}

/**
 * DELETE /api/catalogos/:id
 * Remove um catálogo
 */
export async function removerCatalogo(req: Request, res: Response) {
  const { id } = req.params;
  
  try {
    await catalogoService.remover(Number(id), req.user!.superUserId);
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
