// backend/src/routes/ia.routes.ts
import { Router } from 'express';
import { sugerirAtributos } from '../controllers/ia.controller';
import { authMiddleware } from '../middlewares/auth.middleware';
import { validate } from '../middlewares/validate.middleware';
import { sugerirAtributosSchema } from '../validators/ia.validator';

const router = Router();

router.use(authMiddleware);
router.post('/atributos/sugerir', validate(sugerirAtributosSchema), sugerirAtributos);

export default router;

