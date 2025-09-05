// backend/src/constants/permissoes.ts
// Lista de permissões disponíveis para subusuários
export const PERMISSOES = [
  // Catálogo
  'catalogo.cadastrar',
  'catalogo.listar',
  'catalogo.visualizar',
  'catalogo.alterar',
  // Operador estrangeiro
  'operador.cadastrar',
  'operador.listar',
  'operador.visualizar',
  'operador.alterar',
  // Produtos
  'produto.cadastrar',
  'produto.listar',
  'produto.visualizar',
  'produto.alterar',
  // Certificados
  'certificado.listar',
  'certificado.cadastrar',
  'certificado.excluir',
  // Transmissão
  'transmissao.catalogo',
  'transmissao.catalogo.sincronizar',
  'transmissao.produto.sincronizar',
  // Importação
  'importacao.pucomex',
  'importacao.tecalert',
  'importacao.arquivo',
  // Notificações
  'notificacao.visualizar'
] as const;

export type Permissao = typeof PERMISSOES[number];
