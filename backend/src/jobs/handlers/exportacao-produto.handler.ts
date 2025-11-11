import { AsyncJobStatus } from '@prisma/client';
import { AsyncJobHandler } from '../async-job.worker';
import { ProdutoExportacaoService } from '../../services/produto-exportacao.service';
import { atualizarArquivoJob, registerJobLog } from '../async-job.repository';
import { storageFactory } from '../../services/storage.factory';
import { logger } from '../../utils/logger';

export interface ExportacaoProdutoPayload {
  exportacaoId: number;
  superUserId: number;
}

const produtoExportacaoService = new ProdutoExportacaoService();

const UM_DIA_EM_MS = 24 * 60 * 60 * 1000;

export const exportacaoProdutoJobHandler: AsyncJobHandler<ExportacaoProdutoPayload> = async ({
  job,
  payload,
  heartbeat,
}) => {
  if (!payload?.exportacaoId || !payload?.superUserId) {
    throw new Error('Payload da exportação de produtos inválido.');
  }

  const exportacao = await produtoExportacaoService.obterExportacaoPorId(payload.exportacaoId);

  if (!exportacao) {
    throw new Error('Registro de exportação de produtos não encontrado.');
  }

  if (exportacao.superUserId !== payload.superUserId) {
    throw new Error('Exportação não pertence ao superusuário informado.');
  }

  await registerJobLog(job.id, AsyncJobStatus.PROCESSANDO, 'Preparando seleção de produtos.');
  await heartbeat();

  const idsSelecionados = await produtoExportacaoService.resolverIdsSelecionados(exportacao, payload.superUserId);

  await registerJobLog(job.id, AsyncJobStatus.PROCESSANDO, `Selecionando ${idsSelecionados.length} produto(s) para exportação.`);
  await heartbeat();

  const produtos = await produtoExportacaoService.buscarProdutosComAtributos(idsSelecionados, payload.superUserId);
  const jsonDados = produtoExportacaoService.transformarParaSiscomex(produtos);
  const conteudoBuffer = Buffer.from(JSON.stringify(jsonDados, null, 2), 'utf8');

  const provider = storageFactory();
  const caminho = `${payload.superUserId}/exportacoes/${job.id}/${Date.now()}.json`;

  await provider.upload(conteudoBuffer, caminho);
  await heartbeat();

  const expiraEm = new Date(Date.now() + UM_DIA_EM_MS);
  const storageProvider = provider.getSignedUrl ? 's3' : 'local';

  await atualizarArquivoJob(job.id, {
    nome: exportacao.arquivoNome ?? `exportacao-${job.id}.json`,
    conteudoBase64: null,
    storagePath: caminho,
    storageProvider,
    expiraEm,
  });

  await produtoExportacaoService.atualizarMetadadosArquivo(exportacao.id, {
    arquivoPath: caminho,
    arquivoExpiraEm: expiraEm,
    arquivoTamanho: conteudoBuffer.byteLength,
    totalItens: jsonDados.length,
  });

  await registerJobLog(
    job.id,
    AsyncJobStatus.PROCESSANDO,
    `Exportação gerada com ${jsonDados.length} item(ns). Arquivo disponível até ${expiraEm.toISOString()}.`
  );

  logger.info(`Exportação de produtos ${exportacao.id} concluída com ${jsonDados.length} itens.`);
};
