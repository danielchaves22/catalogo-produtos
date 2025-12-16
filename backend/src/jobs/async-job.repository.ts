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

type AsyncJobProdutoExportacaoResumo = {
  id: number;
  superUserId: number;
  arquivoNome: string | null;
  arquivoExpiraEm: Date | null;
  arquivoPath: string | null;
  arquivoTamanho: number | null;
  totalItens: number | null;
};

export type AsyncJobWithRelations = AsyncJob & {
  arquivo?: AsyncJobFile | null;
  importacaoProduto?: { id: number } | null;
  atributoPreenchimentoMassa?: { id: number } | null;
  produtoExportacao?: AsyncJobProdutoExportacaoResumo | null;
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
  arquivo?: { nome: string | null; expiraEm: Date | null; storagePath: string | null; storageProvider: string | null } | null;
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
  atributoPreenchimentoMassa?: { id: number } | null;
  produtoExportacao?: AsyncJobProdutoExportacaoResumo | null;
}

export interface ListAsyncJobsParams {
  superUserId: number;
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
    storagePath?: string | null;
    storageProvider?: string | null;
    expiraEm?: Date | null;
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
        storagePath: dados.arquivo.storagePath ?? null,
        storageProvider: dados.arquivo.storageProvider ?? null,
        expiraEm: dados.arquivo.expiraEm ?? null,
      },
    });
  }

  await registerJobLog(job.id, AsyncJobStatus.PENDENTE, 'Job criado e aguardando processamento.', tx);

  const completo = await prisma.asyncJob.findUnique({
    where: { id: job.id },
    include: {
      arquivo: true,
      importacaoProduto: { select: { id: true } },
      atributoPreenchimentoMassa: { select: { id: true } },
      produtoExportacao: {
        select: {
          id: true,
          superUserId: true,
          arquivoNome: true,
          arquivoExpiraEm: true,
          arquivoPath: true,
          arquivoTamanho: true,
          totalItens: true,
        },
      },
    },
  });

  if (!completo) {
    throw new Error('Falha ao recuperar dados do job recém-criado.');
  }

  return completo;
}

export async function atualizarArquivoJob(
  jobId: number,
  dados: {
    nome?: string;
    conteudoBase64?: string | null;
    storagePath?: string | null;
    storageProvider?: string | null;
    expiraEm?: Date | null;
  }
): Promise<AsyncJobFile> {
  const data: Prisma.AsyncJobFileUpdateInput = {};

  if (dados.nome !== undefined) {
    data.nome = dados.nome;
  }
  if (dados.conteudoBase64 !== undefined) {
    data.conteudoBase64 = dados.conteudoBase64;
  }
  if (dados.storagePath !== undefined) {
    data.storagePath = dados.storagePath;
  }
  if (dados.storageProvider !== undefined) {
    data.storageProvider = dados.storageProvider;
  }
  if (dados.expiraEm !== undefined) {
    data.expiraEm = dados.expiraEm;
  }

  return catalogoPrisma.asyncJobFile.upsert({
    where: { jobId },
    update: data,
    create: {
      jobId,
      nome: dados.nome ?? 'arquivo',
      conteudoBase64: dados.conteudoBase64 ?? null,
      storagePath: dados.storagePath ?? null,
      storageProvider: dados.storageProvider ?? null,
      expiraEm: dados.expiraEm ?? null,
    },
  });
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
        atributoPreenchimentoMassa: { select: { id: true } },
        produtoExportacao: {
          select: {
            id: true,
            superUserId: true,
            arquivoNome: true,
            arquivoExpiraEm: true,
            arquivoPath: true,
            arquivoTamanho: true,
            totalItens: true,
          },
        },
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
  parametros: ListAsyncJobsParams
): Promise<AsyncJobResumo[]> {
  const where: Prisma.AsyncJobWhereInput = {
    OR: [
      { importacaoProduto: { superUserId: parametros.superUserId } },
      { atributoPreenchimentoMassa: { superUserId: parametros.superUserId } },
      { produtoExportacao: { superUserId: parametros.superUserId } },
      parametros.tipos?.includes(AsyncJobTipo.AJUSTE_ESTRUTURA)
        ? { tipo: AsyncJobTipo.AJUSTE_ESTRUTURA }
        : {
            AND: [
              { tipo: AsyncJobTipo.AJUSTE_ESTRUTURA },
              { payload: { path: '$.superUserId', equals: parametros.superUserId } },
            ],
          },
    ],
  };

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
      arquivo: { select: { nome: true, expiraEm: true, storagePath: true, storageProvider: true } },
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
      atributoPreenchimentoMassa: { select: { id: true } },
      produtoExportacao: {
        select: {
          id: true,
          superUserId: true,
          arquivoNome: true,
          arquivoExpiraEm: true,
          arquivoPath: true,
          arquivoTamanho: true,
          totalItens: true,
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
    arquivo: job.arquivo
      ? {
          nome: job.arquivo.nome,
          expiraEm: job.arquivo.expiraEm ?? null,
          storagePath: job.arquivo.storagePath ?? null,
          storageProvider: job.arquivo.storageProvider ?? null,
        }
      : null,
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
    atributoPreenchimentoMassa: job.atributoPreenchimentoMassa
      ? { id: job.atributoPreenchimentoMassa.id }
      : null,
    produtoExportacao: job.produtoExportacao
      ? {
          id: job.produtoExportacao.id,
          superUserId: job.produtoExportacao.superUserId,
          arquivoNome: job.produtoExportacao.arquivoNome,
          arquivoExpiraEm: job.produtoExportacao.arquivoExpiraEm,
          arquivoPath: job.produtoExportacao.arquivoPath,
          arquivoTamanho: job.produtoExportacao.arquivoTamanho,
          totalItens: job.produtoExportacao.totalItens,
        }
      : null,
  }));
}

export async function obterAsyncJobComArquivo(id: number): Promise<AsyncJobWithRelations | null> {
  return catalogoPrisma.asyncJob.findUnique({
    where: { id },
    include: {
      arquivo: true,
      importacaoProduto: { select: { id: true } },
      atributoPreenchimentoMassa: { select: { id: true } },
      produtoExportacao: {
        select: {
          id: true,
          superUserId: true,
          arquivoNome: true,
          arquivoExpiraEm: true,
          arquivoPath: true,
          arquivoTamanho: true,
          totalItens: true,
        },
      },
    },
  });
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
      produtoExportacao: {
        select: {
          id: true,
          superUserId: true,
          arquivoNome: true,
          arquivoExpiraEm: true,
          arquivoPath: true,
          arquivoTamanho: true,
          totalItens: true,
        },
      },
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

export class AsyncJobEmExecucaoError extends Error {
  constructor(message = 'O job ainda está em execução.') {
    super(message);
    this.name = 'AsyncJobEmExecucaoError';
  }
}

export class AsyncJobsEmExecucaoError extends Error {
  constructor(message = 'Existem jobs em execução no momento.') {
    super(message);
    this.name = 'AsyncJobsEmExecucaoError';
  }
}

export async function deleteAsyncJob(jobId: number): Promise<boolean> {
  return catalogoPrisma.$transaction(async tx => {
    const existente = await tx.asyncJob.findUnique({
      where: { id: jobId },
      select: {
        id: true,
        status: true,
        importacaoProduto: { select: { id: true } },
        produtoExportacao: { select: { id: true } },
      },
    });

    if (!existente) {
      return false;
    }

    if (
      existente.status === AsyncJobStatus.PENDENTE ||
      existente.status === AsyncJobStatus.PROCESSANDO
    ) {
      throw new AsyncJobEmExecucaoError();
    }

    if (existente.importacaoProduto) {
      await tx.importacaoProduto.update({
        where: { id: existente.importacaoProduto.id },
        data: { asyncJobId: null },
      });
    }

    if (existente.produtoExportacao) {
      await tx.produtoExportacao.update({
        where: { id: existente.produtoExportacao.id },
        data: { asyncJobId: null },
      });
    }

    await tx.asyncJob.delete({ where: { id: existente.id } });
    return true;
  });
}

export async function clearAsyncJobHistory(): Promise<number> {
  return catalogoPrisma.$transaction(async tx => {
    const ativos = await tx.asyncJob.count({
      where: {
        status: {
          in: [AsyncJobStatus.PENDENTE, AsyncJobStatus.PROCESSANDO],
        },
      },
    });

    if (ativos > 0) {
      throw new AsyncJobsEmExecucaoError();
    }

    const jobsParaRemover = await tx.asyncJob.findMany({
      select: { id: true },
    });

    if (jobsParaRemover.length === 0) {
      return 0;
    }

    const ids = jobsParaRemover.map(job => job.id);

    await tx.importacaoProduto.updateMany({
      where: { asyncJobId: { in: ids } },
      data: { asyncJobId: null },
    });

    await tx.produtoExportacao.updateMany({
      where: { asyncJobId: { in: ids } },
      data: { asyncJobId: null },
    });

    const resultado = await tx.asyncJob.deleteMany({
      where: { id: { in: ids } },
    });

    return resultado.count;
  });
}
