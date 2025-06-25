export interface Dominio {
  codigo: string;
  descricao: string;
}

export type FormaPreenchimento =
  | 'LISTA_ESTATICA'
  | 'BOOLEANO'
  | 'TEXTO'
  | 'NUMERO_REAL'
  | 'NUMERO_INTEIRO';

export interface Atributo {
  codigo: string;
  nome: string;
  formaPreenchimento: FormaPreenchimento;
  obrigatorio?: boolean;
  dominio?: Dominio[];
}

export interface EstruturaNcm {
  ncm: string;
  atributos: Atributo[];
}

export const estruturasNcm: EstruturaNcm[] = [
  {
    ncm: '85171231',
    atributos: [
      {
        codigo: 'sistema_operacional',
        nome: 'Sistema Operacional',
        formaPreenchimento: 'LISTA_ESTATICA',
        obrigatorio: true,
        dominio: [
          { codigo: 'ANDROID', descricao: 'Android' },
          { codigo: 'IOS', descricao: 'iOS' },
          { codigo: 'OUTRO', descricao: 'Outro' }
        ]
      },
      {
        codigo: 'memoria_interna_gb',
        nome: 'Memoria Interna (GB)',
        formaPreenchimento: 'NUMERO_INTEIRO',
        obrigatorio: true
      },
      {
        codigo: 'suporta_5g',
        nome: 'Suporta 5G',
        formaPreenchimento: 'BOOLEANO'
      }
    ]
  },
  {
    ncm: '38089419',
    atributos: [
      {
        codigo: 'registro_anvisa',
        nome: 'Registro ANVISA',
        formaPreenchimento: 'TEXTO',
        obrigatorio: true
      },
      {
        codigo: 'ingrediente_ativo',
        nome: 'Ingrediente Ativo',
        formaPreenchimento: 'LISTA_ESTATICA',
        obrigatorio: true,
        dominio: [
          { codigo: 'I1', descricao: 'Ingrediente 1' },
          { codigo: 'I2', descricao: 'Ingrediente 2' }
        ]
      },
      {
        codigo: 'concentracao_percentual',
        nome: 'Concentracao %',
        formaPreenchimento: 'NUMERO_REAL'
      }
    ]
  }
];
