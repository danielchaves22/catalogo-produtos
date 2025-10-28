import {
  AsyncJob,
  AsyncJobFile,
  AsyncJobLog,
  AsyncJobStatus,
  AsyncJobTipo,
  Prisma,
  PrismaClient,
} from '@prisma/client';
import { catalogoPrisma } from '../utils/prisma';
import { logger } from '../utils/logger';

export type AsyncJobWithRelations = AsyncJob & {
  arquivo?: AsyncJobFile | null;
  importacaoProduto?: { id: number } | null;
};

export interface AsyncJobLogResumo {
  id: AsyncJobLog['id'];
  status: AsyncJobStatus;
  mensagem?: string | null;
  criadoEm: Date;
}

export interface AsyncJobResumo {
  id: AsyncJob['id'];
  tipo: AsyncJobTipo;
  status: AsyncJobStatus;
  tentativas: number;
  maxTentativas: number;
  prioridade: number;
  payload: Prisma.JsonValue | null;
  lockedAt: Date | null;
  heartbeatAt: Date | null;
  finalizadoEm: Date | null;
  criadoEm: Date;
  atualizadoEm: Date;
  arquivo?: { nome: string | null } | null;
  ultimoLog?: AsyncJobLogResumo | null;
  importacaoProduto?: {
    id: number;
    situacao: string;
    resultado: string;
    catalogo?: {
      id: number;
      nome: string;
      numero: number | null;
    } | null;
  } | null;
}

export interface ListAsyncJobsParams {
  status?: AsyncJobStatus[];
  tipos?: AsyncJobTipo[];
  limite?: number;
}

export interface CreateAsyncJobInput {
  tipo: AsyncJob['tipo'];
  payload?: Prisma.InputJsonValue | null;
  prioridade?: number;
  maxTentativas?: number;
  arquivo?: {
    nome: string;
    conteudoBase64?: string | null;
  };
}

const DEFAULT_STALLED_THRESHOLD_MS = 5 * 60 * 1000;

function getClient(tx?: Prisma.TransactionClient | PrismaClient) {
  return tx ?? catalogoPrisma;
}

export async function createAsyncJob(
  dados: CreateAsyncJobInput,
  tx?: Prisma.TransactionClient
): Promise<AsyncJobWithRelations> {
  const prisma = getClient(tx);

  const job = await prisma.asyncJob.create({
    data: {
      tipo: dados.tipo,
      prioridade: dados.prioridade ?? 0,
      maxTentativas: dados.maxTentativas ?? 3,
      payload: dados.payload ?? Prisma.JsonNull,
    },
  });

  if (dados.arquivo) {
    await prisma.asyncJobFile.create({
      data: {
        jobId: job.id,
        nome: dados.arquivo.nome,
        conteudoBase64: dados.arquivo.conteudoBase64 ?? null,
      },
    });
  }

  await registerJobLog(job.id, AsyncJobStatus.PENDENTE, 'Job criado e aguardando processamento.', tx);

  const completo = await prisma.asyncJob.findUnique({
    where: { id: job.id },
    include: {
      arquivo: true,
      importacaoProduto: { select: { id: true } },
    },
  });

  if (!completo) {
    throw new Error('Falha ao recuperar dados do job recém-criado.');
  }

  return completo;
}

export async function claimNextPendingJob(): Promise<AsyncJobWithRelations | null> {
  return catalogoPrisma.$transaction(async tx => {
    const candidato = await tx.asyncJob.findFirst({
      where: { status: AsyncJobStatus.PENDENTE },
      orderBy: [
        { prioridade: 'desc' },
        { id: 'asc' },
      ],
      select: { id: true },
    });

    if (!candidato) {
      return null;
    }

    const atualizado = await tx.asyncJob.updateMany({
      where: {
        id: candidato.id,
        status: AsyncJobStatus.PENDENTE,
      },
      data: {
        status: AsyncJobStatus.PROCESSANDO,
        lockedAt: new Date(),
        heartbeatAt: new Date(),
        tentativas: { increment: 1 },
      },
    });

    if (atualizado.count === 0) {
      return null;
    }

    const job = await tx.asyncJob.findUnique({
      where: { id: candidato.id },
      include: {
        arquivo: true,
        importacaoProduto: { select: { id: true } },
      },
    });

    return job ?? null;
  });
}

export async function touchJob(jobId: number): Promise<void> {
  await catalogoPrisma.asyncJob.update({
    where: { id: jobId },
    data: {
      heartbeatAt: new Date(),
    },
  });
}

export async function markJobAsCompleted(jobId: number, mensagem?: string) {
  await catalogoPrisma.asyncJob.update({
    where: { id: jobId },
    data: {
      status: AsyncJobStatus.CONCLUIDO,
      finalizadoEm: new Date(),
      lockedAt: null,
      heartbeatAt: null,
    },
  });

  await registerJobLog(
    jobId,
    AsyncJobStatus.CONCLUIDO,
    mensagem ?? 'Processamento concluído com sucesso.'
  );
}

export async function markJobAsFailed(jobId: number, mensagem?: string) {
  await catalogoPrisma.asyncJob.update({
    where: { id: jobId },
    data: {
      status: AsyncJobStatus.FALHO,
      finalizadoEm: new Date(),
      lockedAt: null,
      heartbeatAt: null,
    },
  });

  await registerJobLog(
    jobId,
    AsyncJobStatus.FALHO,
    mensagem ?? 'Job marcado como falho após erro durante o processamento.'
  );
}

export async function returnJobToQueue(jobId: number, mensagem?: string) {
  await catalogoPrisma.asyncJob.update({
    where: { id: jobId },
    data: {
      status: AsyncJobStatus.PENDENTE,
      lockedAt: null,
      heartbeatAt: null,
    },
  });

  await registerJobLog(
    jobId,
    AsyncJobStatus.PENDENTE,
    mensagem ?? 'Job retornado para a fila de processamento.'
  );
}

export async function registerJobLog(
  jobId: number,
  status: AsyncJobStatus,
  mensagem?: string,
  tx?: Prisma.TransactionClient
) {
  const prisma = getClient(tx);
  await prisma.asyncJobLog.create({
    data: {
      jobId,
      status,
      mensagem: mensagem ?? null,
    },
  });
}

export async function listAsyncJobs(
  parametros: ListAsyncJobsParams = {}
): Promise<AsyncJobResumo[]> {
  const where: Prisma.AsyncJobWhereInput = {};

  if (parametros.status?.length) {
    where.status = { in: parametros.status };
  }

  if (parametros.tipos?.length) {
    where.tipo = { in: parametros.tipos };
  }

  const jobs = await catalogoPrisma.asyncJob.findMany({
    where,
    orderBy: { criadoEm: 'desc' },
    take: parametros.limite,
    include: {
      arquivo: { select: { nome: true } },
      importacaoProduto: {
        select: {
          id: true,
          situacao: true,
          resultado: true,
          catalogo: {
            select: {
              id: true,
              nome: true,
              numero: true,
            },
          },
        },
      },
      logs: {
        orderBy: { criadoEm: 'desc' },
        take: 1,
        select: {
          id: true,
          status: true,
          mensagem: true,
          criadoEm: true,
        },
      },
    },
  });

  return jobs.map(job => ({
    id: job.id,
    tipo: job.tipo,
    status: job.status,
    tentativas: job.tentativas,
    maxTentativas: job.maxTentativas,
    prioridade: job.prioridade,
    payload: job.payload ?? null,
    lockedAt: job.lockedAt ?? null,
    heartbeatAt: job.heartbeatAt ?? null,
    finalizadoEm: job.finalizadoEm ?? null,
    criadoEm: job.criadoEm,
    atualizadoEm: job.atualizadoEm,
    arquivo: job.arquivo ? { nome: job.arquivo.nome } : null,
    ultimoLog: job.logs[0]
      ? {
          id: job.logs[0].id,
          status: job.logs[0].status,
          mensagem: job.logs[0].mensagem,
          criadoEm: job.logs[0].criadoEm,
        }
      : null,
    importacaoProduto: job.importacaoProduto
      ? {
          id: job.importacaoProduto.id,
          situacao: job.importacaoProduto.situacao,
          resultado: job.importacaoProduto.resultado,
          catalogo: job.importacaoProduto.catalogo
            ? {
                id: job.importacaoProduto.catalogo.id,
                nome: job.importacaoProduto.catalogo.nome,
                numero: job.importacaoProduto.catalogo.numero,
              }
            : null,
        }
      : null,
  }));
}

export interface ReleaseStalledJobsResult {
  reencarregados: AsyncJobWithRelations[];
  marcadosComoFalhos: AsyncJobWithRelations[];
}

export async function releaseStalledJobs(
  limiteMs: number = DEFAULT_STALLED_THRESHOLD_MS
): Promise<ReleaseStalledJobsResult> {
  const limiteData = new Date(Date.now() - limiteMs);

  const travados = await catalogoPrisma.asyncJob.findMany({
    where: {
      status: AsyncJobStatus.PROCESSANDO,
      OR: [
        { heartbeatAt: null, lockedAt: { lt: limiteData } },
        { heartbeatAt: { lt: limiteData } },
      ],
    },
    include: {
      importacaoProduto: { select: { id: true } },
    },
  });

  if (travados.length === 0) {
    return { reencarregados: [], marcadosComoFalhos: [] };
  }

  logger.warn(
    `Detectados ${travados.length} job(s) travados. Liberando para nova tentativa ou marcando como falho.`
  );

  const reencarregados: AsyncJobWithRelations[] = [];
  const marcadosComoFalhos: AsyncJobWithRelations[] = [];

  for (const job of travados) {
    const mensagem = 'Job liberado após detectar ausência de heartbeat.';
    if (job.tentativas >= job.maxTentativas) {
      await markJobAsFailed(job.id, mensagem);
      marcadosComoFalhos.push(job as AsyncJobWithRelations);
    } else {
      await returnJobToQueue(job.id, mensagem);
      reencarregados.push(job as AsyncJobWithRelations);
    }
  }

  return { reencarregados, marcadosComoFalhos };
}
