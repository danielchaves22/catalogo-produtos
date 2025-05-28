// backend/src/validators/operador-estrangeiro.validator.ts
import { z } from 'zod';
import { customValidations } from '../utils/validation';

const identificacaoAdicionalSchema = z.object({
  numero: z.string().min(1, { message: 'Número é obrigatório' }),
  agenciaEmissoraCodigo: z.string().min(1, { message: 'Agência emissora é obrigatória' })
});

export const createOperadorEstrangeiroSchema = z.object({
  cnpjRaizResponsavel: z.string()
    .min(8, { message: 'CNPJ Raiz deve ter pelo menos 8 caracteres' })
    .refine(customValidations.cnpj, { message: 'CNPJ Raiz inválido' }),
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
  situacao: z.enum(['ATIVO', 'INATIVO', 'DESATIVADO']).default('ATIVO'),
  dataReferencia: z.string().datetime().optional().transform(val => val ? new Date(val) : undefined),
  identificacoesAdicionais: z.array(identificacaoAdicionalSchema).optional()
});

export const updateOperadorEstrangeiroSchema = z.object({
  cnpjRaizResponsavel: z.string()
    .min(8)
    .refine(customValidations.cnpj, { message: 'CNPJ Raiz inválido' })
    .optional(),
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
  situacao: z.enum(['ATIVO', 'INATIVO', 'DESATIVADO']).optional(),
  dataReferencia: z.string().datetime().optional().transform(val => val ? new Date(val) : undefined),
  identificacoesAdicionais: z.array(identificacaoAdicionalSchema).optional()
});