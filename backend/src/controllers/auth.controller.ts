// src/controllers/auth.controller.ts
import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { generateToken } from '../utils/jwt';
import { logger } from '../utils/logger';
import aprMd5 from 'apache-md5';

const prisma = new PrismaClient();
// Lê o salt do arquivo .env com fallback para o valor original
const LEGACY_SALT = process.env.LEGACY_PASSWORD_SALT || "$1$Legicex$";

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
    const user = await prisma.user.findUnique({ 
      where: { email },
      select: {
        id: true,
        name: true,
        email: true,
        password: true
      }
    });
    
    if (!user) {
      return res.status(401).json({ error: 'Credenciais inválidas.' });
    }

    // Armazenado no banco: apenas a parte após o salt
    const hashPartFromDB = user.password;
    
    // Reconstruindo o hash completo (salt + parte armazenada)
    const fullHash = LEGACY_SALT + hashPartFromDB;
    
    let isValid = false;
    
    try {
      // Gera o hash com o salt específico
      const calculatedHash = aprMd5(password, LEGACY_SALT);
      
      // Compara o hash gerado com o hash completo
      isValid = calculatedHash === fullHash;
      console.log("Verificação: " + isValid);
    } catch (e) {
      logger.error('Erro ao verificar senha:', e);
    }
    
    if (!isValid) {
      return res.status(401).json({ error: 'Credenciais inválidas.' });
    }

    // Gera o token JWT - IMPORTANTE: mudamos a estrutura para incluir "id" diretamente
    const token = generateToken({ 
      id: user.id,
      name: user.name,
      email: user.email 
    });

    return res.status(200).json({ 
      token, 
      user: {
        id: user.id,
        name: user.name,
        email: user.email
      },
      message: 'Login realizado com sucesso!' 
    });
  } catch (error) {
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

    // O payload do token agora é o próprio usuário
    // Certifique-se de que req.user.id existe
    if (!req.user.id) {
      logger.error('Token não contém ID do usuário:', req.user);
      return res.status(401).json({ error: 'Token inválido - ID do usuário não encontrado' });
    }

    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true,
        email: true,
        name: true
      }
    });

    if (!user) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    return res.status(200).json(user);
  } catch (error) {
    logger.error('Erro ao buscar usuário autenticado:', error);
    return res.status(500).json({ error: 'Erro interno ao buscar usuário' });
  }
}