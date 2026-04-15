// backend/src/controllers/siscomex.controller.ts
import { Request, Response } from 'express';
import { AtributoLegacyService } from '../services/atributo-legacy.service';
import { NcmLegacyService } from '../services/ncm-legacy.service';
import { logger } from '../utils/logger';
import { catalogoPrisma } from '../utils/prisma';
import { ProdutoTransmissaoService } from '../services/produto-transmissao.service';
import { ValidationError } from '../types/validation-error';

const atributoLegacyService = new AtributoLegacyService();
const ncmLegacyService = new NcmLegacyService();
const produtoTransmissaoService = new ProdutoTransmissaoService();

/**
 * GET /api/siscomex/ncm/sugestoes
 * Lista sugestões de NCM filtrando por prefixo
 */
export async function listarSugestoesNcm(req: Request, res: Response) {
  try {
    const prefixo = ((req.query.prefixo as string) || '').trim();

    if (!prefixo) {
      return res.status(400).json({ error: 'Prefixo é obrigatório' });
    }

    if (!/^\d+$/.test(prefixo)) {
      return res.status(400).json({ error: 'Prefixo deve conter apenas números' });
    }

    if (prefixo.length < 4 || prefixo.length > 7) {
      return res.status(400).json({ error: 'Prefixo deve ter entre 4 e 7 dígitos' });
    }

    const sugestoes = await ncmLegacyService.buscarSugestoes(prefixo);

    return res.status(200).json({
      sucesso: true,
      total: sugestoes.length,
      dados: sugestoes,
    });
  } catch (error: unknown) {
    logger.error('Erro ao listar sugestões de NCM:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Erro interno ao listar sugestões de NCM',
    });
  }
}

/**
 * POST /api/siscomex/produtos/transmitir
 * Envia produtos aprovados do catálogo para o SISCOMEX
 */
export async function transmitirProdutos(req: Request, res: Response) {
  try {
    const ids = Array.isArray(req.body?.ids)
      ? (req.body.ids as Array<string | number>).map(id => Number(id)).filter(Number.isFinite)
      : [];

    const forcarAtualizacaoVersao = req.body?.forcarAtualizacaoVersao === true;

    const catalogoId = Number(req.body?.catalogoId);
    const resultado = await produtoTransmissaoService.solicitarTransmissao(
      ids,
      catalogoId,
      req.user!.superUserId,
      null,
      { forcarAtualizacaoVersao }
    );

    return res.status(202).json({
      sucesso: true,
      mensagem: 'Transmissão enfileirada com sucesso. Acompanhe o progresso na listagem.',
      dados: resultado,
    });
  } catch (error: unknown) {
    if (error instanceof ValidationError) {
      return res.status(400).json({ error: error.details || error.message });
    }

    logger.error('Erro ao transmitir produtos SISCOMEX:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Erro interno ao transmitir produtos SISCOMEX',
    });
  }
}

/**
 * GET /api/siscomex/atributos/ncm/:ncm
 * Consulta atributos por NCM
 */
export async function consultarAtributosPorNcm(req: Request, res: Response) {
  try {
    const { ncm } = req.params;

    if (!ncm || ncm.length < 8) {
      return res.status(400).json({
        error: 'NCM deve ter pelo menos 8 dígitos',
      });
    }

    const modalidade = (req.query.modalidade as string) || 'IMPORTACAO';
    const estruturaInfo = await atributoLegacyService.buscarEstrutura(ncm, modalidade);
    const atributos = estruturaInfo.estrutura;
    let info = await catalogoPrisma.ncmCache.findUnique({
      where: { codigo: ncm },
    });
    if (!info) {
      const atualizado = await ncmLegacyService.sincronizarNcm(ncm);
      if (atualizado) {
        info = {
          codigo: ncm,
          descricao: atualizado.descricao,
          unidadeMedida: atualizado.unidadeMedida,
        } as any;
      }
    }

    return res.status(200).json({
      sucesso: true,
      ncm,
      descricaoNcm: info?.descricao || null,
      unidadeMedida: info?.unidadeMedida || null,
      total: atributos.length,
      dados: atributos,
      versaoAtributos: estruturaInfo.versaoNumero,
    });
  } catch (error: unknown) {
    logger.error('Erro ao consultar atributos por NCM:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Erro interno ao consultar atributos por NCM',
    });
  }
}

export async function listarTransmissoes(req: Request, res: Response) {
  try {
    const transmissoes = await produtoTransmissaoService.listar(req.user!.superUserId);
    return res.json({ itens: transmissoes });
  } catch (error) {
    logger.error('Erro ao listar transmissões SISCOMEX:', error);
    return res.status(500).json({ error: 'Não foi possível listar as transmissões.' });
  }
}

export async function detalharTransmissao(req: Request, res: Response) {
  const id = Number(req.params.id);

  if (!Number.isFinite(id)) {
    return res.status(400).json({ error: 'Identificador de transmissão inválido.' });
  }

  try {
    const transmissao = await produtoTransmissaoService.detalhar(id, req.user!.superUserId);

    if (!transmissao) {
      return res.status(404).json({ error: 'Transmissão não encontrada.' });
    }

    return res.json(transmissao);
  } catch (error) {
    logger.error('Erro ao detalhar transmissão SISCOMEX:', error);
    return res.status(500).json({ error: 'Não foi possível detalhar a transmissão.' });
  }
}

export async function baixarArquivoTransmissao(req: Request, res: Response) {
  const id = Number(req.params.id);
  const tipo = req.params.tipo === 'retorno' ? 'retorno' : 'envio';

  if (!Number.isFinite(id)) {
    return res.status(400).json({ error: 'Identificador de transmissão inválido.' });
  }

  try {
    const arquivo = await produtoTransmissaoService.gerarLinkArquivo(id, tipo, req.user!.superUserId);

    if ('buffer' in arquivo && arquivo.buffer) {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="${arquivo.nome}"`);
      res.setHeader('Content-Length', arquivo.buffer.byteLength);
      return res.send(arquivo.buffer);
    }

    return res.json(arquivo);
  } catch (error) {
    if (error instanceof ValidationError) {
      return res.status(400).json({ error: error.details || error.message });
    }

    logger.error('Erro ao disponibilizar arquivo da transmissão SISCOMEX:', error);
    return res.status(500).json({ error: 'Não foi possível disponibilizar o arquivo solicitado.' });
  }
}
