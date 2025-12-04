import { AsyncJobTipo } from '@prisma/client';
import { logger } from '../utils/logger';
import { startAsyncJobWorker, registerAsyncJobHandler, liberarJobsTravados } from './async-job.worker';
import { produtoImportacaoJobHandler } from './handlers/importacao-produto.handler';
import { atributoPreenchimentoMassaJobHandler } from './handlers/atributo-preenchimento-massa.handler';
import { exportacaoProdutoJobHandler } from './handlers/exportacao-produto.handler';
import { exportacaoFabricanteJobHandler } from './handlers/exportacao-fabricante.handler';
import { verificacaoAtributosNcmHandler } from './handlers/verificacao-atributos-ncm.handler';
import { transmissaoProdutoJobHandler } from './handlers/transmissao-produto.handler';

registerAsyncJobHandler(AsyncJobTipo.IMPORTACAO_PRODUTO, produtoImportacaoJobHandler);
registerAsyncJobHandler(AsyncJobTipo.ALTERACAO_ATRIBUTOS, atributoPreenchimentoMassaJobHandler);
registerAsyncJobHandler(AsyncJobTipo.EXPORTACAO_PRODUTO, exportacaoProdutoJobHandler);
registerAsyncJobHandler(AsyncJobTipo.EXPORTACAO_FABRICANTE, exportacaoFabricanteJobHandler);
registerAsyncJobHandler(AsyncJobTipo.AJUSTE_ESTRUTURA, verificacaoAtributosNcmHandler);
registerAsyncJobHandler(AsyncJobTipo.TRANSMISSAO_PRODUTO, transmissaoProdutoJobHandler);

startAsyncJobWorker();

liberarJobsTravados().catch(error => {
  logger.error('Falha ao liberar jobs travados na inicialização', error);
});
