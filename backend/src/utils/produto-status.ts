export type ProdutoStatusRegra =
  | 'PENDENTE'
  | 'APROVADO'
  | 'PROCESSANDO'
  | 'TRANSMITIDO'
  | 'ERRO'
  | 'AJUSTAR_ESTRUTURA';

interface ResolverStatusProdutoInput {
  statusAtual: ProdutoStatusRegra;
  possuiObrigatoriosPendentes: boolean;
  statusSolicitado?: ProdutoStatusRegra;
  houveAlteracaoDadosProduto?: boolean;
}

export function resolverStatusProduto({
  statusAtual,
  possuiObrigatoriosPendentes,
  statusSolicitado,
  houveAlteracaoDadosProduto = false,
}: ResolverStatusProdutoInput): ProdutoStatusRegra {
  if (possuiObrigatoriosPendentes) {
    return 'PENDENTE';
  }

  if (
    statusAtual === 'PENDENTE' ||
    statusAtual === 'AJUSTAR_ESTRUTURA' ||
    (statusAtual === 'TRANSMITIDO' && houveAlteracaoDadosProduto)
  ) {
    return 'APROVADO';
  }

  return statusSolicitado ?? statusAtual;
}
