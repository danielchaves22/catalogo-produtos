// backend/src/middlewares/siscomex.middleware.ts

import { Request, Response, NextFunction } from 'express';
import { siscomexPerformanceMonitor } from '../utils/siscomex-utils';
import { logger } from '../utils/logger';
import { SiscomexValidationUtils } from '../validators/siscomex.validator';

/**
 * Middleware para monitorar performance das operações SISCOMEX
 */
export function siscomexPerformanceMiddleware(operacao: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const startTime = Date.now();
    
    // Intercepta o final da resposta
    const originalSend = res.send;
    
    res.send = function(data: any) {
      const endTime = Date.now();
      const duration = endTime - startTime;
      const sucesso = res.statusCode >= 200 && res.statusCode < 400;
      
      // Registra métricas
      siscomexPerformanceMonitor.registrar(operacao, sucesso, duration);
      
      // Log detalhado para operações SISCOMEX
      const logData = {
        operacao,
        metodo: req.method,
        url: req.originalUrl,
        statusCode: res.statusCode,
        duracao: duration,
        sucesso,
        usuario: req.user?.id,
        timestamp: new Date().toISOString()
      };

      if (sucesso) {
        logger.info(`SISCOMEX ${operacao} - Performance`, logData);
      } else {
        logger.warn(`SISCOMEX ${operacao} - Falha de Performance`, logData);
      }
      
      // Chama o método original
      return originalSend.call(this, data);
    };
    
    next();
  };
}

/**
 * Middleware para validar configuração SISCOMEX antes de operações críticas
 */
export function validarConfiguracaoSiscomex() {
  return (req: Request, res: Response, next: NextFunction) => {
    const validacao = SiscomexValidationUtils.validarConfiguracaoAmbiente();
    
    if (!validacao.valido) {
      logger.error('Tentativa de operação SISCOMEX com configuração inválida', {
        erros: validacao.erros,
        usuario: req.user?.id,
        endpoint: req.originalUrl
      });
      
      return res.status(500).json({
        sucesso: false,
        mensagem: 'Configuração SISCOMEX inválida',
        erros: validacao.erros,
        recomendacao: 'Verifique as variáveis de ambiente do SISCOMEX'
      });
    }
    
    next();
  };
}

/**
 * Middleware para controle de rate limiting específico do SISCOMEX
 */
export function siscomexRateLimitMiddleware() {
  const requestCounts = new Map<string, { count: number; resetTime: number }>();
  const WINDOW_MS = 60 * 1000; // 1 minuto
  const MAX_REQUESTS = 30; // Máximo 30 requisições por minuto por usuário

  return (req: Request, res: Response, next: NextFunction) => {
    const userId = req.user?.id?.toString();
    if (!userId) {
      return res.status(401).json({
        sucesso: false,
        mensagem: 'Usuário não autenticado'
      });
    }

    const now = Date.now();
    const userKey = `siscomex_${userId}`;
    const userRequests = requestCounts.get(userKey);

    // Reset contador se a janela expirou
    if (!userRequests || now > userRequests.resetTime) {
      requestCounts.set(userKey, {
        count: 1,
        resetTime: now + WINDOW_MS
      });
      return next();
    }

    // Verifica se excedeu o limite
    if (userRequests.count >= MAX_REQUESTS) {
      logger.warn(`Rate limit SISCOMEX excedido para usuário ${userId}`, {
        tentativas: userRequests.count,
        endpoint: req.originalUrl
      });

      return res.status(429).json({
        sucesso: false,
        mensagem: 'Muitas requisições SISCOMEX',
        detalhes: `Limite de ${MAX_REQUESTS} requisições por minuto excedido`,
        tentarNovamenteEm: Math.ceil((userRequests.resetTime - now) / 1000)
      });
    }

    // Incrementa contador
    userRequests.count++;
    requestCounts.set(userKey, userRequests);

    // Adiciona headers de rate limit
    res.setHeader('X-RateLimit-Limit', MAX_REQUESTS);
    res.setHeader('X-RateLimit-Remaining', MAX_REQUESTS - userRequests.count);
    res.setHeader('X-RateLimit-Reset', Math.ceil(userRequests.resetTime / 1000));

    next();
  };
}

/**
 * Middleware para verificar status do certificado digital
 */
export function verificarCertificadoMiddleware() {
  let ultimaVerificacao = 0;
  let statusCache: { valido: boolean; diasParaVencer: number } | null = null;
  const CACHE_DURATION = 5 * 60 * 1000; // 5 minutos

  return async (req: Request, res: Response, next: NextFunction) => {
    const agora = Date.now();
    
    // Usa cache se disponível e não expirado
    if (statusCache && (agora - ultimaVerificacao) < CACHE_DURATION) {
      if (!statusCache.valido) {
        return res.status(503).json({
          sucesso: false,
          mensagem: 'Certificado digital inválido ou expirado',
          detalhes: 'Operações SISCOMEX temporariamente indisponíveis'
        });
      }
      
      // Adiciona aviso se certificado expira em breve
      if (statusCache.diasParaVencer <= 7) {
        res.setHeader('X-Certificate-Warning', `Certificado expira em ${statusCache.diasParaVencer} dias`);
      }
      
      return next();
    }

    // Verifica certificado
    try {
      const certificadoPath = process.env.SISCOMEX_CERT_PATH;
      
      if (!certificadoPath) {
        return res.status(503).json({
          sucesso: false,
          mensagem: 'Certificado digital não configurado'
        });
      }

      const { SiscomexUtils } = await import('../utils/siscomex-utils');
      const validacao = await SiscomexUtils.validarCertificadoDigital(certificadoPath);
      
      // Atualiza cache
      statusCache = {
        valido: validacao.valido,
        diasParaVencer: validacao.diasParaVencer
      };
      ultimaVerificacao = agora;

      if (!validacao.valido) {
        logger.error('Certificado SISCOMEX inválido detectado', {
          erros: validacao.erros,
          endpoint: req.originalUrl,
          usuario: req.user?.id
        });

        return res.status(503).json({
          sucesso: false,
          mensagem: 'Certificado digital inválido',
          detalhes: 'Verifique a validade do certificado digital'
        });
      }

      // Avisa se certificado expira em breve
      if (validacao.diasParaVencer <= 7) {
        res.setHeader('X-Certificate-Warning', `Certificado expira em ${validacao.diasParaVencer} dias`);
        
        logger.warn(`Certificado SISCOMEX expira em ${validacao.diasParaVencer} dias`, {
          validTo: validacao.detalhes?.validTo,
          usuario: req.user?.id
        });
      }

      next();

    } catch (error) {
      logger.error('Erro ao verificar certificado SISCOMEX:', error);
      
      return res.status(503).json({
        sucesso: false,
        mensagem: 'Erro ao verificar certificado digital',
        detalhes: 'Operações SISCOMEX temporariamente indisponíveis'
      });
    }
  };
}

/**
 * Middleware para log de auditoria das operações SISCOMEX
 */
export function auditoriaLogMiddleware() {
  return (req: Request, res: Response, next: NextFunction) => {
    const dadosAuditoria = {
      timestamp: new Date().toISOString(),
      usuario: {
        id: req.user?.id,
        email: req.user?.email,
        role: req.user?.role,
        superUserId: req.user?.superUserId
      },
      requisicao: {
        metodo: req.method,
        url: req.originalUrl,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        // Não loga body completo por segurança, apenas metadados
        temBody: !!req.body && Object.keys(req.body).length > 0,
        contentType: req.get('Content-Type')
      }
    };

    // Intercepta resposta para log completo
    const originalSend = res.send;
    
    res.send = function(data: any) {
      const auditCompleta = {
        ...dadosAuditoria,
        resposta: {
          statusCode: res.statusCode,
          timestamp: new Date().toISOString(),
          tamanhoResposta: data ? JSON.stringify(data).length : 0
        },
        duracao: Date.now() - Date.parse(dadosAuditoria.timestamp)
      };

      // Log de auditoria específico para SISCOMEX
      logger.info('SISCOMEX Audit Log', auditCompleta);
      
      return originalSend.call(this, data);
    };

    next();
  };
}

/**
 * Middleware para validar dados antes de envio ao SISCOMEX
 */
export function validarDadosEnvioMiddleware() {
  return (req: Request, res: Response, next: NextFunction) => {
    // Verifica se é operação de envio/inclusão
    const operacoesEnvio = ['POST', 'PUT', 'PATCH'];
    const rotasEnvio = ['/incluir', '/retificar', '/atualizar'];
    
    const isOperacaoEnvio = operacoesEnvio.includes(req.method) && 
                           rotasEnvio.some(rota => req.path.includes(rota));

    if (!isOperacaoEnvio) {
      return next();
    }

    // Validações básicas para dados de envio
    const erros: string[] = [];

    // Verifica se tem dados no body
    if (!req.body || Object.keys(req.body).length === 0) {
      erros.push('Dados obrigatórios não fornecidos');
    }

    // Validações específicas por tipo de operação
    if (req.path.includes('produto')) {
      if (!req.body.denominacaoProduto) {
        erros.push('Denominação do produto é obrigatória');
      }
      
      if (!req.body.ncm || req.body.ncm.length !== 8) {
        erros.push('NCM deve ter 8 dígitos');
      }
      
      if (!req.body.cnpjRaiz || req.body.cnpjRaiz.length !== 8) {
        erros.push('CNPJ raiz deve ter 8 dígitos');
      }
    }

    if (req.path.includes('operador')) {
      if (!req.body.nome) {
        erros.push('Nome do operador é obrigatório');
      }
      
      if (!req.body.pais || req.body.pais.length !== 2) {
        erros.push('Código do país deve ter 2 caracteres');
      }
    }

    if (erros.length > 0) {
      logger.warn('Dados inválidos para envio SISCOMEX', {
        erros,
        endpoint: req.originalUrl,
        usuario: req.user?.id
      });

      return res.status(400).json({
        sucesso: false,
        mensagem: 'Dados inválidos para envio ao SISCOMEX',
        erros
      });
    }

    next();
  };
}

/**
 * Middleware para adicionar contexto SISCOMEX nas requisições
 */
export function contextoSiscomexMiddleware() {
  return (req: Request, res: Response, next: NextFunction) => {
    // Adiciona informações do contexto SISCOMEX
    (req as any).siscomexContext = {
      ambiente: process.env.SISCOMEX_AMBIENTE || 'treinamento',
      apiUrl: process.env.SISCOMEX_API_URL,
      certificadoConfigurado: !!process.env.SISCOMEX_CERT_PATH,
      timestamp: new Date().toISOString(),
      requestId: `siscomex_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    };

    // Adiciona header de request ID para rastreabilidade
    res.setHeader('X-SISCOMEX-Request-ID', (req as any).siscomexContext.requestId);
    
    next();
  };
}

/**
 * Combina todos os middlewares SISCOMEX em uma função utilitária
 */
export function createSiscomexMiddlewareStack(operacao: string) {
  return [
    contextoSiscomexMiddleware(),
    auditoriaLogMiddleware(),
    validarConfiguracaoSiscomex(),
    siscomexRateLimitMiddleware(),
    verificarCertificadoMiddleware(),
    validarDadosEnvioMiddleware(),
    siscomexPerformanceMiddleware(operacao)
  ];
}