import { Request, Response } from 'express';
import { AsyncJobStatus, AsyncJobTipo } from '@prisma/client';
import {
  AsyncJobEmExecucaoError,
  AsyncJobsEmExecucaoError,
  clearAsyncJobHistory,
  deleteAsyncJob,
  listAsyncJobs,
} from '../jobs/async-job.repository';
import { logger } from '../utils/logger';

function normalizarLista(valor: unknown): string[] {
  if (!valor) {
    return [];
  }

  if (Array.isArray(valor)) {
    return valor.flatMap(item =>
      typeof item === 'string' ? item.split(',') : []
    );
  }

  if (typeof valor === 'string') {
    return valor.split(',');
  }

  return [];
}

function extrairEnums<T extends string>(valor: unknown, possibilidades: readonly T[]): T[] {
  const normalizado = normalizarLista(valor);
  const conjunto = new Set(possibilidades);

  return normalizado
    .map(item => item.trim().toUpperCase())
    .filter((item): item is T => conjunto.has(item as T));
}

export async function listarAsyncJobs(req: Request, res: Response) {
  const status = extrairEnums(req.query.status, Object.values(AsyncJobStatus));
  const tipos = extrairEnums(req.query.tipo, Object.values(AsyncJobTipo));

  const limiteParam = Array.isArray(req.query.limite)
    ? req.query.limite[0]
    : req.query.limite;

  const limite = typeof limiteParam === 'string' ? Number.parseInt(limiteParam, 10) : undefined;
  const limiteValido = typeof limite === 'number' && Number.isFinite(limite) && limite > 0
    ? limite
    : undefined;

  const jobs = await listAsyncJobs({
    status: status.length ? status : undefined,
    tipos: tipos.length ? tipos : undefined,
    limite: limiteValido,
  });

  res.json(jobs);
}

export async function removerAsyncJob(req: Request, res: Response) {
  const id = Number(req.params.id);

  if (Number.isNaN(id)) {
    return res.status(400).json({ error: 'Identificador inválido.' });
  }

  try {
    const removido = await deleteAsyncJob(id);

    if (!removido) {
      return res.status(404).json({ error: 'Job não encontrado.' });
    }

    return res.status(204).send();
  } catch (error) {
    if (error instanceof AsyncJobEmExecucaoError) {
      return res
        .status(409)
        .json({ error: 'Não é possível remover um job que ainda está em execução.' });
    }

    logger.error('Erro ao remover job assíncrono:', error);
    return res.status(500).json({ error: 'Erro ao remover job assíncrono.' });
  }
}

export async function limparAsyncJobs(_req: Request, res: Response) {
  try {
    await clearAsyncJobHistory();
    return res.status(204).send();
  } catch (error) {
    if (error instanceof AsyncJobsEmExecucaoError) {
      return res
        .status(409)
        .json({ error: 'Há processos em execução. Aguarde a conclusão antes de limpar o histórico.' });
    }

    logger.error('Erro ao limpar histórico de jobs assíncronos:', error);
    return res.status(500).json({ error: 'Erro ao limpar histórico de jobs assíncronos.' });
  }
}
