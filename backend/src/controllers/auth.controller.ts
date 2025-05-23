// backend/src/controllers/auth.controller.ts
import { Request, Response } from 'express';
import { AuthService } from '../services/auth.service';
import { generateToken } from '../utils/jwt';
import { logger } from '../utils/logger';

// Instancia o serviço de autenticação
const authService = new AuthService();

/**
 * POST /api/auth/login
 * Autenticação com Apache Md5Crypt para banco legado
 */
export async function login(req: Request, res: Response) {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email e password são obrigatórios.' });
  }

  try {
    // Busca o usuário pelo email
    const user = await authService.findUserByEmail(email);
    
    if (!user) {
      return res.status(401).json({ error: 'Credenciais inválidas.' });
    }

    // Verifica a senha
    const isValid = authService.verifyPassword(password, user.password);
    
    if (!isValid) {
      return res.status(401).json({ error: 'Credenciais inválidas.' });
    }

    // Formata dados do usuário
    const userData = authService.formatUserData(user);

    // Gera o token JWT
    const token = generateToken(userData);

    return res.status(200).json({ 
      token, 
      user: userData,
      message: 'Login realizado com sucesso!' 
    });
  } catch (error: unknown) {
    logger.error('Erro no login:', error);
    return res.status(500).json({ error: 'Erro interno ao realizar login.' });
  }
}

/**
 * GET /api/auth/me
 * Retorna informações do usuário autenticado
 */
export async function getAuthUser(req: Request, res: Response) {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Não autenticado' });
    }

    if (!req.user.id) {
      logger.error('Token não contém ID do usuário:', req.user);
      return res.status(401).json({ error: 'Token inválido - ID do usuário não encontrado' });
    }

    // Busca o usuário pelo ID
    const user = await authService.findUserById(req.user.id);

    if (!user) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    // Retorna dados formatados
    return res.status(200).json(authService.formatUserData(user));
  } catch (error: unknown) {
    logger.error('Erro ao buscar usuário autenticado:', error);
    return res.status(500).json({ error: 'Erro interno ao buscar usuário' });
  }
}