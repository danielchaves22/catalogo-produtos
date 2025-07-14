// backend/src/validators/produto.validator.ts
import { z } from 'zod';

export const createProdutoSchema = z.object({
  codigo: z.string().min(1).optional(),
  ncmCodigo: z.string().length(8),
  modalidade: z.string().min(1),
  catalogoId: z.number().int(),
  valoresAtributos: z.record(z.any()).optional(),
  codigosInternos: z.array(z.string().max(50)).optional(),
  criadoPor: z.string().optional()
});

export const updateProdutoSchema = z.object({
  modalidade: z.string().min(1).optional(),
  status: z.enum(['RASCUNHO', 'ATIVO', 'INATIVO']).optional(),
  valoresAtributos: z.record(z.any()).optional(),
  codigosInternos: z.array(z.string().max(50)).optional(),
  atualizadoPor: z.string().optional()
});
