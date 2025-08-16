// src/middlewares/auth.middleware.ts
import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../utils/jwt';
import { AuthUser } from '../interfaces/auth-user';

export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;

  if (!authHeader) return res.status(401).json({ error: 'Token não fornecido' });

  const parts = authHeader.split(' ');
  
  if (parts.length !== 2)
    return res.status(401).json({ error: 'Erro no formato do token' });

  const [scheme, token] = parts;

  if (!/^Bearer$/i.test(scheme))
    return res.status(401).json({ error: 'Token mal formatado' });

  try {
    const decoded = verifyToken(token) as AuthUser;
    if (!decoded.superUserId) {
      return res.status(401).json({ error: 'Identificador do superusuário ausente' });
    }
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Token inválido' });
  }
}