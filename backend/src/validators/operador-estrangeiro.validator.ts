// backend/src/validators/operador-estrangeiro.validator.ts - CORRIGIDO
import { z } from 'zod';
import { customValidations } from '../utils/validation';

const identificacaoAdicionalSchema = z.object({
  numero: z.string().min(1, { message: 'Número é obrigatório' }),
  agenciaEmissoraCodigo: z.string().min(1, { message: 'Agência emissora é obrigatória' })
});

export const createOperadorEstrangeiroSchema = z.object({
  catalogoId: z.number({ required_error: 'Catálogo é obrigatório' }),
  paisCodigo: z.string().min(1, { message: 'País é obrigatório' }),
  tin: z.string().optional(),
  nome: z.string().min(1, { message: 'Nome é obrigatório' }),
  email: z.string().email().optional().or(z.literal('')),
  codigoInterno: z.string().optional(),
  codigoPostal: z.string()
    .optional()
    .refine((val) => !val || customValidations.cep(val), { message: 'CEP inválido' }),
  logradouro: z.string().optional(),
  cidade: z.string().optional(),
  subdivisaoCodigo: z.string().optional().or(z.literal('')),
  // Situação inicial como RASCUNHO até a transmissão ao PUCOMEX
  situacao: z.enum(['RASCUNHO', 'ATIVADO', 'DESATIVADO']).default('RASCUNHO'),
  dataReferencia: z.string().datetime().optional().transform(val => val ? new Date(val) : undefined),
  identificacoesAdicionais: z.array(identificacaoAdicionalSchema).optional()
});

export const updateOperadorEstrangeiroSchema = z.object({
  catalogoId: z.number().optional(),
  paisCodigo: z.string().min(1).optional(),
  tin: z.string().optional(),
  nome: z.string().min(1).optional(),
  email: z.string().email().optional().or(z.literal('')),
  codigoInterno: z.string().optional(),
  codigoPostal: z.string()
    .optional()
    .refine((val) => !val || customValidations.cep(val), { message: 'CEP inválido' }),
  logradouro: z.string().optional(),
  cidade: z.string().optional(),
  subdivisaoCodigo: z.string().optional().or(z.literal('')),
  situacao: z.enum(['RASCUNHO', 'ATIVADO', 'DESATIVADO']).optional(),
  dataReferencia: z.string().datetime().optional().transform(val => val ? new Date(val) : undefined),
  identificacoesAdicionais: z.array(identificacaoAdicionalSchema).optional()
});