import { AsyncJobTipo } from '@prisma/client';
import { logger } from '../utils/logger';
import { startAsyncJobWorker, registerAsyncJobHandler, liberarJobsTravados } from './async-job.worker';
import { produtoImportacaoJobHandler } from './handlers/importacao-produto.handler';

registerAsyncJobHandler(AsyncJobTipo.IMPORTACAO_PRODUTO, produtoImportacaoJobHandler);

startAsyncJobWorker();

liberarJobsTravados().catch(error => {
  logger.error('Falha ao liberar jobs travados na inicialização', error);
});
