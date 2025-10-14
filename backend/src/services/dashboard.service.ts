import { Prisma } from '@prisma/client';
import { catalogoPrisma } from '../utils/prisma';

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

  const resumoAtributos = await catalogoPrisma.produtoResumoDashboard.aggregate({
    _sum: {
      atributosTotal: true,
      obrigatoriosPendentes: true,
      validosTransmissao: true
    },
    where: {
      catalogo: { superUserId },
      ...(catalogoId ? { catalogoId } : {})
    }
  });

  const atributosTotal = Number(resumoAtributos._sum.atributosTotal ?? 0);
  const obrigatoriosPendentes = Number(resumoAtributos._sum.obrigatoriosPendentes ?? 0);
  const validosTransmissao = Number(resumoAtributos._sum.validosTransmissao ?? 0);

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
