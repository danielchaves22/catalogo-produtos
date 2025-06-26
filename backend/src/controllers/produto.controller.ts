// backend/src/controllers/produto.controller.ts
import { Request, Response } from 'express';
import { ProdutoService } from '../services/produto.service';

const produtoService = new ProdutoService();

export async function listarProdutos(req: Request, res: Response) {
  try {
    const produtos = await produtoService.listarTodos();
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
    res.status(500).json({ error: error.message });
  }
}
