import { AsyncJobStatus } from '@prisma/client';
import { registerJobLog } from '../async-job.repository';
import { AsyncJobHandlerContext } from '../async-job.worker';
import {
  AjusteEstruturaCatalogoJobPayload,
  ProdutoService
} from '../../services/produto.service';

const produtoService = new ProdutoService();

export async function ajusteEstruturaCatalogoJobHandler({
  job,
  payload,
  heartbeat
}: AsyncJobHandlerContext<AjusteEstruturaCatalogoJobPayload>) {
  if (!payload?.superUserId || !payload?.catalogoId || !payload?.ncmCodigo) {
    throw new Error('Payload do job de ajuste de estrutura por catálogo inválido.');
  }

  const modalidadeDescricao = payload.modalidade ? ` (${payload.modalidade})` : '';

  await registerJobLog(
    job.id,
    AsyncJobStatus.PROCESSANDO,
    `Iniciando ajuste de estrutura para o catálogo #${payload.catalogoId}, NCM ${payload.ncmCodigo}${modalidadeDescricao}.`
  );
  await heartbeat();

  const resumo = await produtoService.ajustarEstruturaCatalogo(
    {
      ncmCodigo: payload.ncmCodigo,
      modalidade: payload.modalidade,
      catalogoId: payload.catalogoId,
    },
    payload.superUserId,
    { onHeartbeat: heartbeat }
  );

  const transmissaoMensagem = resumo.transmissaoGerada
    ? ` Pré-transmissão #${resumo.transmissaoGerada.id} criada com ${resumo.transmissaoGerada.totalItens} item(ns).`
    : '';

  await registerJobLog(
    job.id,
    AsyncJobStatus.PROCESSANDO,
    `Ajuste concluído. ${resumo.ajustados} produto(s) ajustado(s), ${resumo.produtosElegiveis} elegível(is), ${resumo.produtosIncluidos} incluído(s) em pré-transmissão e ${resumo.produtosIgnoradosDuplicidade} ignorado(s) por duplicidade.${transmissaoMensagem}`
  );
}
