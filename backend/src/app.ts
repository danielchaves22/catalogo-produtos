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

const app = express();

// Middleware básicos
app.use(cors());
app.use(json());
app.use(urlencoded({ extended: true }));

// Swagger para documentação da API
setupSwagger(app);

// Rotas de autenticação (públicas)
app.use('/api/auth', authRoutes);

// Rotas de catálogos (protegidas)
app.use('/api/catalogos', catalogoRoutes);

// Rotas SISCOMEX (protegidas)
app.use('/api/siscomex', siscomexRoutes);

// Rotas de operadores estrangeiros (protegidas)
app.use('/api/operadores-estrangeiros', operadorEstrangeiroRoutes);

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