export interface AtributoCondicional {
  codigo: string;
  tipo?: string | null;
  parentCodigo?: string | null;
  parentEhComposto?: boolean;
  condicionanteCodigo?: string | null;
  descricaoCondicao?: string | null;
  condicao?: unknown;
}

function valorEscalarPreenchido(valor: unknown): boolean {
  if (valor === undefined || valor === null) return false;
  if (typeof valor === 'string') return valor.trim() !== '';
  return true;
}

export function extrairValoresPreenchidos(valor: unknown): unknown[] {
  if (Array.isArray(valor)) {
    return valor.reduce<unknown[]>(
      (acc, item) => acc.concat(extrairValoresPreenchidos(item)),
      []
    );
  }

  return valorEscalarPreenchido(valor) ? [valor] : [];
}

export function valorPreenchidoAtributo(valor: unknown): boolean {
  return extrairValoresPreenchidos(valor).length > 0;
}

export function valoresComoArrayCondicional(valor: unknown): string[] {
  return extrairValoresPreenchidos(valor)
    .map(item => String(item).trim())
    .filter(Boolean);
}

export function avaliarExpressaoCondicional(cond: any, valor: string): boolean {
  if (!cond) return true;
  const esperado = cond.valor;
  let ok = true;

  switch (cond.operador) {
    case '==':
      ok = valor === esperado;
      break;
    case '!=':
      ok = valor !== esperado;
      break;
    case '>':
      ok = Number(valor) > Number(esperado);
      break;
    case '>=':
      ok = Number(valor) >= Number(esperado);
      break;
    case '<':
      ok = Number(valor) < Number(esperado);
      break;
    case '<=':
      ok = Number(valor) <= Number(esperado);
      break;
  }

  if (cond.condicao) {
    const next = avaliarExpressaoCondicional(cond.condicao, valor);
    return cond.composicao === '||' ? ok || next : ok && next;
  }

  return ok;
}

function extrairValorEsperadoDescricaoCondicao(descricaoCondicao?: string | null): string | null {
  if (!descricaoCondicao) return null;
  const match = descricaoCondicao.match(/valor\s*=\s*'?"?(\w+)"?'?/i);
  return match?.[1] ?? null;
}

function condicaoAtributoAtendidaInterna<T extends AtributoCondicional>(
  attr: T,
  valores: Record<string, unknown>,
  mapa: Map<string, T>,
  pilha: Set<string>
): boolean {
  const parentEhComposto = Boolean(attr.parentEhComposto);
  const codigoCondicionante =
    attr.condicionanteCodigo || (parentEhComposto ? null : attr.parentCodigo);

  if (!codigoCondicionante) return true;

  if (pilha.has(attr.codigo)) return true;
  pilha.add(attr.codigo);

  const pai = mapa.get(codigoCondicionante);
  if (pai && !condicaoAtributoAtendidaInterna(pai, valores, mapa, pilha)) return false;

  const valoresCondicionante = valoresComoArrayCondicional(valores[codigoCondicionante]);
  if (valoresCondicionante.length === 0) return false;

  if (attr.condicao) {
    return valoresCondicionante.some(valor => avaliarExpressaoCondicional(attr.condicao, valor));
  }

  const esperado = extrairValorEsperadoDescricaoCondicao(attr.descricaoCondicao);
  if (!esperado) return true;

  return valoresCondicionante.some(valor => valor === esperado);
}

export function condicaoAtributoAtendida<T extends AtributoCondicional>(
  attr: T,
  valores: Record<string, unknown>,
  mapa: Map<string, T>
): boolean {
  return condicaoAtributoAtendidaInterna(attr, valores, mapa, new Set<string>());
}

export function filtrarValoresAtributosVisiveis<T extends AtributoCondicional>(
  valoresEntrada: Record<string, unknown>,
  mapa: Map<string, T>
): Record<string, unknown> {
  const resultado: Record<string, unknown> = {};

  for (const [codigo, valor] of Object.entries(valoresEntrada)) {
    const atributo = mapa.get(codigo);
    if (!atributo) continue;
    if (!condicaoAtributoAtendida(atributo, valoresEntrada, mapa)) continue;

    if (Array.isArray(valor)) {
      const preenchidos = extrairValoresPreenchidos(valor);
      if (!preenchidos.length) continue;
      resultado[codigo] = preenchidos;
      continue;
    }

    if (!valorPreenchidoAtributo(valor)) continue;
    resultado[codigo] = valor;
  }

  return resultado;
}
