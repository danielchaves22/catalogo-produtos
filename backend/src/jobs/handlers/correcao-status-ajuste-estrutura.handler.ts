import { AsyncJobStatus } from '@prisma/client';
import { registerJobLog } from '../async-job.repository';
import { AsyncJobHandlerContext } from '../async-job.worker';
import {
  CorrecaoStatusAjusteEstruturaJobPayload,
  ProdutoService
} from '../../services/produto.service';

const produtoService = new ProdutoService();

export async function correcaoStatusAjusteEstruturaJobHandler({
  job,
  payload,
  heartbeat
}: AsyncJobHandlerContext<CorrecaoStatusAjusteEstruturaJobPayload>) {
  if (!payload?.superUserId) {
    throw new Error('Payload do job de correcao de status de ajuste de estrutura invalido.');
  }

  const quantidadeInformada = Array.isArray(payload.produtoIds) ? payload.produtoIds.length : null;
  const alvoDescricao = quantidadeInformada
    ? `${quantidadeInformada} produto(s) informado(s)`
    : 'todos os produtos em AJUSTAR_ESTRUTURA';

  await registerJobLog(
    job.id,
    AsyncJobStatus.PROCESSANDO,
    `Iniciando correcao de status para ${alvoDescricao}.`
  );
  await heartbeat();

  const resumo = await produtoService.corrigirStatusAjusteEstruturaProdutos(
    { produtoIds: payload.produtoIds },
    payload.superUserId,
    { onHeartbeat: heartbeat }
  );

  await registerJobLog(
    job.id,
    AsyncJobStatus.PROCESSANDO,
    `Correcao concluida. ${resumo.totalAnalisados} produto(s) analisado(s), ${resumo.mantidosAjuste} mantido(s) em AJUSTAR_ESTRUTURA, ${resumo.restauradosTransmitido} restaurado(s) para TRANSMITIDO, ${resumo.restauradosAprovado} para APROVADO, ${resumo.restauradosPendente} para PENDENTE e ${resumo.sincronizadosVersao} sincronizado(s) com a versao atual da estrutura.`
  );
}
