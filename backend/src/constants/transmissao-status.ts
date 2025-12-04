import { ProdutoTransmissaoStatus } from '@prisma/client';

export const STATUS_TRANSMISSAO_EXECUCAO: ProdutoTransmissaoStatus[] = [
  ProdutoTransmissaoStatus.EM_FILA,
  ProdutoTransmissaoStatus.PROCESSANDO,
];

export function transmissaoEmExecucao(status?: ProdutoTransmissaoStatus | null) {
  if (!status) return false;
  return STATUS_TRANSMISSAO_EXECUCAO.includes(status);
}
