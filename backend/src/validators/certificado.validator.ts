import { z } from 'zod';

export const uploadCertificadoSchema = z.object({
  nome: z.string().min(1, { message: 'Nome é obrigatório' }),
  fileContent: z.string().min(1, { message: 'Arquivo é obrigatório' }),
  password: z.string().min(1, { message: 'Senha é obrigatória' })
});

export const vincularCertificadoSchema = z.object({
  certificadoId: z.coerce.number()
});
