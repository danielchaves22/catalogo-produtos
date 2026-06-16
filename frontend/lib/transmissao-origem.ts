export type TransmissaoOrigemTipo = 'MANUAL' | 'AJUSTE_ESTRUTURA';

export interface TransmissaoOrigemContexto {
  ncmCodigo?: string;
  modalidade?: string;
  catalogoId?: number;
  produtoIdsElegiveis?: number[];
  produtoIdsIgnoradosDuplicidade?: number[];
}

export function ehOrigemAjusteEstrutura(origemTipo?: TransmissaoOrigemTipo | null) {
  return origemTipo === 'AJUSTE_ESTRUTURA';
}

export function obterRotuloOrigemTransmissao(origemTipo?: TransmissaoOrigemTipo | null) {
  return ehOrigemAjusteEstrutura(origemTipo) ? 'Gerada por ajuste de estrutura' : 'Manual';
}

export function obterResumoOrigemTransmissao(
  origemTipo?: TransmissaoOrigemTipo | null,
  origemContexto?: TransmissaoOrigemContexto | null
) {
  if (!ehOrigemAjusteEstrutura(origemTipo)) {
    return null;
  }

  const partes = ['Gerada por ajuste de estrutura'];
  const ncmCodigo = origemContexto?.ncmCodigo?.trim();
  const modalidade = origemContexto?.modalidade?.trim();

  if (ncmCodigo) {
    partes.push(`NCM ${ncmCodigo}`);
  }

  if (modalidade) {
    partes.push(`Modalidade ${modalidade}`);
  }

  return partes.join(' · ');
}

export function obterDetalhesOrigemTransmissao(
  origemTipo?: TransmissaoOrigemTipo | null,
  origemContexto?: TransmissaoOrigemContexto | null
) {
  if (!ehOrigemAjusteEstrutura(origemTipo)) {
    return [];
  }

  const detalhes: string[] = [];
  const elegiveis = origemContexto?.produtoIdsElegiveis?.length ?? 0;
  const ignorados = origemContexto?.produtoIdsIgnoradosDuplicidade?.length ?? 0;
  const incluidos = Math.max(0, elegiveis - ignorados);

  if (elegiveis > 0) {
    detalhes.push(`${elegiveis} produto(s) elegível(is) ao final do ajuste`);
  }

  if (incluidos > 0) {
    detalhes.push(`${incluidos} produto(s) incluídos nesta pré-transmissão`);
  }

  if (ignorados > 0) {
    detalhes.push(`${ignorados} produto(s) já pendentes em outra pré-transmissão`);
  }

  return detalhes;
}
