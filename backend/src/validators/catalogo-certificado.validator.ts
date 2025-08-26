import { z } from 'zod';

export const uploadCertificadoSchema = z.object({
  fileContent: z.string().min(1, { message: 'Arquivo é obrigatório' }),
  password: z.string().min(1, { message: 'Senha é obrigatória' })
});
