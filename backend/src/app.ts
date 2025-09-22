// src/app.ts (ATUALIZADO)
import express from 'express';
import cors from 'cors';
import { json, urlencoded } from 'body-parser';

import authRoutes from './routes/auth.routes';
import catalogoRoutes from './routes/catalogo.routes';
import certificadoRoutes from './routes/certificado.routes';
import produtoRoutes from './routes/produto.routes';
import siscomexRoutes from './routes/siscomex.routes';
import siscomexExportRoutes from './routes/siscomex-export.routes'; // NOVO
import operadorEstrangeiroRoutes from './routes/operador-estrangeiro.routes';
import dashboardRoutes from './routes/dashboard.routes';
import usuarioRoutes from './routes/usuario.routes';
import uploadRoutes from './routes/upload.routes';

import { authMiddleware } from './middlewares/auth.middleware';
import { setupSwagger } from './swagger';
import { Router } from 'express';
import { API_PREFIX } from './config';
import { logger } from './utils/logger';

const app = express();

// Middleware básicos
app.use(cors());
app.use(json({ limit: '50mb' })); // Aumentado para suportar arquivos maiores
app.use(urlencoded({ extended: true, limit: '50mb' }));

// Middleware de logging para requisições
app.use((req, res, next) => {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.info(`${req.method} ${req.originalUrl} - ${res.statusCode} - ${duration}ms`);
  });
  
  next();
});

// Swagger para documentação da API
setupSwagger(app);

const apiRouter = Router();

// Rotas de autenticação (públicas)
apiRouter.use('/auth', authRoutes);

// Rota de teste de upload (pública)
apiRouter.use('/upload', uploadRoutes);

// Middleware de autenticação para rotas protegidas
const protectedRouter = Router();
protectedRouter.use(authMiddleware);

// Rotas de catálogos (protegidas)
protectedRouter.use('/catalogos', catalogoRoutes);

// Rotas de certificados (protegidas)
protectedRouter.use('/certificados', certificadoRoutes);

// Rotas SISCOMEX (protegidas)
protectedRouter.use('/siscomex', siscomexRoutes);

// NOVAS ROTAS - Exportação SISCOMEX (protegidas)
protectedRouter.use('/siscomex/export', siscomexExportRoutes);

// Rotas de operadores estrangeiros (protegidas)
protectedRouter.use('/operadores-estrangeiros', operadorEstrangeiroRoutes);

// Rotas de produtos (protegidas)
protectedRouter.use('/produtos', produtoRoutes);

// Rotas de usuários (protegidas)
protectedRouter.use('/usuarios', usuarioRoutes);

// Rotas de painel (protegidas)
protectedRouter.use('/dashboard', dashboardRoutes);

// Rota de teste de autenticação (protegida)
protectedRouter.get('/protected', (req, res) => {
  res.json({
    message: 'Você está autenticado!',
    user: {
      id: req.user?.id,
      name: req.user?.name,
      email: req.user?.email,
      superUserId: req.user?.superUserId,
      role: req.user?.role
    }
  });
});

// NOVA ROTA - Status geral do sistema
protectedRouter.get('/system/status', async (req, res) => {
  try {
    const { SiscomexService } = await import('./services/siscomex.service');
    const siscomexService = new SiscomexService();
    
    const siscomexStatus = await siscomexService.verificarConexao();
    
    const status = {
      api: {
        status: 'online',
        timestamp: new Date().toISOString(),
        version: process.env.API_VERSION || 'v1',
        environment: process.env.APP_ENV || 'local'
      },
      siscomex: siscomexStatus,
      services: {
        database: 'connected', // Assumindo que chegou até aqui
        storage: process.env.APP_ENV === 'local' ? 'local' : 's3',
        certificates: !!process.env.SISCOMEX_CERT_PATH
      }
    };

    res.json({
      success: true,
      status
    });
  } catch (error) {
    logger.error('Erro ao verificar status do sistema:', error);
    res.status(500).json({
      success: false,
      error: 'Erro ao verificar status do sistema'
    });
  }
});

// NOVA ROTA - Informações de debug (apenas em desenvolvimento)
if (process.env.NODE_ENV === 'development') {
  protectedRouter.get('/debug/info', (req, res) => {
    const debugInfo = {
      environment: {
        NODE_ENV: process.env.NODE_ENV,
        APP_ENV: process.env.APP_ENV,
        PORT: process.env.PORT,
        API_VERSION: process.env.API_VERSION
      },
      siscomex: {
        api_url: process.env.SISCOMEX_API_URL,
        ambiente: process.env.SISCOMEX_AMBIENTE,
        cert_configured: !!process.env.SISCOMEX_CERT_PATH,
        key_configured: !!process.env.SISCOMEX_KEY_PATH
      },
      storage: {
        type: process.env.APP_ENV === 'local' ? 'local' : 's3',
        bucket: process.env.S3_BUCKET_NAME || 'local'
      },
      database: {
        catalog_schema: process.env.CATALOG_SCHEMA_NAME || 'catpro-hml',
        legacy_schema: 'legicex_2'
      },
      user: {
        id: req.user?.id,
        role: req.user?.role,
        superUserId: req.user?.superUserId
      },
      timestamp: new Date().toISOString()
    };

    res.json({
      success: true,
      debug: debugInfo
    });
  });
}

// Aplica todas as rotas protegidas
apiRouter.use(protectedRouter);

// Middleware de tratamento de erros global
apiRouter.use((error: any, req: any, res: any, next: any) => {
  logger.error('Erro não tratado na API:', {
    error: error.message,
    stack: error.stack,
    url: req.originalUrl,
    method: req.method,
    user: req.user?.id
  });

  // Não expor detalhes do erro em produção
  const isDevelopment = process.env.NODE_ENV === 'development';
  
  res.status(500).json({
    success: false,
    message: 'Erro interno do servidor',
    ...(isDevelopment && {
      error: error.message,
      stack: error.stack
    })
  });
});

// Middleware para rotas não encontradas
apiRouter.use('*', (req, res) => {
  logger.warn(`Rota não encontrada: ${req.method} ${req.originalUrl}`);
  
  res.status(404).json({
    success: false,
    message: 'Rota não encontrada',
    availableRoutes: [
      '/auth/login',
      '/auth/me',
      '/catalogos',
      '/certificados',
      '/produtos',
      '/operadores-estrangeiros',
      '/siscomex',
      '/siscomex/export', // NOVA ROTA
      '/usuarios',
      '/dashboard',
      '/system/status' // NOVA ROTA
    ]
  });
});

// Aplica o prefixo da API
app.use(API_PREFIX, apiRouter);

// Rota de health check básica (sem autenticação)
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: process.env.API_VERSION || 'v1'
  });
});

// Middleware final para capturar qualquer erro não tratado
app.use((error: any, req: any, res: any, next: any) => {
  logger.error('Erro crítico não tratado:', {
    error: error.message,
    stack: error.stack,
    url: req.originalUrl
  });

  res.status(500).json({
    success: false,
    message: 'Erro crítico do sistema'
  });
});

export default app;