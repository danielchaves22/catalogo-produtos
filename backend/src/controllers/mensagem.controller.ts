// backend/src/controllers/mensagem.controller.ts
import { Request, Response } from 'express';
import { MensagemService, MensagemStatusFiltro } from '../services/mensagem.service';
import { MensagemCategoria } from '@prisma/client';
import { logger } from '../utils/logger';

const mensagemService = new MensagemService();

const STATUS_VALIDOS: MensagemStatusFiltro[] = ['TODAS', 'LIDAS', 'NAO_LIDAS'];

function normalizarStatus(valor: unknown): MensagemStatusFiltro {
  if (!valor) return 'TODAS';
  const normalizado = Array.isArray(valor) ? valor[0] : valor;
  if (typeof normalizado !== 'string') {
    return 'TODAS';
  }
  const maiusculo = normalizado.toUpperCase() as MensagemStatusFiltro;
  return STATUS_VALIDOS.includes(maiusculo) ? maiusculo : 'TODAS';
}

function normalizarCategoria(valor: unknown): MensagemCategoria | undefined {
  if (!valor) return undefined;
  const normalizado = Array.isArray(valor) ? valor[0] : valor;
  if (typeof normalizado !== 'string') {
    return undefined;
  }
  if (Object.values(MensagemCategoria).includes(normalizado as MensagemCategoria)) {
    return normalizado as MensagemCategoria;
  }
  return undefined;
}

function parsePositiveNumber(valor: unknown): number | undefined {
  if (!valor) return undefined;
  const normalizado = Array.isArray(valor) ? valor[0] : valor;
  if (typeof normalizado !== 'string' && typeof normalizado !== 'number') {
    return undefined;
  }
  const numero = Number(normalizado);
  if (Number.isNaN(numero) || numero < 0) {
    return undefined;
  }
  return Math.floor(numero);
}

export async function listarMensagens(req: Request, res: Response) {
  try {
    const superUserId = req.user?.superUserId;
    if (!superUserId) {
      return res.status(401).json({ error: 'Usuário não autenticado' });
    }

    const status = normalizarStatus(req.query.status);
    const limit = parsePositiveNumber(req.query.limit);
    const offset = parsePositiveNumber(req.query.offset);
    const categoria = normalizarCategoria(req.query.categoria);

    const resultado = await mensagemService.listar(
      superUserId,
      status,
      limit,
      offset,
      categoria,
    );

    return res.json(resultado);
  } catch (error) {
    logger.error('Erro ao listar mensagens', error);
    return res.status(500).json({ error: 'Erro ao listar mensagens' });
  }
}

export async function obterMensagem(req: Request, res: Response) {
  try {
    const superUserId = req.user?.superUserId;
    if (!superUserId) {
      return res.status(401).json({ error: 'Usuário não autenticado' });
    }

    const id = Number(req.params.id);
    if (Number.isNaN(id)) {
      return res.status(400).json({ error: 'Identificador inválido' });
    }

    const mensagem = await mensagemService.buscarPorId(superUserId, id);
    if (!mensagem) {
      return res.status(404).json({ error: 'Mensagem não encontrada' });
    }

    return res.json(mensagem);
  } catch (error) {
    logger.error('Erro ao buscar mensagem', error);
    return res.status(500).json({ error: 'Erro ao buscar mensagem' });
  }
}

export async function marcarMensagemComoLida(req: Request, res: Response) {
  try {
    const superUserId = req.user?.superUserId;
    if (!superUserId) {
      return res.status(401).json({ error: 'Usuário não autenticado' });
    }

    const id = Number(req.params.id);
    if (Number.isNaN(id)) {
      return res.status(400).json({ error: 'Identificador inválido' });
    }

    const mensagem = await mensagemService.marcarComoLida(superUserId, id);
    if (!mensagem) {
      return res.status(404).json({ error: 'Mensagem não encontrada' });
    }

    return res.json(mensagem);
  } catch (error) {
    logger.error('Erro ao marcar mensagem como lida', error);
    return res.status(500).json({ error: 'Erro ao atualizar mensagem' });
  }
}

export async function resumoNaoLidas(req: Request, res: Response) {
  try {
    const superUserId = req.user?.superUserId;
    if (!superUserId) {
      return res.status(401).json({ error: 'Usuário não autenticado' });
    }

    const limit = parsePositiveNumber(req.query.limit) ?? 5;
    const resultado = await mensagemService.resumoNaoLidas(superUserId, limit);
    return res.json(resultado);
  } catch (error) {
    logger.error('Erro ao obter resumo de mensagens não lidas', error);
    return res.status(500).json({ error: 'Erro ao carregar resumo de mensagens' });
  }
}

export async function contarNaoLidas(req: Request, res: Response) {
  try {
    const superUserId = req.user?.superUserId;
    if (!superUserId) {
      return res.status(401).json({ error: 'Usuário não autenticado' });
    }

    const total = await mensagemService.contarNaoLidas(superUserId);
    return res.json({ total });
  } catch (error) {
    logger.error('Erro ao contar mensagens não lidas', error);
    return res.status(500).json({ error: 'Erro ao contar mensagens não lidas' });
  }
}

export function listarCategorias(_: Request, res: Response) {
  const categorias = mensagemService.listarCategorias();
  return res.json({ categorias });
}

export async function removerMensagem(req: Request, res: Response) {
  try {
    const superUserId = req.user?.superUserId;
    if (!superUserId) {
      return res.status(401).json({ error: 'Usuário não autenticado' });
    }

    const id = Number(req.params.id);
    if (Number.isNaN(id)) {
      return res.status(400).json({ error: 'Identificador inválido' });
    }

    const removida = await mensagemService.remover(superUserId, id);
    if (!removida) {
      return res.status(404).json({ error: 'Mensagem não encontrada' });
    }

    return res.status(204).send();
  } catch (error) {
    logger.error('Erro ao remover mensagem', error);
    return res.status(500).json({ error: 'Erro ao remover mensagem' });
  }
}
