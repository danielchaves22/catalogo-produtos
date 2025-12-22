import { Request, Response } from 'express';
import {
  detalharVerificacao,
  iniciarAplicacaoAjustesVerificacao,
  iniciarVerificacaoAtributos as iniciarVerificacaoAtributosService,
  listarVerificacoes,
} from '../services/ajuste-atributos.service';
import { logger } from '../utils/logger';

export async function listarVerificacoesAtributos(req: Request, res: Response) {
  if (req.user?.role !== 'ADMIN') {
    return res.status(403).json({ error: 'Apenas administradores podem acessar esta rota.' });
  }

  const verificacoes = await listarVerificacoes(req.user.superUserId);
  return res.json(verificacoes);
}

export async function iniciarVerificacaoAtributos(req: Request, res: Response) {
  if (req.user?.role !== 'ADMIN') {
    return res.status(403).json({ error: 'Apenas administradores podem iniciar verificações.' });
  }

  try {
    const job = await iniciarVerificacaoAtributosService(req.user!.id, req.user!.superUserId);
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
  if (req.user?.role !== 'ADMIN') {
    return res.status(403).json({ error: 'Apenas administradores podem acessar esta rota.' });
  }

  const id = Number(req.params.id);

  if (Number.isNaN(id)) {
    return res.status(400).json({ error: 'Identificador inválido.' });
  }

  const detalhe = await detalharVerificacao(id, req.user!.superUserId);

  if (!detalhe) {
    return res.status(404).json({ error: 'Verificação não encontrada.' });
  }

  return res.json(detalhe);
}

export async function aplicarAtualizacoesVerificacao(req: Request, res: Response) {
  if (req.user?.role !== 'ADMIN') {
    return res.status(403).json({ error: 'Apenas administradores podem aplicar ajustes.' });
  }

  const id = Number(req.params.id);

  if (Number.isNaN(id)) {
    return res.status(400).json({ error: 'Identificador inválido.' });
  }

  const combinacoes = Array.isArray(req.body?.combos)
    ? (req.body.combos as Array<{ ncm: string; modalidade: string }>)
        .filter(item => item?.ncm && item?.modalidade)
        .map(item => ({ ncm: String(item.ncm), modalidade: String(item.modalidade) }))
    : undefined;

  try {
    const job = await iniciarAplicacaoAjustesVerificacao(
      req.user!.id,
      req.user!.superUserId,
      id,
      combinacoes
    );
    return res.status(202).json({
      jobId: job.id,
      mensagem: 'Aplicação de ajustes enfileirada. Acompanhe em Processos Assíncronos.',
    });
  } catch (error) {
    logger.error('Falha ao aplicar ajustes de estrutura', error);
    return res.status(500).json({ error: 'Não foi possível aplicar as atualizações solicitadas.' });
  }
}
