// src/app.ts
import express from 'express';
import cors from 'cors';
import { json, urlencoded } from 'body-parser';

import authRoutes from './routes/auth.routes';
import catalogoRoutes from './routes/catalogo.routes';
import certificadoRoutes from './routes/certificado.routes';
import produtoRoutes from './routes/produto.routes';
import { authMiddleware } from './middlewares/auth.middleware';
import { setupSwagger } from './swagger';
import siscomexRoutes from './routes/siscomex.routes';
import operadorEstrangeiroRoutes from './routes/operador-estrangeiro.routes';
import dashboardRoutes from './routes/dashboard.routes';
import usuarioRoutes from './routes/usuario.routes';
import { Router } from 'express';
import { API_PREFIX } from './config';
import uploadRoutes from './routes/upload.routes';
import mensagemRoutes from './routes/mensagem.routes';
import ncmValoresPadraoRoutes from './routes/ncm-valores-padrao.routes';

const app = express();

// Middleware básicos
app.use(cors());
app.use(json());
app.use(urlencoded({ extended: true }));

// Swagger para documentação da API
setupSwagger(app);

const apiRouter = Router();

// Rotas de autenticação (públicas)
apiRouter.use('/auth', authRoutes);

// Rota de teste de upload (pública)
apiRouter.use('/upload', uploadRoutes);

// Rotas de catálogos (protegidas)
apiRouter.use('/catalogos', catalogoRoutes);
// Rotas de certificados (protegidas)
apiRouter.use('/certificados', certificadoRoutes);

// Rotas SISCOMEX (protegidas)
apiRouter.use('/siscomex', siscomexRoutes);

// Rotas de operadores estrangeiros (protegidas)
apiRouter.use('/operadores-estrangeiros', operadorEstrangeiroRoutes);

// Rotas de produtos (protegidas)
apiRouter.use('/produtos', produtoRoutes);

// Rotas de valores padrão por NCM (protegidas)
apiRouter.use('/ncm-valores-padrao', ncmValoresPadraoRoutes);

// Rotas de usuários (protegidas)
apiRouter.use('/usuarios', usuarioRoutes);

// Rotas de painel (protegidas)
apiRouter.use('/dashboard', dashboardRoutes);

// Rotas de mensagens (protegidas)
apiRouter.use('/mensagens', mensagemRoutes);

// Middleware de autenticação para rotas protegidas
apiRouter.use('/protected', authMiddleware, (req, res) => {
  // Esta rota é apenas para testar a autenticação
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

app.use(API_PREFIX, apiRouter);

export default app;
