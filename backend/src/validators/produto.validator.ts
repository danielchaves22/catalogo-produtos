// backend/src/validators/produto.validator.ts
import { z } from 'zod';

export const createProdutoSchema = z.object({
  codigo: z.string().min(1),
  ncmCodigo: z.string().length(8),
  modalidade: z.string().min(1),
  valoresAtributos: z.record(z.any()).optional(),
  criadoPor: z.string().optional()
});
