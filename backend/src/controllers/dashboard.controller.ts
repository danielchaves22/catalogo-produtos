import { Request, Response } from 'express';
import { obterResumoDashboardService } from '../services/dashboard.service';
import { logger } from '../utils/logger';

export async function obterResumoDashboard(req: Request, res: Response) {
  try {
    const superUserId = req.user!.superUserId;
    const headerCatalogId = req.headers['x-catalogo-trabalho'];
    const queryCatalogId = req.query.catalogoId as string | undefined;
    const catalogoIdRaw = queryCatalogId
      ? Number(queryCatalogId)
      : (typeof headerCatalogId === 'string' ? Number(headerCatalogId) : undefined);
    const catalogoId = catalogoIdRaw && !Number.isNaN(catalogoIdRaw) ? catalogoIdRaw : undefined;

    const resumo = await obterResumoDashboardService(superUserId, catalogoId);

    return res.json(resumo);
  } catch (error) {
    logger.error('Erro ao obter resumo do painel', error);
    return res.status(500).json({
      error: 'Erro ao obter resumo do painel'
    });
  }
}
