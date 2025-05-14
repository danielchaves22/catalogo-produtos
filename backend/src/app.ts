// src/app.ts - Versão simplificada
import express from 'express';
import cors from 'cors';
import { json, urlencoded } from 'body-parser';

import authRoutes from './routes/auth.routes';
import { authMiddleware } from './middlewares/auth.middleware';
import { setupSwagger } from './swagger';
import { metricsMiddleware, metricsEndpoint } from './metrics';

const app = express();

// Middleware básicos
app.use(cors());
app.use(json());
app.use(urlencoded({ extended: true }));
app.use(metricsMiddleware);

// Swagger para documentação da API
setupSwagger(app);

// Endpoint de métricas
app.get('/metrics', metricsEndpoint);

// Rotas de autenticação (públicas)
app.use('/api/auth', authRoutes);

// Middleware de autenticação para rotas protegidas
app.use('/api/protected', authMiddleware, (req, res) => {
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

export default app;