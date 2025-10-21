import { Router } from 'express';
import { authMiddleware } from '../middlewares/auth.middleware';
import { validate } from '../middlewares/validate.middleware';
import {
  listarPreenchimentosMassa,
  obterPreenchimentoMassa,
  criarPreenchimentoMassa
} from '../controllers/atributo-preenchimento-massa.controller';
import { createAtributoPreenchimentoMassaSchema } from '../validators/atributo-preenchimento-massa.validator';

const router = Router();

router.use(authMiddleware);

router.get('/', listarPreenchimentosMassa);
router.get('/:id', obterPreenchimentoMassa);
router.post('/', validate(createAtributoPreenchimentoMassaSchema), criarPreenchimentoMassa);

export default router;
