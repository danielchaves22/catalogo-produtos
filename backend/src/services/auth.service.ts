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
  private readonly adminTruthies = new Set(['1', 'true', 's', 'sim']);

  constructor() {
    // Lê o salt do arquivo .env com fallback para o valor original
    this.LEGACY_SALT = process.env.LEGACY_PASSWORD_SALT || '$1$Legicex$';
  }

  private isLegacyAdminFlagEnabled(value: unknown): boolean {
    if (value === null || value === undefined) {
      return false;
    }

    if (typeof value === 'boolean') {
      return value;
    }

    if (typeof value === 'number') {
      return value === 1;
    }

    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      return this.adminTruthies.has(normalized);
    }

    return false;
  }

  /**
   * Busca um usuário pelo identificador (email/username)
   */
  async findUserByEmail(email: string): Promise<AuthUserWithPassword | null> {
    const identifier = (email ?? '').trim();
    try {
      // SUPER (tabela comex): campo "email" mapeia para coluna "username" no legado
      const user = await legacyPrisma.user.findFirst({
        // Em MySQL, sensibilidade a maiúsculas depende da collation da coluna
        where: { email: { equals: identifier } },
      });
      if (user) {
        return {
          id: user.id,
          name: user.name,
          email: user.email,
          superUserId: user.id,
          role: 'SUPER',
          catprodAdmFull: this.isLegacyAdminFlagEnabled(user.catprodAdmFull),
          password: user.password,
        };
      }

      // SUB (tabela comex_subsessoes): identificador armazenado em "email" (pode não ser um email real)
      const sub = await legacyPrisma.subUsuario.findFirst({
        where: { email: { equals: identifier } },
      });
      if (sub) {
        return {
          id: sub.id,
          name: sub.email,
          email: sub.email,
          superUserId: sub.superUserId,
          role: 'SUB',
          catprodAdmFull: false,
          password: sub.password,
        };
      }

      return null;
    } catch (error: unknown) {
      logger.error(`Erro ao buscar usuário por identificador: ${identifier}`, error);
      throw new Error('Falha ao buscar usuário');
    }
  }

  /**
   * Busca um usuário pelo ID
   */
  async findUserById(
    id: number,
    options: { role?: AuthUser['role']; email?: string } = {}
  ): Promise<AuthUser | null> {
    const normalizedEmail = options.email?.trim();
    const role = options.role;
    try {
      if (role === 'SUPER' || (!role && !normalizedEmail)) {
        const user = await legacyPrisma.user.findUnique({ where: { id } });
        if (user && (!normalizedEmail || user.email === normalizedEmail)) {
          return {
            id: user.id,
            name: user.name,
            email: user.email,
            superUserId: user.id,
            role: 'SUPER',
            catprodAdmFull: this.isLegacyAdminFlagEnabled(user.catprodAdmFull),
          };
        }
        if (role === 'SUPER') {
          return null;
        }
      }

      if (role === 'SUB' || !role) {
        const sub = await legacyPrisma.subUsuario.findUnique({ where: { id } });
        if (sub && (!normalizedEmail || sub.email === normalizedEmail)) {
          return {
            id: sub.id,
            name: sub.email,
            email: sub.email,
            superUserId: sub.superUserId,
            role: 'SUB',
            catprodAdmFull: false,
          };
        }
        if (role === 'SUB') {
          return null;
        }
      }

      if (normalizedEmail) {
        const user = await legacyPrisma.user.findFirst({
          where: { id, email: { equals: normalizedEmail } },
        });
        if (user) {
          return {
            id: user.id,
            name: user.name,
            email: user.email,
            superUserId: user.id,
            role: 'SUPER',
            catprodAdmFull: this.isLegacyAdminFlagEnabled(user.catprodAdmFull),
          };
        }

        const sub = await legacyPrisma.subUsuario.findFirst({
          where: { id, email: { equals: normalizedEmail } },
        });
        if (sub) {
          return {
            id: sub.id,
            name: sub.email,
            email: sub.email,
            superUserId: sub.superUserId,
            role: 'SUB',
            catprodAdmFull: false,
          };
        }
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
      // Reconstrói o hash completo (salt + parte armazenada)
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
