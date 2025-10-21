import { z } from 'zod';

export const createAtributoPreenchimentoMassaSchema = z.object({
  ncmCodigo: z.string().length(8),
  modalidade: z.string().min(1).optional(),
  catalogoIds: z.array(z.number().int().positive()).optional(),
  valoresAtributos: z.record(z.any()).optional(),
  estruturaSnapshot: z.any().optional(),
  produtosExcecao: z
    .array(
      z.object({
        id: z.number().int().positive()
      })
    )
    .optional()
});
