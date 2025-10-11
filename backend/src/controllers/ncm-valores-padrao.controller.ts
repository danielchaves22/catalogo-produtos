// backend/src/controllers/ncm-valores-padrao.controller.ts
import { Request, Response } from 'express';
import { NcmValoresPadraoService } from '../services/ncm-valores-padrao.service';
import { logger } from '../utils/logger';

const service = new NcmValoresPadraoService();

export async function listarValoresPadrao(req: Request, res: Response) {
  try {
    const registros = await service.listar(req.user!.superUserId);
    res.json(registros);
  } catch (error: any) {
    logger.error('Erro ao listar valores padrão de NCM', error);
    res.status(500).json({ error: 'Erro ao listar valores padrão de NCM' });
  }
}

export async function obterValorPadrao(req: Request, res: Response) {
  try {
    const id = Number(req.params.id);
    const registro = await service.buscarPorId(id, req.user!.superUserId);
    if (!registro) {
      return res.status(404).json({ error: 'Grupo de valores padrão não encontrado' });
    }
    res.json(registro);
  } catch (error: any) {
    logger.error('Erro ao buscar valor padrão de NCM', error);
    res.status(500).json({ error: 'Erro ao buscar valor padrão de NCM' });
  }
}

export async function buscarValorPadraoPorNcm(req: Request, res: Response) {
  try {
    const ncmCodigo = req.params.ncmCodigo;
    const modalidade = (req.query.modalidade as string | undefined) || undefined;
    const catalogoIdParam = req.query.catalogoId as string | undefined;
    const catalogoId = catalogoIdParam !== undefined ? Number(catalogoIdParam) : undefined;

    if (catalogoId === undefined || Number.isNaN(catalogoId)) {
      return res.status(400).json({ error: 'Informe um catálogo válido para consultar os valores padrão.' });
    }

    const registro = await service.buscarPorNcm(
      ncmCodigo,
      req.user!.superUserId,
      modalidade ?? null,
      catalogoId
    );
    if (!registro) {
      return res.status(404).json({ error: 'Valores padrão não encontrados para esta NCM e modalidade' });
    }
    res.json(registro);
  } catch (error: any) {
    logger.error('Erro ao buscar valores padrão por NCM', error);
    res.status(500).json({ error: 'Erro ao buscar valores padrão por NCM' });
  }
}

export async function criarValorPadrao(req: Request, res: Response) {
  try {
    const registro = await service.criar(
      {
        ncmCodigo: req.body.ncmCodigo,
        modalidade: req.body.modalidade,
        valoresAtributos: req.body.valoresAtributos,
        estruturaSnapshot: req.body.estruturaSnapshot,
        catalogoIds: req.body.catalogoIds
      },
      req.user!.superUserId,
      { nome: req.user!.name }
    );
    res.status(201).json(registro);
  } catch (error: any) {
    if (error.message?.includes('Já existe um valor padrão')) {
      return res.status(400).json({ error: error.message });
    }
    if (error.message?.includes('Informe ao menos um catálogo') || error.message?.includes('Catálogo inválido')) {
      return res.status(400).json({ error: error.message });
    }
    logger.error('Erro ao criar valor padrão de NCM', error);
    res.status(500).json({ error: 'Erro ao criar valor padrão de NCM' });
  }
}

export async function atualizarValorPadrao(req: Request, res: Response) {
  try {
    const id = Number(req.params.id);
    const registro = await service.atualizar(
      id,
      {
        ncmCodigo: req.body.ncmCodigo,
        modalidade: req.body.modalidade,
        valoresAtributos: req.body.valoresAtributos,
        estruturaSnapshot: req.body.estruturaSnapshot,
        catalogoIds: req.body.catalogoIds
      },
      req.user!.superUserId,
      { nome: req.user!.name }
    );
    res.json(registro);
  } catch (error: any) {
    if (error.message?.includes('não encontrado')) {
      return res.status(404).json({ error: error.message });
    }
    if (error.message?.includes('Já existe um valor padrão')) {
      return res.status(400).json({ error: error.message });
    }
    if (error.message?.includes('Informe ao menos um catálogo') || error.message?.includes('Catálogo inválido')) {
      return res.status(400).json({ error: error.message });
    }
    logger.error('Erro ao atualizar valor padrão de NCM', error);
    res.status(500).json({ error: 'Erro ao atualizar valor padrão de NCM' });
  }
}

export async function removerValorPadrao(req: Request, res: Response) {
  try {
    const id = Number(req.params.id);
    await service.remover(id, req.user!.superUserId);
    res.status(204).send();
  } catch (error: any) {
    if (error.message?.includes('não encontrado')) {
      return res.status(404).json({ error: error.message });
    }
    logger.error('Erro ao remover valor padrão de NCM', error);
    res.status(500).json({ error: 'Erro ao remover valor padrão de NCM' });
  }
}
