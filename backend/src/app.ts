// src/app.ts
import express from 'express';
import cors from 'cors';
import { json, urlencoded } from 'body-parser';

import authRoutes from './routes/auth.routes';
import catalogoRoutes from './routes/catalogo.routes';
import { authMiddleware } from './middlewares/auth.middleware';
import { setupSwagger } from './swagger';
import siscomexRoutes from './routes/siscomex.routes';
import operadorEstrangeiroRoutes from './routes/operador-estrangeiro.routes';
import { Router } from 'express';
import { API_PREFIX } from './config';

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

// Rotas de catálogos (protegidas)
apiRouter.use('/catalogos', catalogoRoutes);

// Rotas SISCOMEX (protegidas)
apiRouter.use('/siscomex', siscomexRoutes);

// Rotas de operadores estrangeiros (protegidas)
apiRouter.use('/operadores-estrangeiros', operadorEstrangeiroRoutes);

// Middleware de autenticação para rotas protegidas
apiRouter.use('/protected', authMiddleware, (req, res) => {
  // Esta rota é apenas para testar a autenticação
  res.json({
    message: 'Você está autenticado!',
    user: {
      id: req.user?.id,
      name: req.user?.name,
      email: req.user?.email
    }
  });
});

app.use(API_PREFIX, apiRouter);

export default app;
