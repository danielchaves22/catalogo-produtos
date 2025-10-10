import { Prisma } from '@prisma/client';
import { catalogoPrisma } from '../utils/prisma';
import { AtributoEstruturaDTO } from './atributo-legacy.service';

const PRODUTO_STATUS = ['PENDENTE', 'APROVADO', 'PROCESSANDO', 'TRANSMITIDO', 'ERRO'] as const;

type ProdutoStatus = (typeof PRODUTO_STATUS)[number];

type StatusContagem = {
  status: ProdutoStatus;
  total: number;
};

export interface ResumoDashboard {
  catalogos: {
    total: number;
    porStatus: StatusContagem[];
  };
  produtos: {
    total: number;
    porStatus: StatusContagem[];
  };
  atributos: {
    total: number;
    obrigatoriosPendentes: number;
    validosTransmissao: number;
  };
}

function createStatusMap(): Record<ProdutoStatus, number> {
  return PRODUTO_STATUS.reduce((acc, status) => {
    acc[status] = 0;
    return acc;
  }, {} as Record<ProdutoStatus, number>);
}

function mapResultadosParaLista(valores: Record<ProdutoStatus, number>): StatusContagem[] {
  return PRODUTO_STATUS.map(status => ({ status, total: valores[status] ?? 0 }));
}

function buildCatalogoWhere(superUserId: number, catalogoId?: number) {
  const clauses: Prisma.Sql[] = [Prisma.sql`c.super_user_id = ${superUserId}`];
  if (catalogoId) {
    clauses.push(Prisma.sql`c.id = ${catalogoId}`);
  }
  return combinarClausulas(clauses);
}

function buildProdutoWhere(superUserId: number, catalogoId?: number) {
  const clauses: Prisma.Sql[] = [Prisma.sql`c.super_user_id = ${superUserId}`];
  if (catalogoId) {
    clauses.push(Prisma.sql`p.catalogo_id = ${catalogoId}`);
  }
  return combinarClausulas(clauses);
}

function combinarClausulas(clauses: Prisma.Sql[]): Prisma.Sql {
  return clauses.slice(1).reduce<Prisma.Sql>((acc, clause) => Prisma.sql`${acc} AND ${clause}`, clauses[0]);
}

export async function obterResumoDashboardService(
  superUserId: number,
  catalogoId?: number
): Promise<ResumoDashboard> {
  const catalogoWhere = { superUserId, ...(catalogoId ? { id: catalogoId } : {}) };
  const produtoWhere = { catalogo: { superUserId }, ...(catalogoId ? { catalogoId } : {}) };

  const [totalCatalogos, totalProdutos] = await Promise.all([
    catalogoPrisma.catalogo.count({ where: catalogoWhere }),
    catalogoPrisma.produto.count({ where: produtoWhere })
  ]);

  const produtoWhereSql = buildProdutoWhere(superUserId, catalogoId);

  const produtosPorStatusRaw = await catalogoPrisma.$queryRaw<Array<{ status: string | null; total: bigint }>>(Prisma.sql`
    SELECT p.status AS status, COUNT(*) AS total
    FROM produto p
      INNER JOIN catalogo c ON c.id = p.catalogo_id
    WHERE ${produtoWhereSql}
    GROUP BY p.status
  `);

  const produtosStatusMap = createStatusMap();
  for (const item of produtosPorStatusRaw) {
    if (!item.status) continue;
    if ((PRODUTO_STATUS as readonly string[]).includes(item.status)) {
      produtosStatusMap[item.status as ProdutoStatus] = Number(item.total);
    }
  }

  const catalogoWhereSql = buildCatalogoWhere(superUserId, catalogoId);

  const catalogosPorStatusRaw = await catalogoPrisma.$queryRaw<Array<{ status: string; total: bigint }>>(Prisma.sql`
    SELECT status, COUNT(*) AS total
    FROM (
      SELECT
        CASE
          WHEN resumo.nao_transmitidos = 0 AND resumo.transmitidos > 0 AND resumo.total_produtos > 0 THEN 'TRANSMITIDO'
          WHEN resumo.erros > 0 THEN 'ERRO'
          WHEN resumo.pendentes > 0 THEN 'PENDENTE'
          WHEN resumo.aprovados > 0 THEN 'APROVADO'
          WHEN resumo.processando > 0 THEN 'PROCESSANDO'
          WHEN resumo.transmitidos > 0 THEN 'TRANSMITIDO'
          ELSE 'PENDENTE'
        END AS status
      FROM (
        SELECT
          c.id,
          COALESCE(SUM(CASE WHEN p.status IS NOT NULL THEN 1 ELSE 0 END), 0) AS total_produtos,
          COALESCE(SUM(CASE WHEN p.status = 'ERRO' THEN 1 ELSE 0 END), 0) AS erros,
          COALESCE(SUM(CASE WHEN p.status = 'PENDENTE' THEN 1 ELSE 0 END), 0) AS pendentes,
          COALESCE(SUM(CASE WHEN p.status = 'APROVADO' THEN 1 ELSE 0 END), 0) AS aprovados,
          COALESCE(SUM(CASE WHEN p.status = 'PROCESSANDO' THEN 1 ELSE 0 END), 0) AS processando,
          COALESCE(SUM(CASE WHEN p.status = 'TRANSMITIDO' THEN 1 ELSE 0 END), 0) AS transmitidos,
          COALESCE(SUM(CASE WHEN p.status IS NOT NULL AND p.status <> 'TRANSMITIDO' THEN 1 ELSE 0 END), 0) AS nao_transmitidos
        FROM catalogo c
          LEFT JOIN produto p ON p.catalogo_id = c.id
        WHERE ${catalogoWhereSql}
        GROUP BY c.id
      ) AS resumo
    ) AS status_por_catalogo
    GROUP BY status
  `);

  const catalogosStatusMap = createStatusMap();
  for (const item of catalogosPorStatusRaw) {
    if ((PRODUTO_STATUS as readonly string[]).includes(item.status)) {
      catalogosStatusMap[item.status as ProdutoStatus] = Number(item.total);
    }
  }

  const atributosRegistros = await catalogoPrisma.produtoAtributos.findMany({
    where: { produto: produtoWhere },
    select: {
      valoresJson: true,
      estruturaSnapshotJson: true
    }
  });

  let atributosTotal = 0;
  let obrigatoriosPendentes = 0;

  for (const registro of atributosRegistros) {
    const valores = toRecord(registro.valoresJson);
    const estruturaLista = flattenEstrutura(toEstruturaList(registro.estruturaSnapshotJson));

    if (!estruturaLista.length) {
      atributosTotal += Object.keys(valores).length;
      continue;
    }

    const mapa = new Map<string, AtributoEstruturaDTO>();
    for (const attr of estruturaLista) {
      mapa.set(attr.codigo, attr);
    }

    const visitados = new Set<string>();
    for (const attr of estruturaLista) {
      if (visitados.has(attr.codigo)) continue;
      visitados.add(attr.codigo);
      if (attr.tipo === 'COMPOSTO') continue;
      if (!condicaoAtendida(attr, valores, mapa)) continue;
      atributosTotal += 1;
      if (attr.obrigatorio && !valorPreenchido(valores[attr.codigo])) {
        obrigatoriosPendentes += 1;
      }
    }
  }

  const validosTransmissao = Math.max(atributosTotal - obrigatoriosPendentes, 0);

  return {
    catalogos: {
      total: totalCatalogos,
      porStatus: mapResultadosParaLista(catalogosStatusMap)
    },
    produtos: {
      total: totalProdutos,
      porStatus: mapResultadosParaLista(produtosStatusMap)
    },
    atributos: {
      total: atributosTotal,
      obrigatoriosPendentes,
      validosTransmissao
    }
  };
}

function flattenEstrutura(estrutura: AtributoEstruturaDTO[] | undefined): AtributoEstruturaDTO[] {
  if (!estrutura) return [];
  const resultado: AtributoEstruturaDTO[] = [];
  const stack = [...estrutura];
  while (stack.length) {
    const atual = stack.shift();
    if (!atual) continue;
    resultado.push(atual);
    if (atual.subAtributos && atual.subAtributos.length) {
      stack.unshift(...atual.subAtributos);
    }
  }
  return resultado;
}

function avaliarExpressao(cond: any, valor: string): boolean {
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

function condicaoAtendida(
  attr: AtributoEstruturaDTO,
  valores: Record<string, any>,
  mapa: Map<string, AtributoEstruturaDTO>
): boolean {
  const codigoCondicionante = attr.condicionanteCodigo || attr.parentCodigo;
  if (!codigoCondicionante) return true;

  const pai = mapa.get(codigoCondicionante);
  if (pai && !condicaoAtendida(pai, valores, mapa)) return false;

  const atual = valores[codigoCondicionante];
  if (atual === undefined || atual === null || atual === '') return false;
  const atualStr = String(atual);
  if (attr.condicao) return avaliarExpressao(attr.condicao, atualStr);
  if (!attr.descricaoCondicao) return true;
  const match = attr.descricaoCondicao.match(/valor\s*=\s*'?"?(\w+)"?'?/i);
  if (!match) return true;
  return atualStr === match[1];
}

function valorPreenchido(valor: unknown): boolean {
  if (valor === undefined || valor === null) return false;
  if (Array.isArray(valor)) {
    return valor.some(item => valorPreenchido(item));
  }
  if (typeof valor === 'string') {
    return valor.trim().length > 0;
  }
  return true;
}

function toRecord(value: unknown): Record<string, any> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, any>;
}

function toEstruturaList(value: unknown): AtributoEstruturaDTO[] {
  if (!value) return [];
  if (Array.isArray(value)) return value as AtributoEstruturaDTO[];
  if (typeof value === 'object') return [value as AtributoEstruturaDTO];
  return [];
}
