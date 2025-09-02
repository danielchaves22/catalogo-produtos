import { Request, Response } from 'express';
import { catalogoPrisma } from '../utils/prisma';

export async function obterResumoDashboard(req: Request, res: Response) {
  try {
    const superUserId = req.user!.superUserId;
    const headerCatalogId = req.headers['x-catalogo-trabalho'];
    const queryCatalogId = req.query.catalogoId as string | undefined;
    const catalogoId = queryCatalogId
      ? Number(queryCatalogId)
      : (typeof headerCatalogId === 'string' ? Number(headerCatalogId) : undefined);

    // Garantir filtro por superUser sempre
    const catalogoWhere: any = { superUserId };
    if (catalogoId && !Number.isNaN(catalogoId)) {
      catalogoWhere.id = catalogoId;
    }

    const totalCatalogos = await catalogoPrisma.catalogo.count({ where: catalogoWhere });

    // Filtros de produto por relação com catálogo do usuário e opcionalmente por catálogo específico
    const produtoWhere: any = { catalogo: { superUserId } };
    if (catalogoId && !Number.isNaN(catalogoId)) {
      produtoWhere.catalogoId = catalogoId;
    }

    const totalProdutos = await catalogoPrisma.produto.count({ where: produtoWhere });

    const porStatusRaw = await catalogoPrisma.produto.groupBy({
      by: ['status'],
      _count: { status: true },
      where: produtoWhere
    });

    const porStatus: Record<string, number> = {};
    for (const item of porStatusRaw) {
      porStatus[item.status] = item._count.status;
    }

    return res.json({
      catalogos: { total: totalCatalogos },
      produtos: { total: totalProdutos, porStatus }
    });
  } catch (error) {
    return res.status(500).json({
      error: 'Erro ao obter resumo do painel'
    });
  }
}
