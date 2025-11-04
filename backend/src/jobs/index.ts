import { AsyncJobTipo } from '@prisma/client';
import { logger } from '../utils/logger';
import { startAsyncJobWorker, registerAsyncJobHandler, liberarJobsTravados } from './async-job.worker';
import { produtoImportacaoJobHandler } from './handlers/importacao-produto.handler';
import { atributoPreenchimentoMassaJobHandler } from './handlers/atributo-preenchimento-massa.handler';

registerAsyncJobHandler(AsyncJobTipo.IMPORTACAO_PRODUTO, produtoImportacaoJobHandler);
registerAsyncJobHandler(AsyncJobTipo.ALTERACAO_ATRIBUTOS, atributoPreenchimentoMassaJobHandler);

startAsyncJobWorker();

liberarJobsTravados().catch(error => {
  logger.error('Falha ao liberar jobs travados na inicialização', error);
});
