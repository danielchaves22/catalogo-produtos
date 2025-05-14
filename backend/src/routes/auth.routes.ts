// src/routes/auth.routes.ts
import { Router } from 'express';
import { login, getAuthUser } from '../controllers/auth.controller';
import { authMiddleware } from '../middlewares/auth.middleware';
import { validate } from '../middlewares/validate.middleware';
import { loginSchema } from '../validators/auth.validator';

const router = Router();

// Rota pública - Login
router.post('/login', validate(loginSchema), login);

// Rota protegida - Perfil do usuário
router.get('/me', authMiddleware, getAuthUser);

export default router;