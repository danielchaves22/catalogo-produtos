// backend/src/validators/ncm-valores-padrao.validator.ts
import { z } from 'zod';

export const createNcmValoresPadraoSchema = z.object({
  ncmCodigo: z.string().length(8),
  modalidade: z.string().min(1).optional(),
  valoresAtributos: z.record(z.any()).optional(),
  estruturaSnapshot: z.any().optional()
});

export const updateNcmValoresPadraoSchema = z.object({
  ncmCodigo: z.string().length(8),
  modalidade: z.string().min(1).optional(),
  valoresAtributos: z.record(z.any()).optional(),
  estruturaSnapshot: z.any().optional()
});
