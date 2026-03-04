export type OperacaoDelta = 'add' | 'remove' | 'replace';

export interface MudancaDelta {
  path: string;
  op: OperacaoDelta;
  before?: unknown;
  after?: unknown;
  label?: string;
}

export interface DeltaHistoricoProduto {
  schemaVersion: number;
  changes: MudancaDelta[];
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizarEscalar(value: unknown): unknown {
  if (value === '') return null;
  if (value instanceof Date) return value.toISOString();
  return value;
}

export function normalizarProdutoParaHistorico<T>(input: T): T {
  const normalizar = (value: unknown): unknown => {
    if (Array.isArray(value)) {
      const items = value.map(item => normalizar(item));
      const todosEscalares = items.every(item => !isObject(item) && !Array.isArray(item));
      if (todosEscalares) {
        return [...items].sort((a, b) => String(a).localeCompare(String(b)));
      }
      return items;
    }

    if (isObject(value)) {
      const keys = Object.keys(value).sort();
      return keys.reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = normalizar(value[key]);
        return acc;
      }, {});
    }

    return normalizarEscalar(value);
  };

  return normalizar(input) as T;
}

function labelPorPath(path: string) {
  const labels: Record<string, string> = {
    codigo: 'Código',
    versao: 'Versão',
    denominacao: 'Denominação',
    descricao: 'Descrição',
    modalidade: 'Modalidade',
    ncmCodigo: 'NCM',
    codigosInternos: 'Códigos internos',
    operadoresEstrangeiros: 'Operadores estrangeiros',
    valoresAtributos: 'Atributos dinâmicos'
  };

  const chave = path.split('.')[0] || path;
  return labels[chave] || path;
}

function diffRecursivo(
  anterior: unknown,
  atual: unknown,
  pathAtual: string,
  changes: MudancaDelta[]
) {
  if (JSON.stringify(anterior) === JSON.stringify(atual)) {
    return;
  }

  if (Array.isArray(anterior) || Array.isArray(atual)) {
    changes.push({
      path: pathAtual,
      op: anterior === undefined ? 'add' : atual === undefined ? 'remove' : 'replace',
      before: anterior,
      after: atual,
      label: labelPorPath(pathAtual)
    });
    return;
  }

  if (isObject(anterior) && isObject(atual)) {
    const keys = new Set([...Object.keys(anterior), ...Object.keys(atual)]);
    for (const key of Array.from(keys).sort()) {
      const proxPath = pathAtual ? `${pathAtual}.${key}` : key;
      diffRecursivo(anterior[key], atual[key], proxPath, changes);
    }
    return;
  }

  changes.push({
    path: pathAtual,
    op: anterior === undefined ? 'add' : atual === undefined ? 'remove' : 'replace',
    before: anterior,
    after: atual,
    label: labelPorPath(pathAtual)
  });
}

export function gerarDeltaHistoricoProduto(anterior: unknown, atual: unknown): DeltaHistoricoProduto {
  const changes: MudancaDelta[] = [];
  diffRecursivo(anterior, atual, '', changes);

  return {
    schemaVersion: 1,
    changes: changes.filter(change => change.path)
  };
}

export function gerarResumoDelta(delta: DeltaHistoricoProduto, versaoSiscomex: number) {
  if (!delta.changes.length) {
    return `Versão ${versaoSiscomex} sem alterações de conteúdo.`;
  }

  if (versaoSiscomex <= 1) {
    return 'Produto criado no SISCOMEX.';
  }

  return `${delta.changes.length} alteração(ões) na versão ${versaoSiscomex}.`;
}
