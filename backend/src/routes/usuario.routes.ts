// backend/src/routes/usuario.routes.ts
import { Router } from 'express';
import { listarSubUsuarios, obterSubUsuario, atualizarPermissoes } from '../controllers/usuario.controller';
import { authMiddleware } from '../middlewares/auth.middleware';
import { validate } from '../middlewares/validate.middleware';
import { updatePermissoesSchema } from '../validators/usuario.validator';

const router = Router();

router.use(authMiddleware);

router.get('/', listarSubUsuarios);
router.get('/:id', obterSubUsuario);
router.put('/:id/permissoes', validate(updatePermissoesSchema), atualizarPermissoes);

export default router;
