// backend/src/controllers/siscomex-export.controller.ts

import { Request, Response } from 'express';
import { SiscomexExportService } from '../services/siscomex-export.service';
import { logger } from '../utils/logger';
import { storageFactory } from '../services/storage.factory';

const exportService = new SiscomexExportService();

/**
 * GET /api/siscomex/export/catalogo
 * Exporta catálogo completo para formato SISCOMEX
 */
export async function exportarCatalogo(req: Request, res: Response) {
  try {
    const superUserId = req.user!.superUserId;
    const {
      catalogoId,
      incluirOperadores = 'true',
      incluirProdutos = 'true',
      apenasAtivos = 'true',
      formato = 'json'
    } = req.query;

    logger.info(`Iniciando exportação de catálogo para superUserId: ${superUserId}`);

    const options = {
      catalogoId: catalogoId ? Number(catalogoId) : undefined,
      incluirOperadores: incluirOperadores === 'true',
      incluirProdutos: incluirProdutos === 'true',
      apenasAtivos: apenasAtivos === 'true',
      formato: formato as 'json' | 'xml'
    };

    const resultado = await exportService.exportarCatalogo(superUserId, options);

    if (!resultado.sucesso) {
      return res.status(400).json({
        sucesso: false,
        mensagem: 'Falha na exportação do catálogo',
        erros: resultado.resumo.erros,
        resumo: resultado.resumo
      });
    }

    return res.status(200).json({
      sucesso: true,
      mensagem: 'Catálogo exportado com sucesso',
      arquivo: resultado.arquivo,
      resumo: resultado.resumo,
      metadados: resultado.metadados
    });

  } catch (error: unknown) {
    logger.error('Erro na exportação de catálogo:', error);
    return res.status(500).json({
      sucesso: false,
      mensagem: 'Erro interno na exportação',
      erro: error instanceof Error ? error.message : 'Erro desconhecido'
    });
  }
}

/**
 * POST /api/siscomex/export/produtos
 * Exporta produtos específicos para formato SISCOMEX
 */
export async function exportarProdutos(req: Request, res: Response) {
  try {
    const superUserId = req.user!.superUserId;
    const { produtoIds, formato = 'json' } = req.body;

    if (!Array.isArray(produtoIds) || produtoIds.length === 0) {
      return res.status(400).json({
        sucesso: false,
        mensagem: 'Lista de IDs de produtos é obrigatória'
      });
    }

    logger.info(`Exportando produtos ${produtoIds.join(', ')} para superUserId: ${superUserId}`);

    const resultado = await exportService.exportarProdutos(
      produtoIds,
      superUserId,
      formato
    );

    return res.status(200).json({
      sucesso: true,
      mensagem: 'Produtos exportados com sucesso',
      arquivo: resultado.arquivo,
      resumo: resultado.resumo,
      metadados: resultado.metadados
    });

  } catch (error: unknown) {
    logger.error('Erro na exportação de produtos:', error);
    return res.status(500).json({
      sucesso: false,
      mensagem: 'Erro interno na exportação de produtos',
      erro: error instanceof Error ? error.message : 'Erro desconhecido'
    });
  }
}

/**
 * GET /api/siscomex/export/download/:arquivo
 * Download de arquivo exportado
 */
export async function downloadArquivoExportado(req: Request, res: Response) {
  try {
    const { arquivo } = req.params;
    const superUserId = req.user!.superUserId;

    if (!arquivo || !/^[a-zA-Z0-9_\-\.]+$/.test(arquivo)) {
      return res.status(400).json({
        sucesso: false,
        mensagem: 'Nome de arquivo inválido'
      });
    }

    logger.info(`Download de arquivo ${arquivo} solicitado por superUserId: ${superUserId}`);

    const provider = storageFactory();
    const caminho = `${superUserId}/certificados/exports/${arquivo}`;
    
    try {
      const fileBuffer = await provider.get(caminho);
      
      // Determina o tipo de conteúdo baseado na extensão
      const isXML = arquivo.endsWith('.xml');
      const contentType = isXML ? 'application/xml' : 'application/json';
      
      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Disposition', `attachment; filename="${arquivo}"`);
      res.setHeader('Content-Length', fileBuffer.length);
      
      return res.send(fileBuffer);

    } catch (storageError) {
      logger.warn(`Arquivo não encontrado: ${arquivo} para superUserId: ${superUserId}`);
      return res.status(404).json({
        sucesso: false,
        mensagem: 'Arquivo não encontrado'
      });
    }

  } catch (error: unknown) {
    logger.error('Erro no download de arquivo:', error);
    return res.status(500).json({
      sucesso: false,
      mensagem: 'Erro interno no download',
      erro: error instanceof Error ? error.message : 'Erro desconhecido'
    });
  }
}

/**
 * POST /api/siscomex/export/validar
 * Valida produtos antes da exportação
 */
export async function validarProdutosParaExportacao(req: Request, res: Response) {
  try {
    const superUserId = req.user!.superUserId;
    const { produtoIds } = req.body;

    if (!Array.isArray(produtoIds) || produtoIds.length === 0) {
      return res.status(400).json({
        sucesso: false,
        mensagem: 'Lista de IDs de produtos é obrigatória'
      });
    }

    logger.info(`Validando produtos ${produtoIds.join(', ')} para superUserId: ${superUserId}`);

    const resultado = await exportService.validarProdutosParaExportacao(
      produtoIds,
      superUserId
    );

    const totalValidados = resultado.produtosValidos.length;
    const totalInvalidos = resultado.produtosInvalidos.length;

    return res.status(200).json({
      sucesso: true,
      mensagem: `Validação concluída: ${totalValidados} válidos, ${totalInvalidos} inválidos`,
      produtosValidos: resultado.produtosValidos,
      produtosInvalidos: resultado.produtosInvalidos,
      resumo: {
        total: produtoIds.length,
        validos: totalValidados,
        invalidos: totalInvalidos,
        percentualSucesso: Math.round((totalValidados / produtoIds.length) * 100)
      }
    });

  } catch (error: unknown) {
    logger.error('Erro na validação de produtos:', error);
    return res.status(500).json({
      sucesso: false,
      mensagem: 'Erro interno na validação',
      erro: error instanceof Error ? error.message : 'Erro desconhecido'
    });
  }
}

/**
 * GET /api/siscomex/export/preview/:catalogoId
 * Gera preview dos dados que seriam exportados
 */
export async function gerarPreviewExportacao(req: Request, res: Response) {
  try {
    const { catalogoId } = req.params;
    const superUserId = req.user!.superUserId;

    if (!catalogoId || isNaN(Number(catalogoId))) {
      return res.status(400).json({
        sucesso: false,
        mensagem: 'ID do catálogo inválido'
      });
    }

    logger.info(`Gerando preview para catálogo ${catalogoId} e superUserId: ${superUserId}`);

    const preview = await exportService.gerarPreviewExportacao(
      Number(catalogoId),
      superUserId
    );

    return res.status(200).json({
      sucesso: true,
      mensagem: 'Preview gerado com sucesso',
      preview: {
        produtos: preview.produtos,
        operadores: preview.operadores,
        resumo: preview.resumo
      }
    });

  } catch (error: unknown) {
    logger.error('Erro na geração de preview:', error);
    return res.status(500).json({
      sucesso: false,
      mensagem: 'Erro interno na geração de preview',
      erro: error instanceof Error ? error.message : 'Erro desconhecido'
    });
  }
}

/**
 * GET /api/siscomex/export/historico
 * Lista arquivos de exportação gerados anteriormente
 */
export async function listarHistoricoExportacoes(req: Request, res: Response) {
  try {
    const superUserId = req.user!.superUserId;
    const { limite = 10, offset = 0 } = req.query;

    logger.info(`Listando histórico de exportações para superUserId: ${superUserId}`);

    // Como não temos uma tabela específica para histórico, 
    // essa implementação seria simplificada retornando uma estrutura básica
    // Em uma implementação completa, haveria uma tabela para armazenar metadados das exportações

    const historicoMock = {
      total: 0,
      exportacoes: [],
      paginacao: {
        limite: Number(limite),
        offset: Number(offset),
        totalPaginas: 0
      }
    };

    return res.status(200).json({
      sucesso: true,
      mensagem: 'Histórico obtido com sucesso',
      dados: historicoMock
    });

  } catch (error: unknown) {
    logger.error('Erro ao listar histórico de exportações:', error);
    return res.status(500).json({
      sucesso: false,
      mensagem: 'Erro interno ao obter histórico',
      erro: error instanceof Error ? error.message : 'Erro desconhecido'
    });
  }
}

/**
 * DELETE /api/siscomex/export/arquivo/:arquivo
 * Remove arquivo de exportação
 */
export async function removerArquivoExportacao(req: Request, res: Response) {
  try {
    const { arquivo } = req.params;
    const superUserId = req.user!.superUserId;

    if (!arquivo || !/^[a-zA-Z0-9_\-\.]+$/.test(arquivo)) {
      return res.status(400).json({
        sucesso: false,
        mensagem: 'Nome de arquivo inválido'
      });
    }

    logger.info(`Removendo arquivo ${arquivo} para superUserId: ${superUserId}`);

    const provider = storageFactory();
    const caminho = `${superUserId}/certificados/exports/${arquivo}`;
    
    try {
      await provider.delete(caminho);
      
      return res.status(200).json({
        sucesso: true,
        mensagem: 'Arquivo removido com sucesso'
      });

    } catch (storageError) {
      logger.warn(`Arquivo não encontrado para remoção: ${arquivo}`);
      return res.status(404).json({
        sucesso: false,
        mensagem: 'Arquivo não encontrado'
      });
    }

  } catch (error: unknown) {
    logger.error('Erro na remoção de arquivo:', error);
    return res.status(500).json({
      sucesso: false,
      mensagem: 'Erro interno na remoção',
      erro: error instanceof Error ? error.message : 'Erro desconhecido'
    });
  }
}

/**
 * GET /api/siscomex/export/status
 * Verifica status dos dados para exportação
 */
export async function verificarStatusExportacao(req: Request, res: Response) {
  try {
    const superUserId = req.user!.superUserId;
    const { catalogoId } = req.query;

    logger.info(`Verificando status para exportação - superUserId: ${superUserId}`);

    const preview = await exportService.gerarPreviewExportacao(
      catalogoId ? Number(catalogoId) : 0,
      superUserId
    );

    const status = {
      prontoPara: {
        siscomex: preview.resumo.produtosValidos > 0,
        exportacao: preview.resumo.totalItens > 0
      },
      estatisticas: {
        totalProdutos: preview.resumo.produtosValidos + preview.resumo.produtosInvalidos,
        produtosValidos: preview.resumo.produtosValidos,
        produtosInvalidos: preview.resumo.produtosInvalidos,
        operadoresAtivos: preview.resumo.operadoresAtivos,
        percentualValidacao: preview.resumo.totalItens > 0 
          ? Math.round((preview.resumo.produtosValidos / (preview.resumo.produtosValidos + preview.resumo.produtosInvalidos)) * 100)
          : 0
      },
      recomendacoes: []
    };

    // Adiciona recomendações baseadas no status
    if (status.estatisticas.produtosInvalidos > 0) {
      status.recomendacoes.push('Corrija os produtos inválidos antes da exportação');
    }

    if (status.estatisticas.operadoresAtivos === 0) {
      status.recomendacoes.push('Cadastre operadores estrangeiros ativos');
    }

    if (status.estatisticas.percentualValidacao < 100) {
      status.recomendacoes.push('Revise os dados para melhorar a qualidade da exportação');
    }

    return res.status(200).json({
      sucesso: true,
      mensagem: 'Status verificado com sucesso',
      status
    });

  } catch (error: unknown) {
    logger.error('Erro na verificação de status:', error);
    return res.status(500).json({
      sucesso: false,
      mensagem: 'Erro interno na verificação de status',
      erro: error instanceof Error ? error.message : 'Erro desconhecido'
    });
  }
}