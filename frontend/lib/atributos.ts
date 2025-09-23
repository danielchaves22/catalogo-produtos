// frontend/lib/atributos.ts
export type ValorDinamico = string | number | (string | number)[] | null | undefined;

function flattenValores(valor: ValorDinamico): string[] {
  if (Array.isArray(valor)) {
    return valor.reduce<string[]>(
      (acc, item) => acc.concat(flattenValores(item as ValorDinamico)),
      []
    );
  }
  if (valor === undefined || valor === null) return [];
  const texto = String(valor);
  return texto.trim() === '' ? [] : [texto];
}

export function isValorPreenchido(valor: ValorDinamico): boolean {
  return flattenValores(valor).length > 0;
}

export function normalizarValoresMultivalorados(valor: ValorDinamico): string[] {
  return flattenValores(valor);
}

export function avaliarExpressao(cond: any, valor: string): boolean {
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
    const next = avaliarExpressao(cond.condicao, valor);
    return cond.composicao === '||' ? ok || next : ok && next;
  }
  return ok;
}

export function algumValorSatisfazCondicao(cond: any, valor: ValorDinamico): boolean {
  if (!cond) return true;
  const valores = flattenValores(valor);
  if (valores.length === 0) return false;
  return valores.some(v => avaliarExpressao(cond, v));
}

export function algumValorIgual(valor: ValorDinamico, esperado: string): boolean {
  if (!esperado) return false;
  const valores = flattenValores(valor);
  if (valores.length === 0) return false;
  return valores.some(v => v === esperado);
}
