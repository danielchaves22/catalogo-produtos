import { AsyncJobStatus } from '@prisma/client';
import { AsyncJobHandlerContext } from '../async-job.worker';
import {
  AtributoPreenchimentoMassaJobPayload,
  AtributoPreenchimentoMassaService
} from '../../services/atributo-preenchimento-massa.service';
import { registerJobLog } from '../async-job.repository';

const atributoPreenchimentoMassaService = new AtributoPreenchimentoMassaService();

export async function atributoPreenchimentoMassaJobHandler({
  job,
  payload,
  heartbeat
}: AsyncJobHandlerContext<AtributoPreenchimentoMassaJobPayload>) {
  if (!payload) {
    throw new Error('Payload do job de preenchimento de atributos em massa não informado.');
  }

  await registerJobLog(
    job.id,
    AsyncJobStatus.PROCESSANDO,
    'Iniciando processamento de preenchimento de atributos em massa.'
  );

  const resumo = await atributoPreenchimentoMassaService.processarJob(payload, heartbeat);

  await registerJobLog(
    job.id,
    AsyncJobStatus.PROCESSANDO,
    `Processamento concluído. ${resumo.produtosImpactados} produto(s) impactado(s).`
  );
}
