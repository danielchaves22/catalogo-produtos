// backend/src/validators/usuario.validator.ts
import { z } from 'zod';
import { PERMISSOES } from '../constants/permissoes';

export const updatePermissoesSchema = z.object({
  permissoes: z.array(z.enum(PERMISSOES)),
});
