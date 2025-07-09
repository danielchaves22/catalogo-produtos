// backend/src/validators/produto.validator.ts
import { z } from 'zod';

export const createProdutoSchema = z.object({
  codigo: z.string().min(1),
  ncmCodigo: z.string().length(8),
  modalidade: z.string().min(1),
  valoresAtributos: z.record(z.any()).optional(),
  criadoPor: z.string().optional()
});

export const updateProdutoSchema = z.object({
  ncmCodigo: z.string().length(8).optional(),
  modalidade: z.string().min(1).optional(),
  status: z.enum(['RASCUNHO', 'ATIVO', 'INATIVO']).optional(),
  valoresAtributos: z.record(z.any()).optional(),
  atualizadoPor: z.string().optional()
});
