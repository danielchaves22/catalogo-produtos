// backend/src/validators/ia.validator.ts
import { z } from 'zod';

const dominioSchema = z.object({
  codigo: z.string().min(1),
  descricao: z.string().nullable().optional()
});

const atributoSchema = z.object({
  codigo: z.string().min(1),
  nome: z.string().min(1),
  tipo: z.string().min(1),
  obrigatorio: z.boolean().optional(),
  multivalorado: z.boolean().optional(),
  dominio: z.array(dominioSchema).optional(),
  validacoes: z.record(z.any()).optional(),
  condicao: z.any().optional(),
  descricaoCondicao: z.string().optional(),
  parentCodigo: z.string().optional(),
  condicionanteCodigo: z.string().optional()
});

export const sugerirAtributosSchema = z.object({
  descricao: z.string().min(10),
  atributos: z.array(atributoSchema).min(1),
  ncm: z.string().length(8).optional(),
  modalidade: z.string().min(1).optional(),
  maxTokensResposta: z.number().int().positive().max(800).optional()
});

