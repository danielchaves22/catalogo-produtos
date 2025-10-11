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
  // No payload, o campo "email" representa o identificador do usuário (pode não ser um e-mail)
  const { email, password } = req.body;
  const usuario = email as string;

  if (!usuario || !password) {
    return res.status(400).json({ error: 'Usuário e senha são obrigatórios.' });
  }

  logger.info(`Tentativa de login para usuário ${usuario} - IP: ${req.ip}`);

  try {
    // Busca o usuário pelo identificador (email/username) na base legada
    const user = await authService.findUserByEmail(usuario);

    if (!user) {
      logger.warn(`Login falhou para usuário ${usuario} - não encontrado - IP: ${req.ip}`);
      return res.status(401).json({ error: 'Credenciais inválidas.' });
    }

    // Verifica a senha
    const isValid = authService.verifyPassword(password, user.password);

    if (!isValid) {
      logger.warn(`Login falhou para usuário ${usuario} - senha incorreta - IP: ${req.ip}`);
      return res.status(401).json({ error: 'Credenciais inválidas.' });
    }

    // Remove a senha do objeto
    const { password: _pwd, ...userData } = user;

    // Registra/atualiza o usuário no catálogo
    await authService.registerUserLogin(userData);

    // Gera o token JWT
    const token = generateToken(userData);

    logger.info(`Login bem-sucedido para usuário ${usuario} - IP: ${req.ip}`);
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
    const user = await authService.findUserById(req.user.id, {
      role: req.user.role,
      email: req.user.email,
    });

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

