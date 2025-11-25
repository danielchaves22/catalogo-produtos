export type ModalidadeTransmissao = 'PRODUTOS' | 'OPERADORES_ESTRANGEIROS';

export interface TransmissaoSiscomexItem {
  id: number;
  referencia: string;
  status: 'PENDENTE' | 'PROCESSANDO' | 'TRANSMITIDO' | 'ERRO';
  mensagem?: string;
}

export interface TransmissaoSiscomex {
  id: number;
  titulo: string;
  modalidade: ModalidadeTransmissao;
  catalogo: {
    nome: string;
    numero: number;
  };
  quantidadeTotal: number;
  concluidoEm?: string;
  iniciadoEm: string;
  status: 'EM_ANDAMENTO' | 'CONCLUIDO' | 'ERRO';
  resultado?: 'SUCESSO' | 'PARCIAL' | 'ERRO';
  itens: TransmissaoSiscomexItem[];
}

export const transmissoesSiscomexMock: TransmissaoSiscomex[] = [
  {
    id: 101,
    titulo: 'Transmissão de Produtos 18/06',
    modalidade: 'PRODUTOS',
    catalogo: { nome: 'Catálogo Global', numero: 12345 },
    quantidadeTotal: 3,
    iniciadoEm: new Date().toISOString(),
    concluidoEm: new Date().toISOString(),
    status: 'CONCLUIDO',
    resultado: 'SUCESSO',
    itens: [
      { id: 1, referencia: 'SKU-1001', status: 'TRANSMITIDO' },
      { id: 2, referencia: 'SKU-1002', status: 'TRANSMITIDO' },
      { id: 3, referencia: 'SKU-1003', status: 'TRANSMITIDO' },
    ],
  },
  {
    id: 202,
    titulo: 'Operadores - rodada semanal',
    modalidade: 'OPERADORES_ESTRANGEIROS',
    catalogo: { nome: 'Catálogo Global', numero: 12345 },
    quantidadeTotal: 2,
    iniciadoEm: new Date().toISOString(),
    status: 'EM_ANDAMENTO',
    itens: [
      { id: 201, referencia: 'Operador TIN-981', status: 'PROCESSANDO' },
      {
        id: 202,
        referencia: 'Operador TIN-982',
        status: 'ERRO',
        mensagem: 'Documento fiscal incompleto para exportação de teste.',
      },
    ],
  },
];
