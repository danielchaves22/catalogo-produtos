// backend/src/controllers/produto.controller.ts
import { Request, Response } from 'express';
import { ProdutoService } from '../services/produto.service';
import { ValidationError } from '../types/validation-error';
import { logger } from '../utils/logger';

const produtoService = new ProdutoService();

export async function listarProdutos(req: Request, res: Response) {
  try {
    const filtros = {
      status: req.query.status as 'RASCUNHO' | 'ATIVO' | 'INATIVO' | undefined,
      situacao: req.query.situacao as string | undefined,
      ncm: req.query.ncm as string | undefined
    };
    const produtos = await produtoService.listarTodos(filtros);
    res.json(produtos);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
}

export async function obterProduto(req: Request, res: Response) {
  try {
    const id = Number(req.params.id);
    const produto = await produtoService.buscarPorId(id);
    if (!produto) return res.status(404).json({ error: 'Produto não encontrado' });
    res.json(produto);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
}

export async function criarProduto(req: Request, res: Response) {
  try {
    const produto = await produtoService.criar(req.body);
    res.status(201).json(produto);
  } catch (error: any) {
    if (error instanceof ValidationError) {
      return res.status(400).json({ error: error.message, details: error.details });
    }
    logger.error('Erro ao criar produto:', error);
    res.status(500).json({ error: error.message });
  }
}

export async function atualizarProduto(req: Request, res: Response) {
  try {
    const id = Number(req.params.id);
    const produto = await produtoService.atualizar(id, req.body);
    res.json(produto);
  } catch (error: any) {
    if (error instanceof ValidationError) {
      return res.status(400).json({ error: error.message, details: error.details });
    }
    if (error.message?.includes('não encontrado')) {
      return res.status(404).json({ error: error.message });
    }
    if (error.message?.includes('não pode ser alterado')) {
      return res.status(400).json({ error: error.message });
    }
    logger.error('Erro ao atualizar produto:', error);
    res.status(500).json({ error: error.message });
  }
}

export async function removerProduto(req: Request, res: Response) {
  try {
    const id = Number(req.params.id);
    await produtoService.remover(id);
    res.status(204).send();
  } catch (error: any) {
    if (error.message?.includes('não encontrado')) {
      return res.status(404).json({ error: error.message });
    }
    logger.error('Erro ao remover produto:', error);
    res.status(500).json({ error: error.message });
  }
}
