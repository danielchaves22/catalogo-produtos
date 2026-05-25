import { logger } from './logger';

interface ProdutoAtributoNormalizavel {
  id?: number;
  atributoVersaoId?: number | null;
  atributo?: {
    codigo?: string | null;
  } | null;
}

interface NormalizacaoAtributosProdutoOpcoes {
  produtoId?: number;
  versaoAtributoId?: number | null;
  origem?: string;
}

export function normalizarAtributosProdutoPorVersao<T extends ProdutoAtributoNormalizavel>(
  registros: T[],
  opcoes: NormalizacaoAtributosProdutoOpcoes = {}
): T[] {
  const agrupados = new Map<string, T[]>();

  for (const registro of registros) {
    const codigo = registro.atributo?.codigo;
    if (!codigo) {
      continue;
    }

    const grupo = agrupados.get(codigo) ?? [];
    grupo.push(registro);
    agrupados.set(codigo, grupo);
  }

  const normalizados: T[] = [];

  for (const [codigo, grupo] of agrupados.entries()) {
    const daVersaoAtiva =
      opcoes.versaoAtributoId !== null && opcoes.versaoAtributoId !== undefined
        ? grupo.filter(registro => registro.atributoVersaoId === opcoes.versaoAtributoId)
        : [];

    if (daVersaoAtiva.length > 0) {
      normalizados.push(selecionarRegistroMaisRecente(daVersaoAtiva));
      continue;
    }

    const selecionado = selecionarRegistroMaisRecente(grupo);

    if (grupo.length > 1) {
      logger.warn('Duplicidade de atributo no produto sem correspondencia com a versao ativa', {
        produtoId: opcoes.produtoId ?? null,
        origem: opcoes.origem ?? 'desconhecida',
        codigo,
        versaoAtributoAtiva: opcoes.versaoAtributoId ?? null,
        versoesEncontradas: Array.from(
          new Set(grupo.map(registro => registro.atributoVersaoId ?? null))
        ),
        versaoSelecionada: selecionado.atributoVersaoId ?? null,
      });
    }

    normalizados.push(selecionado);
  }

  return normalizados;
}

function selecionarRegistroMaisRecente<T extends ProdutoAtributoNormalizavel>(grupo: T[]): T {
  return grupo.reduce((melhor, atual) => {
    const versaoMelhor = melhor.atributoVersaoId ?? Number.NEGATIVE_INFINITY;
    const versaoAtual = atual.atributoVersaoId ?? Number.NEGATIVE_INFINITY;

    if (versaoAtual > versaoMelhor) {
      return atual;
    }

    if (versaoAtual < versaoMelhor) {
      return melhor;
    }

    const idMelhor = typeof melhor.id === 'number' ? melhor.id : Number.NEGATIVE_INFINITY;
    const idAtual = typeof atual.id === 'number' ? atual.id : Number.NEGATIVE_INFINITY;

    return idAtual > idMelhor ? atual : melhor;
  });
}
