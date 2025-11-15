import { Request, Response } from 'express';
import { AsyncJobStatus, AsyncJobTipo } from '@prisma/client';
import {
  AsyncJobEmExecucaoError,
  AsyncJobsEmExecucaoError,
  clearAsyncJobHistory,
  deleteAsyncJob,
  listAsyncJobs,
  obterAsyncJobComArquivo,
} from '../jobs/async-job.repository';
import { logger } from '../utils/logger';
import { storageFactory } from '../services/storage.factory';

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

export async function gerarLinkArquivoJob(req: Request, res: Response) {
  const id = Number(req.params.id);

  if (Number.isNaN(id)) {
    return res.status(400).json({ error: 'Identificador inválido.' });
  }

  const job = await obterAsyncJobComArquivo(id);

  if (!job || job.tipo !== AsyncJobTipo.EXPORTACAO_PRODUTO) {
    return res.status(404).json({ error: 'Arquivo não encontrado para o job informado.' });
  }

  if (!job.produtoExportacao || job.produtoExportacao.superUserId !== req.user!.superUserId) {
    return res.status(404).json({ error: 'Arquivo não disponível.' });
  }

  if (job.status !== AsyncJobStatus.CONCLUIDO) {
    return res.status(409).json({ error: 'O arquivo só fica disponível após a conclusão do processo.' });
  }

  const caminho = job.arquivo?.storagePath ?? job.produtoExportacao.arquivoPath;
  if (!caminho) {
    return res.status(404).json({ error: 'Arquivo ainda não foi gerado para este processo.' });
  }

  const expiraEm = job.produtoExportacao.arquivoExpiraEm ?? job.arquivo?.expiraEm ?? null;
  if (expiraEm && expiraEm.getTime() < Date.now()) {
    return res.status(410).json({ error: 'O arquivo expirou. Solicite uma nova exportação.' });
  }

  const provider = storageFactory();
  const nome = job.produtoExportacao.arquivoNome ?? job.arquivo?.nome ?? `exportacao-${job.id}.json`;

  if (typeof provider.getSignedUrl === 'function') {
    const segundosRestantes = expiraEm
      ? Math.max(60, Math.floor((expiraEm.getTime() - Date.now()) / 1000))
      : 3600;

    try {
      const url = await provider.getSignedUrl(caminho, segundosRestantes, { filename: nome });
      return res.json({ nome, url, expiraEm: expiraEm?.toISOString() ?? null });
    } catch (error) {
      logger.error('Falha ao gerar URL assinada para arquivo de exportação', error);
      return res.status(500).json({ error: 'Não foi possível gerar o link temporário do arquivo.' });
    }
  }

  try {
    const arquivo = await provider.get(caminho);
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${nome}"`);
    res.setHeader('Content-Length', arquivo.byteLength);
    return res.send(arquivo);
  } catch (error) {
    logger.error('Falha ao recuperar arquivo de exportação', error);
    return res.status(500).json({ error: 'Não foi possível recuperar o arquivo solicitado.' });
  }
}
