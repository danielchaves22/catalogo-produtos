import { ProdutoTransmissaoStatus } from '@prisma/client';

export const STATUS_TRANSMISSAO_EXECUCAO: ProdutoTransmissaoStatus[] = [
  ProdutoTransmissaoStatus.EM_FILA,
  ProdutoTransmissaoStatus.PROCESSANDO,
];

export const STATUS_TRANSMISSAO_FILA_CATALOGO: ProdutoTransmissaoStatus[] = [
  ProdutoTransmissaoStatus.EM_FILA,
  ProdutoTransmissaoStatus.PROCESSANDO,
  ProdutoTransmissaoStatus.INTERROMPIDA,
];

export const STATUS_TRANSMISSAO_ABERTA: ProdutoTransmissaoStatus[] = [
  ProdutoTransmissaoStatus.AGUARDANDO_CONFIRMACAO,
  ...STATUS_TRANSMISSAO_FILA_CATALOGO,
];

export function transmissaoEmExecucao(status?: ProdutoTransmissaoStatus | null) {
  if (!status) return false;
  return STATUS_TRANSMISSAO_EXECUCAO.includes(status);
}

export function transmissaoAberta(status?: ProdutoTransmissaoStatus | null) {
  if (!status) return false;
  return STATUS_TRANSMISSAO_ABERTA.includes(status);
}
