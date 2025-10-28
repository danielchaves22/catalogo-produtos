import { Request, Response } from 'express';
import { AsyncJobStatus, AsyncJobTipo } from '@prisma/client';
import { listAsyncJobs } from '../jobs/async-job.repository';

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
