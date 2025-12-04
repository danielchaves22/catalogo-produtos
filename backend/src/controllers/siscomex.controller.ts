// backend/src/controllers/siscomex.controller.ts
import { Request, Response } from 'express';
import { SiscomexService, SiscomexConsultaFiltros } from '../services/siscomex.service';
import { AtributoLegacyService } from '../services/atributo-legacy.service';
import { NcmLegacyService } from '../services/ncm-legacy.service';
import { logger } from '../utils/logger';
import { catalogoPrisma } from '../utils/prisma';
import { ProdutoService } from '../services/produto.service';
import { ProdutoTransmissaoService } from '../services/produto-transmissao.service';
import { ValidationError } from '../types/validation-error';

const siscomexService = new SiscomexService();
const atributoLegacyService = new AtributoLegacyService();
const ncmLegacyService = new NcmLegacyService();
const produtoService = new ProdutoService();
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
      dados: sugestoes
    });
  } catch (error: unknown) {
    logger.error('Erro ao listar sugestões de NCM:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Erro interno ao listar sugestões de NCM'
    });
  }
}

/**
 * GET /api/siscomex/produtos
 * Consulta produtos no SISCOMEX
 */
export async function consultarProdutos(req: Request, res: Response) {
  try {
    const filtros: SiscomexConsultaFiltros = {
      cpfCnpjRaiz: (req.query.cpfCnpjRaiz as string) || (req.query.cnpjRaiz as string),
      codigoProduto: req.query.codigoProduto as string,
      ncm: req.query.ncm as string,
      situacao: req.query.situacao as 'ATIVADO' | 'DESATIVADO' | 'RASCUNHO',
      incluirDesativados: req.query.incluirDesativados === 'true'
    };

    if (!filtros.cpfCnpjRaiz) {
      return res.status(400).json({
        error: 'CNPJ Raiz é obrigatório para consulta no SISCOMEX'
      });
    }

    const produtos = await siscomexService.consultarProdutos(filtros);
    
    return res.status(200).json({
      sucesso: true,
      total: produtos.length,
      dados: produtos
    });
  } catch (error: unknown) {
    logger.error('Erro ao consultar produtos SISCOMEX:', error);
    return res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Erro interno ao consultar produtos SISCOMEX' 
    });
  }
}

/**
 * POST /api/siscomex/produtos
 * Inclui novo produto no SISCOMEX
 */
export async function incluirProduto(req: Request, res: Response) {
  try {
    const cpfCnpjRaiz = (req.body?.cpfCnpjRaiz as string) || (req.query.cpfCnpjRaiz as string);
    const produtoId = Number(req.body?.produtoId);

    if (!cpfCnpjRaiz) {
      return res.status(400).json({
        error: 'cpfCnpjRaiz é obrigatório para inclusão no SISCOMEX'
      });
    }

    const produto = await siscomexService.incluirProduto(cpfCnpjRaiz, req.body);

    if (Number.isInteger(produtoId)) {
      try {
        await produtoService.marcarComoTransmitido(produtoId, req.user!.superUserId, {
          codigo: produto.codigo,
          versao: produto.versao,
          situacao: produto.situacao
        });
      } catch (updateError) {
        logger.error('Falha ao atualizar status local após transmissão SISCOMEX', updateError);
      }
    }

    return res.status(201).json({
      sucesso: true,
      mensagem: 'Produto incluído com sucesso no SISCOMEX',
      dados: produto
    });
  } catch (error: unknown) {
    logger.error('Erro ao incluir produto SISCOMEX:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Erro interno ao incluir produto SISCOMEX'
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

    const catalogoId = Number(req.body?.catalogoId);

    const resultado = await produtoTransmissaoService.transmitir(ids, catalogoId, req.user!.superUserId);

    return res.status(200).json({
      sucesso: true,
      mensagem: `${resultado.sucessos.length} produto(s) transmitido(s) com sucesso${
        resultado.falhas.length ? `; ${resultado.falhas.length} falha(s) registrada(s)` : ''
      }`,
      dados: resultado
    });
  } catch (error: unknown) {
    if (error instanceof ValidationError) {
      return res.status(400).json({ error: error.details || error.message });
    }

    logger.error('Erro ao transmitir produtos SISCOMEX:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Erro interno ao transmitir produtos SISCOMEX'
    });
  }
}

/**
 * PUT /api/siscomex/produtos/:codigo
 * Atualiza produto no SISCOMEX (gera nova versão)
 */
export async function atualizarProduto(req: Request, res: Response) {
  try {
    const { codigo } = req.params;
    const cpfCnpjRaiz = (req.body?.cpfCnpjRaiz as string) || (req.query.cpfCnpjRaiz as string);

    if (!cpfCnpjRaiz) {
      return res.status(400).json({
        error: 'cpfCnpjRaiz é obrigatório para atualizar no SISCOMEX'
      });
    }

    const produto = await siscomexService.atualizarProduto(cpfCnpjRaiz, codigo, req.body);

    return res.status(200).json({
      sucesso: true,
      mensagem: 'Produto atualizado com sucesso no SISCOMEX',
      dados: produto
    });
  } catch (error: unknown) {
    logger.error('Erro ao atualizar produto SISCOMEX:', error);
    return res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Erro interno ao atualizar produto SISCOMEX' 
    });
  }
}

/**
 * GET /api/siscomex/produtos/:codigo/versoes/:versao
 * Detalha versão específica do produto
 */
export async function detalharVersaoProduto(req: Request, res: Response) {
  try {
    const { codigo, versao } = req.params;
    const produto = await siscomexService.detalharVersaoProduto(codigo, Number(versao));
    
    return res.status(200).json({
      sucesso: true,
      dados: produto
    });
  } catch (error: unknown) {
    logger.error('Erro ao detalhar versão do produto SISCOMEX:', error);
    return res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Erro interno ao detalhar versão do produto SISCOMEX' 
    });
  }
}

/**
 * GET /api/siscomex/produtos/exportar
 * Exporta catálogo completo do SISCOMEX
 */
export async function exportarCatalogo(req: Request, res: Response) {
  try {
    const cnpjRaiz = (req.query.cpfCnpjRaiz as string) || (req.query.cnpjRaiz as string);
    const incluirDesativados = req.query.incluirDesativados === 'true';

    if (!cnpjRaiz) {
      return res.status(400).json({ 
        error: 'CNPJ Raiz é obrigatório para exportar catálogo' 
      });
    }

    const produtos = await siscomexService.exportarCatalogo(cnpjRaiz, incluirDesativados);
    
    return res.status(200).json({
      sucesso: true,
      total: produtos.length,
      dados: produtos,
      exportadoEm: new Date().toISOString()
    });
  } catch (error: unknown) {
    logger.error('Erro ao exportar catálogo SISCOMEX:', error);
    return res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Erro interno ao exportar catálogo SISCOMEX' 
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
        error: 'NCM deve ter pelo menos 8 dígitos' 
      });
    }

    const modalidade = (req.query.modalidade as string) || 'IMPORTACAO';
    const estruturaInfo = await atributoLegacyService.buscarEstrutura(ncm, modalidade);
    const atributos = estruturaInfo.estrutura;
    let info = await catalogoPrisma.ncmCache.findUnique({
      where: { codigo: ncm }
    });
    if (!info) {
      const atualizado = await ncmLegacyService.sincronizarNcm(ncm);
      if (atualizado) {
        info = {
          codigo: ncm,
          descricao: atualizado.descricao,
          unidadeMedida: atualizado.unidadeMedida
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
      versaoAtributos: estruturaInfo.versaoNumero
    });
  } catch (error: unknown) {
    logger.error('Erro ao consultar atributos por NCM:', error);
    return res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Erro interno ao consultar atributos por NCM' 
    });
  }
}

/**
 * GET /api/siscomex/status
 * Verifica status da conexão com SISCOMEX
 */
export async function verificarStatus(req: Request, res: Response) {
  try {
    const conectado = await siscomexService.testarConexao();
    
      return res.status(200).json({
        siscomex: {
          conectado,
          ambiente: process.env.SISCOMEX_AMBIENTE || 'não configurado',
          url: process.env.SISCOMEX_API_URL || 'não configurada',
          certificado: process.env.SISCOMEX_CERT_PFX_PATH ? 'configurado' : 'não configurado'
        },
        timestamp: new Date().toISOString()
      });
  } catch (error: unknown) {
    logger.error('Erro ao verificar status SISCOMEX:', error);
    return res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Erro interno ao verificar status SISCOMEX' 
    });
  }
}