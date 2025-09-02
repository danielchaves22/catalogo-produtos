// backend/src/services/auth.service.ts
import { legacyPrisma, catalogoPrisma } from '../utils/prisma';
import { logger } from '../utils/logger';
import aprMd5 from 'apache-md5';
import { AuthUser } from '../interfaces/auth-user';

export interface AuthUserWithPassword extends AuthUser {
  password: string;
}

export class AuthService {
  private readonly LEGACY_SALT: string;

  constructor() {
    // Lê o salt do arquivo .env com fallback para o valor original
    this.LEGACY_SALT = process.env.LEGACY_PASSWORD_SALT || "$1$Legicex$";
  }

  /**
   * Busca um usuário pelo email
   */
  async findUserByEmail(email: string): Promise<AuthUserWithPassword | null> {
    try {
      const user = await legacyPrisma.user.findUnique({ where: { email } });
      if (user) {
        return {
          id: user.id,
          name: user.name,
          email: user.email,
          superUserId: user.id,
          role: 'SUPER',
          password: user.password
        };
      }

      const sub = await legacyPrisma.subUsuario.findUnique({ where: { email } });
      if (sub) {
        return {
          id: sub.id,
          name: sub.email,
          email: sub.email,
          superUserId: sub.superUserId,
          role: 'SUB',
          password: sub.password
        };
      }

      return null;
    } catch (error: unknown) {
      logger.error(`Erro ao buscar usuário por email: ${email}`, error);
      throw new Error('Falha ao buscar usuário');
    }
  }

  /**
   * Busca um usuário pelo ID
   */
  async findUserById(id: number): Promise<AuthUser | null> {
    try {
      const user = await legacyPrisma.user.findUnique({ where: { id } });
      if (user) {
        return { id: user.id, name: user.name, email: user.email, superUserId: user.id, role: 'SUPER' };
      }

      const sub = await legacyPrisma.subUsuario.findUnique({ where: { id } });
      if (sub) {
        return { id: sub.id, name: sub.email, email: sub.email, superUserId: sub.superUserId, role: 'SUB' };
      }
      return null;
    } catch (error: unknown) {
      logger.error(`Erro ao buscar usuário por ID: ${id}`, error);
      throw new Error('Falha ao buscar usuário');
    }
  }

  /**
   * Verifica a senha usando o algoritmo Apache MD5
   */
  verifyPassword(inputPassword: string, hashedPassword: string): boolean {
    try {
      // Reconstruindo o hash completo (salt + parte armazenada)
      const fullHash = this.LEGACY_SALT + hashedPassword;
      
      // Gera o hash com o salt específico
      const calculatedHash = aprMd5(inputPassword, this.LEGACY_SALT);
      
      // Compara o hash gerado com o hash completo
      return calculatedHash === fullHash;
    } catch (error: unknown) {
      logger.error('Erro ao verificar senha:', error);
      return false;
    }
  }

  /**
   * Formata os dados do usuário para retorno na API
   */
  formatUserData(user: AuthUser): AuthUser {
    return { ...user };
  }

  /**
   * Registra ou atualiza os dados do usuário no catálogo após login
   */
  async registerUserLogin(user: AuthUser): Promise<void> {
    try {
      await catalogoPrisma.usuarioCatalogo.upsert({
        where: { username: user.email },
        update: {
          nome: user.name,
          legacyId: user.id,
          superUserId: user.superUserId,
          role: user.role,
          ultimoLogin: new Date(),
        },
        create: {
          username: user.email,
          nome: user.name,
          legacyId: user.id,
          superUserId: user.superUserId,
          role: user.role,
          ultimoLogin: new Date(),
        },
      });
    } catch (error: unknown) {
      logger.error(`Erro ao registrar usuário no catálogo: ${user.email}`, error);
    }
  }
}