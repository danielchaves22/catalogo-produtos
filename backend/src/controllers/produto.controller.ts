import { Request, Response } from 'express';
import { ProdutoService } from '../services/produto.service';

const produtoService = new ProdutoService();

export function listarProdutos(req: Request, res: Response) {
  return res.json(produtoService.listar());
}

export function criarProduto(req: Request, res: Response) {
  try {
    const { codigo, ncmCodigo, valoresAtributos } = req.body;
    if (!codigo || !ncmCodigo) {
      return res.status(400).json({ error: 'Código e NCM são obrigatórios' });
    }
    const produto = produtoService.criar({
      codigo,
      ncmCodigo,
      valoresAtributos: valoresAtributos || {}
    });
    return res.status(201).json(produto);
  } catch (error: any) {
    return res.status(400).json({ error: error.message });
  }
}
