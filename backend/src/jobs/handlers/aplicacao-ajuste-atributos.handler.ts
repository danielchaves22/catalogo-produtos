import { AsyncJobStatus } from '@prisma/client';
import { registerJobLog } from '../async-job.repository';
import { AsyncJobHandlerContext } from '../async-job.worker';
import { AplicacaoAjustesPayload, aplicarAjustesVerificacao } from '../../services/ajuste-atributos.service';

export async function aplicacaoAjusteAtributosHandler({
  job,
  payload,
  heartbeat,
}: AsyncJobHandlerContext<AplicacaoAjustesPayload>) {
  if (!payload?.superUserId || !payload?.verificacaoJobId) {
    throw new Error('Payload do job de aplicação de ajustes inválido.');
  }

  await registerJobLog(
    job.id,
    AsyncJobStatus.PROCESSANDO,
    `Iniciando aplicação de ajustes para a verificação #${payload.verificacaoJobId}.`
  );

  const resultado = await aplicarAjustesVerificacao({
    verificacaoJobId: payload.verificacaoJobId,
    superUserId: payload.superUserId,
    combinacoes: payload.combinacoes,
    jobId: job.id,
    onProgresso: heartbeat,
  });

  await registerJobLog(
    job.id,
    AsyncJobStatus.PROCESSANDO,
    `Aplicação concluída. ${resultado.ncmsAtualizadas} NCM(s) atualizadas e ${resultado.produtosMarcados} produto(s) marcados.`
  );
}
