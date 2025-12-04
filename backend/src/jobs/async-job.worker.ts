import { AsyncJobStatus, AsyncJobTipo, ProdutoTransmissaoStatus } from '@prisma/client';
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

export interface AsyncJobHandlerContext<TPayload = unknown> {
  job: AsyncJobWithRelations;
  payload: TPayload;
  arquivo?: AsyncJobWithRelations['arquivo'];
  heartbeat: () => Promise<void>;
}

export type AsyncJobHandler<TPayload = unknown> = (
  contexto: AsyncJobHandlerContext<TPayload>
) => Promise<void>;

const handlers = new Map<AsyncJobTipo, AsyncJobHandler<any>>();
let workerIniciado = false;
let loopEmExecucao = false;

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
  agendarLoop();
}

export async function notifyNewAsyncJob() {
  if (!workerIniciado) {
    startAsyncJobWorker();
  }
}

function agendarLoop() {
  if (loopEmExecucao) {
    return;
  }

  loopEmExecucao = true;
  processarFila()
    .catch(error => {
      logger.error('Falha no loop de processamento de jobs assíncronos', error);
    })
    .finally(() => {
      loopEmExecucao = false;
      if (workerIniciado) {
        setTimeout(agendarLoop, IDLE_DELAY_MS);
      }
    });
}

async function processarFila() {
  while (workerIniciado) {
    const job = await claimNextPendingJob();

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

  await catalogoPrisma.produtoTransmissao.update({
    where: { id: job.produtoTransmissao.id },
    data: {
      status: ProdutoTransmissaoStatus.FALHO,
      concluidoEm: new Date(),
    },
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
