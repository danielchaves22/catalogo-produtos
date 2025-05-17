// backend/src/services/auth.service.ts
import { User } from '@prisma/client';
import { legacyPrisma } from '../utils/prisma';
import { logger } from '../utils/logger';
import aprMd5 from 'apache-md5';

export interface UserData {
  id: number;
  name: string;
  email: string;
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
  async findUserByEmail(email: string): Promise<User | null> {
    try {
      return await legacyPrisma.user.findUnique({ 
        where: { email }
      });
    } catch (error: unknown) {
      logger.error(`Erro ao buscar usuário por email: ${email}`, error);
      throw new Error('Falha ao buscar usuário');
    }
  }

  /**
   * Busca um usuário pelo ID
   */
  async findUserById(id: number): Promise<User | null> {
    try {
      return await legacyPrisma.user.findUnique({
        where: { id }
      });
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
  formatUserData(user: User): UserData {
    return {
      id: user.id,
      name: user.name,
      email: user.email
    };
  }
}