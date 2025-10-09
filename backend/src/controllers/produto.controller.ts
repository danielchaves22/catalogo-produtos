// backend/src/controllers/produto.controller.ts
import { Request, Response } from 'express';
import { ProdutoService } from '../services/produto.service';
import { ValidationError } from '../types/validation-error';
import { logger } from '../utils/logger';

const produtoService = new ProdutoService();

export async function listarProdutos(req: Request, res: Response) {
  try {
    const statusPermitidos = [
      'PENDENTE',
      'APROVADO',
      'PROCESSANDO',
      'TRANSMITIDO',
      'ERRO'
    ] as const;
    const situacoesPermitidas = ['RASCUNHO', 'ATIVADO', 'DESATIVADO'] as const;

    const statusQuery = req.query.status;
    const situacaoQuery = req.query.situacao;

    const paraArray = (valor: unknown): string[] => {
      if (Array.isArray(valor)) {
        return valor
          .map(item => (typeof item === 'string' ? item : null))
          .filter((item): item is string => Boolean(item));
      }
      if (typeof valor === 'string') {
        return valor.split(',');
      }
      return [];
    };

    const status = paraArray(statusQuery)
      .map(valor => valor.trim())
      .filter((valor): valor is (typeof statusPermitidos)[number] =>
        statusPermitidos.includes(valor as (typeof statusPermitidos)[number])
      );

    const situacoes = paraArray(situacaoQuery)
      .map(valor => valor.trim())
      .filter((valor): valor is (typeof situacoesPermitidas)[number] =>
        situacoesPermitidas.includes(valor as (typeof situacoesPermitidas)[number])
      );

    const filtros = {
      status: status.length > 0 ? status : undefined,
      situacoes: situacoes.length > 0 ? situacoes : undefined,
      ncm: typeof req.query.ncm === 'string' ? req.query.ncm : undefined,
      catalogoId: req.query.catalogoId
        ? Number(req.query.catalogoId)
        : undefined,
      busca: typeof req.query.busca === 'string' ? req.query.busca : undefined
    };
    const pagina = Number(req.query.page);
    const tamanhoPagina = Number(req.query.pageSize);
    const paginacao = {
      page: Number.isFinite(pagina) && pagina > 0 ? pagina : undefined,
      pageSize:
        Number.isFinite(tamanhoPagina) && tamanhoPagina > 0
          ? tamanhoPagina
          : undefined
    };

    const produtos = await produtoService.listarTodos(
      filtros,
      req.user!.superUserId,
      paginacao
    );
    res.json(produtos);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
}

export async function obterProduto(req: Request, res: Response) {
  try {
    const id = Number(req.params.id);
    const produto = await produtoService.buscarPorId(
      id,
      req.user!.superUserId
    );
    if (!produto) return res.status(404).json({ error: 'Produto não encontrado' });
    res.json(produto);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
}

export async function criarProduto(req: Request, res: Response) {
  try {
    const produto = await produtoService.criar(
      req.body,
      req.user!.superUserId
    );
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
    const produto = await produtoService.atualizar(
      id,
      req.body,
      req.user!.superUserId
    );
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
    await produtoService.remover(id, req.user!.superUserId);
    res.status(204).send();
  } catch (error: any) {
    if (error.message?.includes('não encontrado')) {
      return res.status(404).json({ error: error.message });
    }
    logger.error('Erro ao remover produto:', error);
    res.status(500).json({ error: error.message });
  }
}

export async function clonarProduto(req: Request, res: Response) {
  try {
    const id = Number(req.params.id);
    const produto = await produtoService.clonar(
      id,
      req.body,
      req.user!.superUserId
    );
    res.status(201).json(produto);
  } catch (error: any) {
    if (error instanceof ValidationError) {
      return res.status(400).json({ error: error.message, details: error.details });
    }
    if (error.message?.includes('não encontrado')) {
      return res.status(404).json({ error: error.message });
    }
    if (error.message?.includes('Catálogo de destino')) {
      return res.status(400).json({ error: error.message });
    }
    logger.error('Erro ao clonar produto:', error);
    res.status(500).json({ error: error.message });
  }
}
