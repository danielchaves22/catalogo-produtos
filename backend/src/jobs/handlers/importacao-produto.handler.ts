import { AsyncJobTipo } from '@prisma/client';
import { AsyncJobHandlerContext } from '../async-job.worker';
import { ProdutoImportacaoService } from '../../services/produto-importacao.service';

interface ProdutoImportacaoJobPayload {
  importacaoId: number;
  superUserId: number;
  usuarioCatalogoId: number | null;
  catalogoId: number;
  modalidade: string;
}

const produtoImportacaoService = new ProdutoImportacaoService();

export async function produtoImportacaoJobHandler({
  payload,
  arquivo,
  heartbeat,
}: AsyncJobHandlerContext<ProdutoImportacaoJobPayload>) {
  if (!arquivo?.conteudoBase64) {
    throw new Error('Arquivo da importação não encontrado para processamento.');
  }

  await produtoImportacaoService.processarImportacaoJob(
    {
      importacaoId: payload.importacaoId,
      superUserId: payload.superUserId,
      usuarioCatalogoId: payload.usuarioCatalogoId,
      catalogoId: payload.catalogoId,
      modalidade: payload.modalidade,
      arquivo: {
        nome: arquivo.nome,
        conteudoBase64: arquivo.conteudoBase64,
      },
    },
    heartbeat
  );
}

export const IMPORTACAO_PRODUTO_JOB_TIPO = AsyncJobTipo.IMPORTACAO_PRODUTO;
