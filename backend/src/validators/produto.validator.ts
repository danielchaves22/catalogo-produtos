// backend/src/validators/produto.validator.ts
import { z } from 'zod';

export const createProdutoSchema = z.object({
  codigo: z.string().min(1).optional(),
  ncmCodigo: z.string().length(8),
  modalidade: z.string().min(1),
  catalogoId: z.number().int(),
  denominacao: z.string().max(100).min(1),
  descricao: z.string().min(1),
  valoresAtributos: z.record(z.any()).optional(),
  codigosInternos: z
    .array(z.string().max(50))
    .optional()
    .refine(arr => !arr || new Set(arr).size === arr.length, {
      message: 'Códigos internos duplicados não são permitidos'
    }),
  operadoresEstrangeiros: z.array(z.object({
    paisCodigo: z.string().min(2),
    conhecido: z.boolean(),
    operadorEstrangeiroId: z.number().int().optional()
  })).optional(),
  criadoPor: z.string().optional(),
  situacao: z.enum(['RASCUNHO', 'ATIVADO', 'DESATIVADO']).optional()
});

export const updateProdutoSchema = z.object({
  modalidade: z.string().min(1).optional(),
  status: z
    .enum(['PENDENTE', 'APROVADO', 'PROCESSANDO', 'TRANSMITIDO', 'ERRO'])
    .optional(),
  situacao: z.enum(['RASCUNHO', 'ATIVADO', 'DESATIVADO']).optional(),
  denominacao: z.string().max(100).optional(),
  descricao: z.string().optional(),
  valoresAtributos: z.record(z.any()).optional(),
  codigosInternos: z
    .array(z.string().max(50))
    .optional()
    .refine(arr => !arr || new Set(arr).size === arr.length, {
      message: 'Códigos internos duplicados não são permitidos'
    }),
  operadoresEstrangeiros: z.array(z.object({
    paisCodigo: z.string().min(2),
    conhecido: z.boolean(),
    operadorEstrangeiroId: z.number().int().optional()
  })).optional(),
  atualizadoPor: z.string().optional()
});

export const cloneProdutoSchema = z.object({
  catalogoId: z.number().int(),
  denominacao: z.string().max(100).min(1),
  codigosInternos: z
    .array(z.string().max(50))
    .optional()
    .refine(arr => !arr || new Set(arr).size === arr.length, {
      message: 'Códigos internos duplicados não são permitidos'
    })
});
