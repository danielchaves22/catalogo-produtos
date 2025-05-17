// src/validators/catalogo.validator.ts
import { z } from 'zod';

export const createCatalogoSchema = z.object({
  nome: z.string().min(1, { message: 'Nome é obrigatório' }),
  cpf_cnpj: z.string().optional(),
  status: z.enum(['ATIVO', 'INATIVO'], {
    message: 'Status deve ser ATIVO ou INATIVO'
  })
});

export const updateCatalogoSchema = z.object({
  nome: z.string().min(1, { message: 'Nome é obrigatório' }),
  cpf_cnpj: z.string().optional(),
  status: z.enum(['ATIVO', 'INATIVO'], {
    message: 'Status deve ser ATIVO ou INATIVO'
  })
});