import { Request, Response } from 'express';
import { catalogoPrisma } from '../utils/prisma';

export async function obterResumoDashboard(req: Request, res: Response) {
  try {
    const totalCatalogos = await catalogoPrisma.catalogo.count();
    const totalProdutos = await catalogoPrisma.produto.count();

    const porStatusRaw = await catalogoPrisma.produto.groupBy({
      by: ['status'],
      _count: { status: true }
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
