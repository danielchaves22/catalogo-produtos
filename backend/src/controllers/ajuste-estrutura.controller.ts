// backend/src/controllers/ajuste-estrutura.controller.ts
import { Request, Response } from 'express';
import { AjusteEstruturaService } from '../services/ajuste-estrutura.service';
import { logger } from '../utils/logger';

const ajusteEstruturaService = new AjusteEstruturaService();

/**
 * Conta produtos que necessitam ajuste de estrutura
 * GET /api/ajuste-estrutura/contar
 */
export async function contarProdutosComAjuste(req: Request, res: Response) {
  try {
    const superUserId = req.user!.superUserId;
    const count = await ajusteEstruturaService.contarProdutosComAjuste(superUserId);

    return res.json({ count });
  } catch (error) {
    logger.error('Erro ao contar produtos com ajuste', error);
    return res.status(500).json({
      error: 'Erro ao contar produtos que necessitam ajuste'
    });
  }
}

/**
 * Lista NCMs divergentes dos produtos do usuário
 * GET /api/ajuste-estrutura/ncms-divergentes
 */
export async function listarNcmsDivergentes(req: Request, res: Response) {
  try {
    const superUserId = req.user!.superUserId;
    const ncms = await ajusteEstruturaService.listarNcmsDivergentes(superUserId);

    return res.json({ ncms });
  } catch (error) {
    logger.error('Erro ao listar NCMs divergentes', error);
    return res.status(500).json({
      error: 'Erro ao listar NCMs divergentes'
    });
  }
}

/**
 * Ajusta estrutura de um produto individual
 * POST /api/ajuste-estrutura/produto/:id
 */
export async function ajustarEstruturaProduto(req: Request, res: Response) {
  try {
    const superUserId = req.user!.superUserId;
    const produtoId = parseInt(req.params.id);

    if (isNaN(produtoId)) {
      return res.status(400).json({ error: 'ID de produto inválido' });
    }

    const resultado = await ajusteEstruturaService.ajustarEstruturaProduto(
      produtoId,
      superUserId
    );

    return res.json(resultado);
  } catch (error: any) {
    logger.error('Erro ao ajustar estrutura do produto', error);
    return res.status(500).json({
      error: error.message || 'Erro ao ajustar estrutura do produto'
    });
  }
}

/**
 * Ajusta estrutura de produtos em lote
 * POST /api/ajuste-estrutura/lote
 * Body: { produtoIds: number[] }
 */
export async function ajustarEstruturaLote(req: Request, res: Response) {
  try {
    const superUserId = req.user!.superUserId;
    const { produtoIds } = req.body;

    if (!Array.isArray(produtoIds) || produtoIds.length === 0) {
      return res.status(400).json({
        error: 'Lista de IDs de produtos é obrigatória'
      });
    }

    const resultado = await ajusteEstruturaService.ajustarEstruturaLote(
      produtoIds,
      superUserId
    );

    return res.json(resultado);
  } catch (error) {
    logger.error('Erro ao ajustar estrutura em lote', error);
    return res.status(500).json({
      error: 'Erro ao ajustar estrutura em lote'
    });
  }
}

/**
 * [ADMIN] Marca produtos de uma NCM para ajuste de estrutura
 * POST /api/admin/ajuste-estrutura/marcar
 * Body: { ncmCodigo: string, modalidade: string }
 */
export async function marcarProdutosParaAjuste(req: Request, res: Response) {
  try {
    // Verificar se é admin
    const isAdmin = req.user?.role === 'ADMIN' || req.user?.role === 'SUPER';
    if (!isAdmin) {
      return res.status(403).json({ error: 'Acesso restrito a administradores' });
    }

    const { ncmCodigo, modalidade } = req.body;

    if (!ncmCodigo || !modalidade) {
      return res.status(400).json({
        error: 'NCM e modalidade são obrigatórios'
      });
    }

    const count = await ajusteEstruturaService.marcarProdutosParaAjuste(
      ncmCodigo,
      modalidade
    );

    return res.json({
      success: true,
      produtosMarcados: count,
      ncmCodigo,
      modalidade
    });
  } catch (error) {
    logger.error('Erro ao marcar produtos para ajuste', error);
    return res.status(500).json({
      error: 'Erro ao marcar produtos para ajuste'
    });
  }
}

/**
 * [ADMIN] Marca produtos de múltiplas NCMs para ajuste de estrutura
 * POST /api/admin/ajuste-estrutura/marcar-multiplas
 * Body: { ncms: Array<{ ncmCodigo: string, modalidade: string }> }
 */
export async function marcarMultiplasNCMsParaAjuste(req: Request, res: Response) {
  try {
    // Verificar se é admin
    const isAdmin = req.user?.role === 'ADMIN' || req.user?.role === 'SUPER';
    if (!isAdmin) {
      return res.status(403).json({ error: 'Acesso restrito a administradores' });
    }

    const { ncms } = req.body;

    if (!Array.isArray(ncms) || ncms.length === 0) {
      return res.status(400).json({
        error: 'Lista de NCMs é obrigatória'
      });
    }

    const resultados = [];
    let totalMarcados = 0;

    for (const { ncmCodigo, modalidade } of ncms) {
      try {
        const count = await ajusteEstruturaService.marcarProdutosParaAjuste(
          ncmCodigo,
          modalidade
        );
        resultados.push({
          ncmCodigo,
          modalidade,
          produtosMarcados: count,
          sucesso: true
        });
        totalMarcados += count;
      } catch (error: any) {
        resultados.push({
          ncmCodigo,
          modalidade,
          produtosMarcados: 0,
          sucesso: false,
          erro: error.message
        });
      }
    }

    return res.json({
      success: true,
      totalMarcados,
      resultados
    });
  } catch (error) {
    logger.error('Erro ao marcar múltiplas NCMs para ajuste', error);
    return res.status(500).json({
      error: 'Erro ao marcar múltiplas NCMs para ajuste'
    });
  }
}
