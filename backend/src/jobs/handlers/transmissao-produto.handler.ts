import { AsyncJobStatus } from '@prisma/client';
import { AsyncJobHandler } from '../async-job.worker';
import { ProdutoTransmissaoService } from '../../services/produto-transmissao.service';
import { registerJobLog } from '../async-job.repository';

export interface TransmissaoProdutoPayload {
  transmissaoId: number;
  superUserId: number;
}

const produtoTransmissaoService = new ProdutoTransmissaoService();

export const transmissaoProdutoJobHandler: AsyncJobHandler<TransmissaoProdutoPayload> = async ({
  job,
  payload,
  heartbeat,
}) => {
  if (!payload?.transmissaoId || !payload?.superUserId) {
    throw new Error('Payload da transmissão de produtos inválido.');
  }

  await produtoTransmissaoService.processarTransmissaoJob(
    payload.transmissaoId,
    payload.superUserId,
    heartbeat,
    job.id
  );

  await registerJobLog(job.id, AsyncJobStatus.CONCLUIDO, 'Transmissão finalizada.');
};
