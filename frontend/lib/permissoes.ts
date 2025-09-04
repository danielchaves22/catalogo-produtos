// frontend/lib/permissoes.ts
export interface PermissaoItem {
  codigo: string;
  descricao: string;
}

export interface GrupoPermissao {
  titulo: string;
  permissoes: PermissaoItem[];
}

export const GRUPOS_PERMISSOES: GrupoPermissao[] = [
  {
    titulo: 'Catálogo',
    permissoes: [
      { codigo: 'catalogo.cadastrar', descricao: 'Cadastrar um novo catálogo' },
      { codigo: 'catalogo.listar', descricao: 'Listar todos os catálogos' },
      { codigo: 'catalogo.visualizar', descricao: 'Visualizar os dados do catálogo' },
      { codigo: 'catalogo.alterar', descricao: 'Alterar os dados do catálogo (Atribuir CNPJ / Atribuir um Certificado)' },
    ],
  },
  {
    titulo: 'Operador Estrangeiro',
    permissoes: [
      { codigo: 'operador.cadastrar', descricao: 'Cadastrar um operador estrangeiro' },
      { codigo: 'operador.listar', descricao: 'Listar todos os operadores' },
      { codigo: 'operador.visualizar', descricao: 'Visualizar os dados do operador estrangeiro' },
      { codigo: 'operador.alterar', descricao: 'Alterar os dados do operador estrangeiro' },
    ],
  },
  {
    titulo: 'Produtos',
    permissoes: [
      { codigo: 'produto.cadastrar', descricao: 'Cadastrar um novo produto' },
      { codigo: 'produto.listar', descricao: 'Listar todos os produtos' },
      { codigo: 'produto.visualizar', descricao: 'Visualizar os dados do produto' },
      { codigo: 'produto.alterar', descricao: 'Alterar os dados de um produto' },
    ],
  },
  {
    titulo: 'Certificados',
    permissoes: [
      { codigo: 'certificado.listar', descricao: 'Listar os certificados' },
      { codigo: 'certificado.cadastrar', descricao: 'Cadastrar um novo certificado' },
      { codigo: 'certificado.excluir', descricao: 'Excluir um certificado' },
    ],
  },
  {
    titulo: 'Transmissão',
    permissoes: [
      { codigo: 'transmissao.catalogo', descricao: 'Transmitir um catálogo para o PUCOMEX' },
      { codigo: 'transmissao.catalogo.sincronizar', descricao: 'Sincronizar um catálogo já transmitido ao PUCOMEX' },
      { codigo: 'transmissao.produto.sincronizar', descricao: 'Sincronizar um produto já transmitido ao PUCOMEX' },
    ],
  },
  {
    titulo: 'Importação',
    permissoes: [
      { codigo: 'importacao.pucomex', descricao: 'Importar produtos do PUCOMEX' },
      { codigo: 'importacao.tecalert', descricao: 'Importar produtos do TecAlert' },
      { codigo: 'importacao.arquivo', descricao: 'Importar produtos do arquivo (Excel, Json, CSV e etc.)' },
    ],
  },
  {
    titulo: 'Notificações',
    permissoes: [
      { codigo: 'notificacao.visualizar', descricao: 'Visualizar notificações' },
    ],
  },
];
