import {
  AsyncJobStatus,
  AsyncJobTipo,
  ProdutoTransmissaoItemStatus,
  ProdutoTransmissaoStatus,
} from '@prisma/client';
import { logger } from '../utils/logger';
import {
  AsyncJobWithRelations,
  ReleaseStalledJobsResult,
  claimNextPendingJob,
  markJobAsCompleted,
  markJobAsFailed,
  registerJobLog,
  releaseStalledJobs,
  returnJobToQueue,
  touchJob,
} from './async-job.repository';
import { catalogoPrisma } from '../utils/prisma';

const IDLE_DELAY_MS = 2000;
const TRANSMISSAO_JOB_TYPES = [AsyncJobTipo.TRANSMISSAO_PRODUTO] as const;

export interface AsyncJobHandlerContext<TPayload = unknown> {
  job: AsyncJobWithRelations;
  payload: TPayload;
  arquivo?: AsyncJobWithRelations['arquivo'];
  heartbeat: () => Promise<void>;
}

export type AsyncJobHandler<TPayload = unknown> = (
  contexto: AsyncJobHandlerContext<TPayload>
) => Promise<void>;

interface WorkerQueueConfig {
  nome: 'geral' | 'transmissao';
  includeTipos?: AsyncJobTipo[];
  excludeTipos?: AsyncJobTipo[];
}

const FILAS: WorkerQueueConfig[] = [
  {
    nome: 'geral',
    excludeTipos: [...TRANSMISSAO_JOB_TYPES],
  },
  {
    nome: 'transmissao',
    includeTipos: [...TRANSMISSAO_JOB_TYPES],
  },
];

const handlers = new Map<AsyncJobTipo, AsyncJobHandler<any>>();
const estadoFilas = new Map<WorkerQueueConfig['nome'], boolean>();
let workerIniciado = false;

function esperar(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function registerAsyncJobHandler<T>(
  tipo: AsyncJobTipo,
  handler: AsyncJobHandler<T>
) {
  handlers.set(tipo, handler as AsyncJobHandler<any>);
}

export function startAsyncJobWorker() {
  if (workerIniciado) {
    return;
  }

  workerIniciado = true;
  FILAS.forEach(agendarLoopFila);
}

export async function notifyNewAsyncJob() {
  if (!workerIniciado) {
    startAsyncJobWorker();
  }
}

function agendarLoopFila(fila: WorkerQueueConfig) {
  if (estadoFilas.get(fila.nome)) {
    return;
  }

  estadoFilas.set(fila.nome, true);
  processarFila(fila)
    .catch(error => {
      logger.error(`Falha no loop da fila ${fila.nome} de jobs assíncronos`, error);
    })
    .finally(() => {
      estadoFilas.set(fila.nome, false);
      if (workerIniciado) {
        setTimeout(() => agendarLoopFila(fila), IDLE_DELAY_MS);
      }
    });
}

async function processarFila(fila: WorkerQueueConfig) {
  while (workerIniciado) {
    const job = await claimNextPendingJob({
      includeTipos: fila.includeTipos,
      excludeTipos: fila.excludeTipos,
    });

    if (!job) {
      await esperar(IDLE_DELAY_MS);
      continue;
    }

    const handler = handlers.get(job.tipo);

    if (!handler) {
      logger.error(`Nenhum handler registrado para o tipo de job ${job.tipo}.`);
      await markJobAsFailed(job.id, 'Tipo de job sem handler configurado.');
      await atualizarImportacaoComoFalha(job, 'Tipo de job sem handler configurado.');
      continue;
    }

    const payload = (job.payload ?? {}) as unknown;
    const heartbeat = async () => {
      try {
        await touchJob(job.id);
      } catch (error) {
        logger.error(`Falha ao enviar heartbeat do job ${job.id}`, error);
      }
    };

    try {
      await handler({
        job,
        payload,
        arquivo: job.arquivo,
        heartbeat,
      });

      await markJobAsCompleted(job.id);
    } catch (error) {
      const mensagemErro =
        error instanceof Error ? error.message : 'Erro desconhecido ao processar job.';
      logger.error(`Erro ao processar job ${job.id}`, error);

      if (job.tentativas >= job.maxTentativas) {
        await markJobAsFailed(job.id, mensagemErro);
        await atualizarImportacaoComoFalha(job, mensagemErro);
        await atualizarExportacaoComoFalha(job);
        await atualizarTransmissaoComoFalha(job, mensagemErro);
      } else {
        await returnJobToQueue(job.id, mensagemErro);
      }
    }
  }
}

async function atualizarImportacaoComoFalha(
  job: AsyncJobWithRelations,
  mensagem?: string
) {
  if (!job.importacaoProduto) {
    return;
  }

  await catalogoPrisma.importacaoProduto.update({
    where: { id: job.importacaoProduto.id },
    data: {
      situacao: 'CONCLUIDA_INCOMPLETA',
      resultado: 'ATENCAO',
      finalizadoEm: new Date(),
    },
  });

  await registerJobLog(
    job.id,
    AsyncJobStatus.FALHO,
    mensagem ?? 'Importação marcada como incompleta após falha no job.'
  );
}

async function atualizarExportacaoComoFalha(job: AsyncJobWithRelations) {
  if (!job.produtoExportacao) {
    return;
  }

  await catalogoPrisma.produtoExportacao.update({
    where: { id: job.produtoExportacao.id },
    data: {
      arquivoPath: null,
      arquivoExpiraEm: null,
      arquivoTamanho: null,
      totalItens: null,
    },
  });
}

async function atualizarTransmissaoComoFalha(job: AsyncJobWithRelations, mensagem?: string) {
  if (!job.produtoTransmissao) {
    return;
  }

  const transmissaoId = job.produtoTransmissao.id;
  const motivo =
    mensagem ?? 'Transmissão marcada como falha após atingir o limite de tentativas do job.';

  await catalogoPrisma.$transaction(async tx => {
    await tx.produtoTransmissaoItem.updateMany({
      where: {
        transmissaoId,
        status: { in: [ProdutoTransmissaoItemStatus.PENDENTE, ProdutoTransmissaoItemStatus.PROCESSANDO] },
      },
      data: { status: ProdutoTransmissaoItemStatus.ERRO, mensagem: motivo },
    });

    const [totalItens, totalSucesso, totalErro] = await Promise.all([
      tx.produtoTransmissaoItem.count({ where: { transmissaoId } }),
      tx.produtoTransmissaoItem.count({
        where: { transmissaoId, status: ProdutoTransmissaoItemStatus.SUCESSO },
      }),
      tx.produtoTransmissaoItem.count({
        where: { transmissaoId, status: ProdutoTransmissaoItemStatus.ERRO },
      }),
    ]);

    const statusFinal =
      totalSucesso === 0
        ? ProdutoTransmissaoStatus.FALHO
        : totalSucesso === totalItens
          ? ProdutoTransmissaoStatus.CONCLUIDO
          : ProdutoTransmissaoStatus.PARCIAL;

    await tx.produtoTransmissao.update({
      where: { id: transmissaoId },
      data: {
        status: statusFinal,
        totalErro,
        totalSucesso,
        concluidoEm: new Date(),
      },
    });
  });

  if (mensagem) {
    await registerJobLog(job.id, AsyncJobStatus.FALHO, mensagem);
  }
}

export async function liberarJobsTravados() {
  const resultado: ReleaseStalledJobsResult = await releaseStalledJobs();
  for (const job of resultado.marcadosComoFalhos) {
    await atualizarImportacaoComoFalha(job);
    await atualizarExportacaoComoFalha(job);
    await atualizarTransmissaoComoFalha(job);
  }
}
