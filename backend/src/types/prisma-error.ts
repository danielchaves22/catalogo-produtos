// src/types/prisma-error.ts
/**
 * Interface para erros lançados pelo Prisma
 */
export interface PrismaError extends Error {
  code?: string;
  meta?: Record<string, any>;
  clientVersion?: string;
}