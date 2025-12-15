export interface LegendItem {
  label: string;
  description: string;
  badgeClass: string;
}

const chipBase = 'inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wide';

const chip = (base: string) => `${chipBase} ${base}`;

export const produtoSituacaoLegend: LegendItem[] = [
  {
    label: 'Rascunho',
    description: 'Produto em edição, ainda não transmitido ao PUCOMEX (sem versão).',
    badgeClass: chip('bg-[#e4a8351a] text-[#e4a835] border-[#e4a835]'),
  },
  {
    label: 'Ativado',
    description: 'Transmitido ao PUCOMEX e com versão ativa.',
    badgeClass: chip('bg-[#27f58a1a] text-[#27f58a] border-[#27f58a]'),
  },
  {
    label: 'Desativado',
    description: 'Desativado no PUCOMEX (catálogo excluído).',
    badgeClass: chip('bg-[#f2545f1a] text-[#f2545f] border-[#f2545f]'),
  },
];

export const produtoStatusLegend: LegendItem[] = [
  {
    label: 'Ajustar Estrutura',
    description: 'ESTRUTURA DE ATRIBUTOS DIVERGENTE DO SISCOMEX. NECESSITA AJUSTE.',
    badgeClass: chip('bg-[#dc26261a] text-[#dc2626] border-[#dc2626]'),
  },
  {
    label: 'Pendente',
    description: 'Pendente de algum campo obrigatório.',
    badgeClass: chip('bg-[#e4a8351a] text-[#e4a835] border-[#e4a835]'),
  },
  {
    label: 'Aprovado',
    description: 'Editado e ainda não retransmitido após modificação.',
    badgeClass: chip('bg-[#27f58a1a] text-[#27f58a] border-[#27f58a]'),
  },
  {
    label: 'Processando',
    description: 'Em fila de transmissão ao PUCOMEX.',
    badgeClass: chip('bg-[#4c82d31a] text-[#4c82d3] border-[#4c82d3]'),
  },
  {
    label: 'Transmitido',
    description: 'Transmitido com sucesso ao PUCOMEX.',
    badgeClass: chip('bg-[#5e17eb1a] text-[#5e17eb] border-[#5e17eb]'),
  },
  {
    label: 'Erro',
    description: 'Erro ao transmitir; ver detalhes em "Logs".',
    badgeClass: chip('bg-[#ff57571a] text-[#ff5757] border-[#ff5757]'),
  },
];

export const operadorStatusLegend: LegendItem[] = [
  {
    label: 'Rascunho',
    description: 'Operador estrangeiro em edição, ainda não transmitido.',
    badgeClass: chip('bg-[#e4a8351a] text-[#e4a835] border-[#e4a835]'),
  },
  {
    label: 'Ativado',
    description: 'Operador transmitido e ativo no PUCOMEX.',
    badgeClass: chip('bg-[#27f58a1a] text-[#27f58a] border-[#27f58a]'),
  },
  {
    label: 'Desativado',
    description: 'Operador desativado no PUCOMEX.',
    badgeClass: chip('bg-[#f2545f1a] text-[#f2545f] border-[#f2545f]'),
  },
];
