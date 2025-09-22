// backend/src/utils/siscomex-utils.ts

import { logger } from './logger';
import fs from 'fs/promises';
import crypto from 'crypto';

/**
 * Utilitários específicos para integração SISCOMEX
 */
export class SiscomexUtils {
  
  /**
   * Valida se o certificado digital está válido e não expirado
   */
  static async validarCertificadoDigital(caminhoArquivo: string): Promise<{
    valido: boolean;
    expirado: boolean;
    diasParaVencer: number;
    detalhes: any;
    erros: string[];
  }> {
    const erros: string[] = [];
    let detalhes: any = {};
    let valido = false;
    let expirado = false;
    let diasParaVencer = 0;

    try {
      // Verifica se o arquivo existe
      await fs.access(caminhoArquivo);
      
      // Lê o conteúdo do certificado
      const certContent = await fs.readFile(caminhoArquivo, 'utf8');
      
      // Valida o formato PEM
      if (!certContent.includes('BEGIN CERTIFICATE') || !certContent.includes('END CERTIFICATE')) {
        erros.push('Formato de certificado inválido (esperado PEM)');
        return { valido: false, expirado: false, diasParaVencer: 0, detalhes: {}, erros };
      }

      // Usa crypto para analisar o certificado
      const { X509Certificate } = await import('crypto');
      
      try {
        const cert = new X509Certificate(certContent);
        
        detalhes = {
          subject: cert.subject,
          issuer: cert.issuer,
          validFrom: cert.validFrom,
          validTo: cert.validTo,
          serialNumber: cert.serialNumber,
          fingerprint: cert.fingerprint
        };

        // Verifica validade temporal
        const agora = new Date();
        const validTo = new Date(cert.validTo);
        const validFrom = new Date(cert.validFrom);

        if (agora < validFrom) {
          erros.push('Certificado ainda não é válido');
        } else if (agora > validTo) {
          erros.push('Certificado expirado');
          expirado = true;
        } else {
          valido = true;
          diasParaVencer = Math.ceil((validTo.getTime() - agora.getTime()) / (1000 * 60 * 60 * 24));
          
          // Alerta se está próximo do vencimento
          if (diasParaVencer <= 30) {
            erros.push(`Certificado vence em ${diasParaVencer} dias`);
          }
        }

      } catch (certError) {
        erros.push(`Erro ao analisar certificado: ${certError instanceof Error ? certError.message : 'Erro desconhecido'}`);
      }

    } catch (error) {
      erros.push(`Erro ao acessar arquivo de certificado: ${error instanceof Error ? error.message : 'Erro desconhecido'}`);
    }

    return {
      valido,
      expirado,
      diasParaVencer,
      detalhes,
      erros
    };
  }

  /**
   * Gera hash para detectar mudanças em estruturas de atributos
   */
  static gerarHashEstrutura(estrutura: any): string {
    const json = JSON.stringify(estrutura, Object.keys(estrutura).sort());
    return crypto.createHash('sha256').update(json).digest('hex');
  }

  /**
   * Formata dados para log de debug SISCOMEX
   */
  static formatarLogSiscomex(
    operacao: string,
    dados: any,
    resultado?: any,
    erro?: any
  ): void {
    const logData = {
      operacao,
      timestamp: new Date().toISOString(),
      dados: SiscomexUtils.sanitizarDadosLog(dados),
      ...(resultado && { resultado: SiscomexUtils.sanitizarDadosLog(resultado) }),
      ...(erro && { erro: erro.message || erro })
    };

    if (erro) {
      logger.error(`SISCOMEX ${operacao} - ERRO`, logData);
    } else {
      logger.info(`SISCOMEX ${operacao} - SUCESSO`, logData);
    }
  }

  /**
   * Remove dados sensíveis dos logs
   */
  static sanitizarDadosLog(dados: any): any {
    if (!dados || typeof dados !== 'object') {
      return dados;
    }

    const sanitizado = { ...dados };
    const camposSensiveis = ['senha', 'password', 'token', 'secret', 'key', 'authorization'];

    function sanitizarObjeto(obj: any): any {
      if (Array.isArray(obj)) {
        return obj.map(item => sanitizarObjeto(item));
      }

      if (obj && typeof obj === 'object') {
        const resultado: any = {};
        
        for (const [chave, valor] of Object.entries(obj)) {
          const chaveNormalizada = chave.toLowerCase();
          
          if (camposSensiveis.some(campo => chaveNormalizada.includes(campo))) {
            resultado[chave] = '[REDACTED]';
          } else {
            resultado[chave] = sanitizarObjeto(valor);
          }
        }
        
        return resultado;
      }

      return obj;
    }

    return sanitizarObjeto(sanitizado);
  }

  /**
   * Verifica compatibilidade de versões da API SISCOMEX
   */
  static verificarCompatibilidadeVersao(versaoApi: string, versaoMinima = '1.0'): {
    compativel: boolean;
    versaoApi: string;
    versaoMinima: string;
    recomendacao?: string;
  } {
    const parseVersao = (v: string): number[] => {
      return v.split('.').map(num => parseInt(num, 10) || 0);
    };

    const api = parseVersao(versaoApi);
    const minima = parseVersao(versaoMinima);

    let compativel = true;
    let recomendacao: string | undefined;

    // Compara versões (major.minor.patch)
    for (let i = 0; i < Math.max(api.length, minima.length); i++) {
      const apiNum = api[i] || 0;
      const minimaNum = minima[i] || 0;

      if (apiNum < minimaNum) {
        compativel = false;
        recomendacao = `Atualize para versão ${versaoMinima} ou superior`;
        break;
      } else if (apiNum > minimaNum) {
        break; // Versão superior, compatível
      }
    }

    return {
      compativel,
      versaoApi,
      versaoMinima,
      recomendacao
    };
  }

  /**
   * Calcula estatísticas de uma operação em lote
   */
  static calcularEstatisticasLote(resultados: Array<{ sucesso: boolean; erro?: string }>): {
    total: number;
    sucessos: number;
    erros: number;
    taxaSucesso: number;
    errosMaisComuns: Array<{ erro: string; count: number }>;
  } {
    const total = resultados.length;
    const sucessos = resultados.filter(r => r.sucesso).length;
    const erros = total - sucessos;
    const taxaSucesso = total > 0 ? (sucessos / total) * 100 : 0;

    // Agrupa erros por tipo
    const errosMap = new Map<string, number>();
    resultados
      .filter(r => !r.sucesso && r.erro)
      .forEach(r => {
        const erro = r.erro!;
        errosMap.set(erro, (errosMap.get(erro) || 0) + 1);
      });

    const errosMaisComuns = Array.from(errosMap.entries())
      .map(([erro, count]) => ({ erro, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5); // Top 5 erros

    return {
      total,
      sucessos,
      erros,
      taxaSucesso: Math.round(taxaSucesso * 100) / 100,
      errosMaisComuns
    };
  }

  /**
   * Valida conectividade de rede com SISCOMEX
   */
  static async testarConectividadeRede(url: string): Promise<{
    conectado: boolean;
    tempoResposta: number;
    erro?: string;
  }> {
    const inicio = Date.now();
    
    try {
      const { default: axios } = await import('axios');
      
      const response = await axios.get(url, {
        timeout: 10000,
        headers: {
          'User-Agent': 'CatalogoProdutos-ConnectivityTest/1.0'
        }
      });

      const tempoResposta = Date.now() - inicio;

      return {
        conectado: response.status >= 200 && response.status < 400,
        tempoResposta
      };

    } catch (error) {
      const tempoResposta = Date.now() - inicio;
      
      return {
        conectado: false,
        tempoResposta,
        erro: error instanceof Error ? error.message : 'Erro desconhecido'
      };
    }
  }

  /**
   * Gera relatório de diagnóstico do sistema SISCOMEX
   */
  static async gerarRelatorioDebugging(): Promise<{
    timestamp: string;
    configuracao: any;
    conectividade: any;
    certificado: any;
    recomendacoes: string[];
  }> {
    const recomendacoes: string[] = [];
    
    // Verifica configuração
    const configuracao = {
      apiUrl: process.env.SISCOMEX_API_URL || 'NÃO CONFIGURADO',
      ambiente: process.env.SISCOMEX_AMBIENTE || 'NÃO CONFIGURADO',
      certificado: process.env.SISCOMEX_CERT_PATH ? 'CONFIGURADO' : 'NÃO CONFIGURADO',
      chavePrivada: process.env.SISCOMEX_KEY_PATH ? 'CONFIGURADO' : 'NÃO CONFIGURADO',
      secretCertificado: process.env.CERT_PASSWORD_SECRET ? 'CONFIGURADO' : 'NÃO CONFIGURADO'
    };

    // Verifica conectividade
    let conectividade: any = null;
    if (configuracao.apiUrl !== 'NÃO CONFIGURADO') {
      conectividade = await SiscomexUtils.testarConectividadeRede(configuracao.apiUrl);
      
      if (!conectividade.conectado) {
        recomendacoes.push('Verificar conectividade de rede com SISCOMEX');
      }
    } else {
      recomendacoes.push('Configurar SISCOMEX_API_URL');
    }

    // Verifica certificado
    let certificado: any = null;
    if (configuracao.certificado === 'CONFIGURADO') {
      certificado = await SiscomexUtils.validarCertificadoDigital(process.env.SISCOMEX_CERT_PATH!);
      
      if (!certificado.valido) {
        recomendacoes.push('Verificar validade do certificado digital');
      }
      
      if (certificado.diasParaVencer <= 30) {
        recomendacoes.push(`Certificado vence em ${certificado.diasParaVencer} dias - renovar`);
      }
    } else {
      recomendacoes.push('Configurar certificado digital (SISCOMEX_CERT_PATH)');
    }

    // Verificações adicionais
    if (configuracao.ambiente === 'NÃO CONFIGURADO') {
      recomendacoes.push('Definir SISCOMEX_AMBIENTE (producao ou treinamento)');
    }

    if (configuracao.secretCertificado === 'NÃO CONFIGURADO') {
      recomendacoes.push('Configurar CERT_PASSWORD_SECRET para criptografia');
    }

    return {
      timestamp: new Date().toISOString(),
      configuracao,
      conectividade,
      certificado,
      recomendacoes
    };
  }

  /**
   * Wrapper para retry automático em operações SISCOMEX
   */
  static async executarComRetry<T>(
    operacao: () => Promise<T>,
    maxTentativas = 3,
    delayMs = 1000,
    backoffMultiplier = 2
  ): Promise<T> {
    let ultimoErro: Error;
    let delay = delayMs;

    for (let tentativa = 1; tentativa <= maxTentativas; tentativa++) {
      try {
        const resultado = await operacao();
        
        // Log sucesso após retry
        if (tentativa > 1) {
          logger.info(`Operação SISCOMEX bem-sucedida na tentativa ${tentativa}`);
        }
        
        return resultado;
        
      } catch (error) {
        ultimoErro = error instanceof Error ? error : new Error('Erro desconhecido');
        
        // Log da tentativa falhada
        logger.warn(`Tentativa ${tentativa}/${maxTentativas} falhou: ${ultimoErro.message}`);

        // Não faz retry para alguns tipos de erro
        if (ultimoErro.message.includes('401') || 
            ultimoErro.message.includes('403') ||
            ultimoErro.message.includes('404')) {
          throw ultimoErro;
        }

        // Se não é a última tentativa, aguarda antes de retry
        if (tentativa < maxTentativas) {
          await new Promise(resolve => setTimeout(resolve, delay));
          delay *= backoffMultiplier;
        }
      }
    }

    // Se chegou aqui, todas as tentativas falharam
    logger.error(`Operação SISCOMEX falhou após ${maxTentativas} tentativas`);
    throw ultimoErro;
  }

  /**
   * Monitora métricas de performance das operações SISCOMEX
   */
  static criarMonitorPerformance() {
    const metricas = new Map<string, {
      totalChamadas: number;
      totalSucessos: number;
      totalErros: number;
      tempoMedio: number;
      ultimaChamada: Date;
    }>();

    return {
      registrar: (operacao: string, sucesso: boolean, tempoMs: number) => {
        const atual = metricas.get(operacao) || {
          totalChamadas: 0,
          totalSucessos: 0,
          totalErros: 0,
          tempoMedio: 0,
          ultimaChamada: new Date()
        };

        atual.totalChamadas++;
        if (sucesso) {
          atual.totalSucessos++;
        } else {
          atual.totalErros++;
        }
        
        // Atualiza tempo médio (média móvel simples)
        atual.tempoMedio = (atual.tempoMedio * (atual.totalChamadas - 1) + tempoMs) / atual.totalChamadas;
        atual.ultimaChamada = new Date();

        metricas.set(operacao, atual);
      },

      obterMetricas: () => {
        const resultado: any = {};
        
        for (const [operacao, dados] of metricas.entries()) {
          resultado[operacao] = {
            ...dados,
            taxaSucesso: dados.totalChamadas > 0 
              ? Math.round((dados.totalSucessos / dados.totalChamadas) * 100) 
              : 0
          };
        }
        
        return resultado;
      },

      resetar: () => {
        metricas.clear();
      }
    };
  }
}

// Instância global do monitor de performance
export const siscomexPerformanceMonitor = SiscomexUtils.criarMonitorPerformance();