import { z } from 'zod';

export const uploadCertificadoSchema = z.object({
  nome: z.string().min(1, { message: 'Nome e obrigatorio' }),
  fileContent: z.string().min(1, { message: 'Arquivo e obrigatorio' }),
  password: z.string().min(1, { message: 'Senha e obrigatoria' }),
  tentarCorrigir: z.boolean().optional().default(true),
});

export const vincularCertificadoSchema = z.object({
  certificadoId: z.coerce.number(),
});
