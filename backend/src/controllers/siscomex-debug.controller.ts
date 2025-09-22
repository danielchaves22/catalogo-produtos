// backend/src/controllers/siscomex-debug.controller.ts

import { Request, Response } from 'express';
import { SiscomexUtils, siscomexPerformanceMonitor } from '../utils/siscomex-utils';
import { SiscomexService } from '../services/siscomex.service';
import { logger } from '../utils/logger';
import { SiscomexValidationUtils } from '../validators/siscomex.validator';

/**
 * Controller para endpoints de debugging e monitoramento SISCOMEX
 * Disponível apenas em ambiente de desenvolvimento
 */

/**
 * GET /api/v1/siscomex/debug/diagnostico
 * Gera relatório completo de diagnóstico do sistema SISCOMEX
 */
export async function gerarDiagnostico(req: Request, res: Response) {
  try {
    logger.info(`Diagnóstico SISCOMEX solicitado por usuário ${req.user?.id}`);

    const relatorio = await SiscomexUtils.gerarRelatorioDebugging();
    
    return res.status(200).json({
      sucesso: true,
      mensagem: 'Diagnóstico gerado com sucesso',
      diagnostico: relatorio
    });

  } catch (error: unknown) {
    logger.error('Erro ao gerar diagnóstico SISCOMEX:', error);
    return res.status(500).json({
      sucesso: false,
      mensagem: 'Erro interno ao gerar diagnóstico',
      erro: error instanceof Error ? error.message : 'Erro desconhecido'
    });
  }
}

/**
 * GET /api/v1/siscomex/debug/certificado
 * Valida o certificado digital configurado
 */
export async function validarCertificado(req: Request, res: Response) {
  try {
    const certificadoPath = process.env.SISCOMEX_CERT_PATH;
    
    if (!certificadoPath) {
      return res.status(400).json({
        sucesso: false,
        mensagem: 'Caminho do certificado não configurado',
        detalhes: 'Configure SISCOMEX_CERT_PATH nas variáveis de ambiente'
      });
    }

    const validacao = await SiscomexUtils.validarCertificadoDigital(certificadoPath);
    
    const statusCode = validacao.valido ? 200 : 400;
    
    return res.status(statusCode).json({
      sucesso: validacao.valido,
      mensagem: validacao.valido ? 'Certificado válido' : 'Problemas encontrados no certificado',
      certificado: {
        valido: validacao.valido,
        expirado: validacao.expirado,
        diasParaVencer: validacao.diasParaVencer,
        detalhes: validacao.detalhes,
        alertas: validacao.erros
      }
    });

  } catch (error: unknown) {
    logger.error('Erro ao validar certificado:', error);
    return res.status(500).json({
      sucesso: false,
      mensagem: 'Erro interno ao validar certificado',
      erro: error instanceof Error ? error.message : 'Erro desconhecido'
    });
  }
}

/**
 * GET /api/v1/siscomex/debug/conectividade
 * Testa conectividade com a API SISCOMEX
 */
export async function testarConectividade(req: Request, res: Response) {
  try {
    const siscomexService = new SiscomexService();
    
    const startTime = Date.now();
    const estado = await siscomexService.verificarConexao();
    const responseTime = Date.now() - startTime;

    const resultado = {
      conectado: estado.conectado,
      tempoResposta: responseTime,
      ambiente: estado.ambiente,
      versaoApi: estado.versaoApi,
      certificadoValido: estado.certificadoValido,
      ultimaVerificacao: estado.ultimaVerificacao
    };

    const statusCode = estado.conectado ? 200 : 503;

    return res.status(statusCode).json({
      sucesso: estado.conectado,
      mensagem: estado.conectado ? 'Conexão estabelecida com sucesso' : 'Falha na conexão',
      conectividade: resultado
    });

  } catch (error: unknown) {
    logger.error('Erro ao testar conectividade SISCOMEX:', error);
    return res.status(500).json({
      sucesso: false,
      mensagem: 'Erro interno ao testar conectividade',
      erro: error instanceof Error ? error.message : 'Erro desconhecido'
    });
  }
}

/**
 * GET /api/v1/siscomex/debug/metricas
 * Retorna métricas de performance das operações SISCOMEX
 */
export async function obterMetricas(req: Request, res: Response) {
  try {
    const metricas = siscomexPerformanceMonitor.obterMetricas();
    
    // Calcula estatísticas gerais
    const estatisticasGerais = {
      totalOperacoes: Object.values(metricas).reduce((acc: number, m: any) => acc + m.totalChamadas, 0),
      taxaSucessoGeral: 0,
      tempoMedioGeral: 0
    };

    if (estatisticasGerais.totalOperacoes > 0) {
      const totalSucessos = Object.values(metricas).reduce((acc: number, m: any) => acc + m.totalSucessos, 0);
      const tempoTotal = Object.values(metricas).reduce((acc: number, m: any) => acc + (m.tempoMedio * m.totalChamadas), 0);
      
      estatisticasGerais.taxaSucessoGeral = Math.round((totalSucessos / estatisticasGerais.totalOperacoes) * 100);
      estatisticasGerais.tempoMedioGeral = Math.round(tempoTotal / estatisticasGerais.totalOperacoes);
    }

    return res.status(200).json({
      sucesso: true,
      mensagem: 'Métricas obtidas com sucesso',
      metricas: {
        estatisticasGerais,
        porOperacao: metricas,
        coletadoEm: new Date().toISOString()
      }
    });

  } catch (error: unknown) {
    logger.error('Erro ao obter métricas SISCOMEX:', error);
    return res.status(500).json({
      sucesso: false,
      mensagem: 'Erro interno ao obter métricas',
      erro: error instanceof Error ? error.message : 'Erro desconhecido'
    });
  }
}

/**
 * POST /api/v1/siscomex/debug/resetar-metricas
 * Reseta as métricas de performance
 */
export async function resetarMetricas(req: Request, res: Response) {
  try {
    siscomexPerformanceMonitor.resetar();
    
    logger.info(`Métricas SISCOMEX resetadas por usuário ${req.user?.id}`);
    
    return res.status(200).json({
      sucesso: true,
      mensagem: 'Métricas resetadas com sucesso',
      timestamp: new Date().toISOString()
    });

  } catch (error: unknown) {
    logger.error('Erro ao resetar métricas SISCOMEX:', error);
    return res.status(500).json({
      sucesso: false,
      mensagem: 'Erro interno ao resetar métricas',
      erro: error instanceof Error ? error.message : 'Erro desconhecido'
    });
  }
}

/**
 * POST /api/v1/siscomex/debug/testar-produto
 * Testa transformação de um produto específico para formato SISCOMEX
 */
export async function testarTransformacaoProduto(req: Request, res: Response) {
  try {
    const { produtoId } = req.body;
    
    if (!produtoId || typeof produtoId !== 'number') {
      return res.status(400).json({
        sucesso: false,
        mensagem: 'ID do produto é obrigatório'
      });
    }

    const { catalogoPrisma } = await import('../utils/prisma');
    const { SiscomexTransformersService } = await import('../services/siscomex-transformers.service');
    
    // Busca produto completo
    const produto = await catalogoPrisma.produto.findFirst({
      where: { 
        id: produtoId, 
        catalogo: { superUserId: req.user!.superUserId } 
      },
      include: {
        catalogo: true,
        atributos: true,
        codigosInternos: true,
        operadoresEstrangeiros: {
          include: {
            pais: true,
            operadorEstrangeiro: {
              include: {
                pais: true,
                subdivisao: true,
                identificacoesAdicionais: {
                  include: { agenciaEmissora: true }
                }
              }
            }
          }
        }
      }
    });

    if (!produto) {
      return res.status(404).json({
        sucesso: false,
        mensagem: 'Produto não encontrado'
      });
    }

    const transformersService = new SiscomexTransformersService();
    
    // Valida o produto
    const validacao = transformersService.validarProdutoParaEnvio(produto as any);
    
    let produtoSiscomex = null;
    let erroTransformacao = null;

    if (validacao.valido) {
      try {
        produtoSiscomex = transformersService.transformarProdutoParaSiscomex(produto as any);
      } catch (error) {
        erroTransformacao = error instanceof Error ? error.message : 'Erro na transformação';
      }
    }

    const resultado = {
      produtoOriginal: {
        id: produto.id,
        denominacao: produto.denominacao,
        ncm: produto.ncmCodigo,
        modalidade: produto.modalidade,
        catalogoNome: produto.catalogo.nome,
        catalogoCnpj: produto.catalogo.cpf_cnpj
      },
      validacao,
      transformacao: {
        sucesso: !!produtoSiscomex,
        erro: erroTransformacao,
        produtoSiscomex
      },
      timestamp: new Date().toISOString()
    };

    return res.status(200).json({
      sucesso: true,
      mensagem: 'Teste de transformação concluído',
      resultado
    });

  } catch (error: unknown) {
    logger.error('Erro ao testar transformação de produto:', error);
    return res.status(500).json({
      sucesso: false,
      mensagem: 'Erro interno ao testar transformação',
      erro: error instanceof Error ? error.message : 'Erro desconhecido'
    });
  }
}

/**
 * GET /api/v1/siscomex/debug/configuracao
 * Mostra configuração atual do SISCOMEX (sem dados sensíveis)
 */
export async function mostrarConfiguracao(req: Request, res: Response) {
  try {
    const validacao = SiscomexValidationUtils.validarConfiguracaoAmbiente();
    
    const configuracao = {
      ambiente: process.env.SISCOMEX_AMBIENTE || 'NÃO CONFIGURADO',
      apiUrl: process.env.SISCOMEX_API_URL || 'NÃO CONFIGURADO',
      certificado: {
        configurado: !!process.env.SISCOMEX_CERT_PATH,
        caminho: process.env.SISCOMEX_CERT_PATH ? '[CONFIGURADO]' : 'NÃO CONFIGURADO'
      },
      chavePrivada: {
        configurado: !!process.env.SISCOMEX_KEY_PATH,
        caminho: process.env.SISCOMEX_KEY_PATH ? '[CONFIGURADO]' : 'NÃO CONFIGURADO'
      },
      criptografia: {
        configurado: !!process.env.CERT_PASSWORD_SECRET
      },
      validacao
    };

    return res.status(200).json({
      sucesso: true,
      mensagem: 'Configuração SISCOMEX obtida',
      configuracao
    });

  } catch (error: unknown) {
    logger.error('Erro ao obter configuração SISCOMEX:', error);
    return res.status(500).json({
      sucesso: false,
      mensagem: 'Erro interno ao obter configuração',
      erro: error instanceof Error ? error.message : 'Erro desconhecido'
    });
  }
}

/**
 * POST /api/v1/siscomex/debug/simular-envio
 * Simula envio de produto para SISCOMEX (sem enviar realmente)
 */
export async function simularEnvio(req: Request, res: Response) {
  try {
    const { produtoId, executarValidacoes = true } = req.body;
    
    if (!produtoId || typeof produtoId !== 'number') {
      return res.status(400).json({
        sucesso: false,
        mensagem: 'ID do produto é obrigatório'
      });
    }

    logger.info(`Simulando envio SISCOMEX do produto ${produtoId} para usuário ${req.user?.id}`);

    const { catalogoPrisma } = await import('../utils/prisma');
    const { SiscomexTransformersService } = await import('../services/siscomex-transformers.service');
    
    // Busca produto completo
    const produto = await catalogoPrisma.produto.findFirst({
      where: { 
        id: produtoId, 
        catalogo: { superUserId: req.user!.superUserId } 
      },
      include: {
        catalogo: true,
        atributos: true,
        codigosInternos: true,
        operadoresEstrangeiros: {
          include: {
            pais: true,
            operadorEstrangeiro: {
              include: {
                pais: true,
                subdivisao: true,
                identificacoesAdicionais: {
                  include: { agenciaEmissora: true }
                }
              }
            }
          }
        }
      }
    });

    if (!produto) {
      return res.status(404).json({
        sucesso: false,
        mensagem: 'Produto não encontrado'
      });
    }

    const transformersService = new SiscomexTransformersService();
    const simulacao: any = {
      etapas: [],
      sucesso: true,
      tempoEstimado: 0
    };

    const inicioSimulacao = Date.now();

    // Etapa 1: Validação
    simulacao.etapas.push({
      etapa: 'validacao',
      inicio: new Date().toISOString(),
      status: 'iniciada'
    });

    const validacao = transformersService.validarProdutoParaEnvio(produto as any);
    
    simulacao.etapas[0].fim = new Date().toISOString();
    simulacao.etapas[0].status = validacao.valido ? 'sucesso' : 'erro';
    simulacao.etapas[0].resultado = validacao;

    if (!validacao.valido) {
      simulacao.sucesso = false;
      simulacao.erroFatal = 'Produto não passou na validação';
    }

    // Etapa 2: Transformação
    if (simulacao.sucesso) {
      simulacao.etapas.push({
        etapa: 'transformacao',
        inicio: new Date().toISOString(),
        status: 'iniciada'
      });

      try {
        const produtoSiscomex = transformersService.transformarProdutoParaSiscomex(produto as any);
        
        simulacao.etapas[1].fim = new Date().toISOString();
        simulacao.etapas[1].status = 'sucesso';
        simulacao.etapas[1].resultado = {
          tamanhoPayload: JSON.stringify(produtoSiscomex).length,
          atributosTransformados: produtoSiscomex.atributos.length,
          fabricantesIncluidos: produtoSiscomex.fabricantes.length
        };

      } catch (error) {
        simulacao.etapas[1].fim = new Date().toISOString();
        simulacao.etapas[1].status = 'erro';
        simulacao.etapas[1].erro = error instanceof Error ? error.message : 'Erro na transformação';
        simulacao.sucesso = false;
      }
    }

    // Etapa 3: Simulação de envio
    if (simulacao.sucesso) {
      simulacao.etapas.push({
        etapa: 'envio_simulado',
        inicio: new Date().toISOString(),
        status: 'simulado'
      });

      // Simula delay de rede (entre 500ms e 2s)
      const delaySimulado = Math.random() * 1500 + 500;
      await new Promise(resolve => setTimeout(resolve, Math.min(delaySimulado, 100))); // Reduzido para teste
      
      simulacao.etapas[2].fim = new Date().toISOString();
      simulacao.etapas[2].status = 'sucesso_simulado';
      simulacao.etapas[2].resultado = {
        codigoSimulado: `SIMU${produto.id.toString().padStart(6, '0')}`,
        versaoSimulada: 1,
        mensagem: 'Envio simulado - produto seria cadastrado com sucesso'
      };
    }

    simulacao.tempoTotal = Date.now() - inicioSimulacao;

    return res.status(200).json({
      sucesso: true,
      mensagem: 'Simulação de envio concluída',
      simulacao,
      aviso: 'Esta foi uma simulação - nenhum dado foi enviado ao SISCOMEX real'
    });

  } catch (error: unknown) {
    logger.error('Erro ao simular envio SISCOMEX:', error);
    return res.status(500).json({
      sucesso: false,
      mensagem: 'Erro interno ao simular envio',
      erro: error instanceof Error ? error.message : 'Erro desconhecido'
    });
  }
}