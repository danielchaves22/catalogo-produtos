import { Request, Response } from 'express';
import { ProdutoService } from '../services/produto.service';

const produtoService = new ProdutoService();

export async function listarProdutos(req: Request, res: Response) {
  try {
    const produtos = await produtoService.listar();
    res.json(produtos);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Erro ao listar produtos' });
  }
}

export async function criarProduto(req: Request, res: Response) {
  try {
    const produto = await produtoService.criar(req.body);
    res.status(201).json(produto);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Erro ao criar produto' });
  }
}

export async function obterEstrutura(req: Request, res: Response) {
  try {
    const { ncm } = req.params;
    const estrutura = await produtoService.obterEstruturaAtributos(ncm);
    res.json(estrutura);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Erro ao obter estrutura' });
  }
}
