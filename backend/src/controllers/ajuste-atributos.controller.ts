import { Request, Response } from 'express';
import {
  detalharVerificacao,
  iniciarVerificacaoAtributos as iniciarVerificacaoAtributosService,
  listarVerificacoes,
} from '../services/ajuste-atributos.service';
import { logger } from '../utils/logger';

export async function listarVerificacoesAtributos(req: Request, res: Response) {
  const superUserId = req.user!.superUserId;
  const verificacoes = await listarVerificacoes(superUserId);
  return res.json(verificacoes);
}

export async function iniciarVerificacaoAtributos(req: Request, res: Response) {
  try {
    const job = await iniciarVerificacaoAtributosService(req.user!.superUserId, req.user!.id);
    return res.status(201).json(job);
  } catch (error) {
    if (error instanceof Error) {
      logger.warn('Falha ao iniciar verificação de atributos', error);
      return res.status(409).json({ error: error.message });
    }

    logger.error('Erro inesperado ao iniciar verificação de atributos', error);
    return res.status(500).json({ error: 'Erro ao iniciar verificação de atributos.' });
  }
}

export async function detalharVerificacaoAtributos(req: Request, res: Response) {
  const id = Number(req.params.id);

  if (Number.isNaN(id)) {
    return res.status(400).json({ error: 'Identificador inválido.' });
  }

  const detalhe = await detalharVerificacao(req.user!.superUserId, id);

  if (!detalhe) {
    return res.status(404).json({ error: 'Verificação não encontrada.' });
  }

  return res.json(detalhe);
}
