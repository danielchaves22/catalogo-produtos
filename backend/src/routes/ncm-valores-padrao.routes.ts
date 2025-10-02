// backend/src/routes/ncm-valores-padrao.routes.ts
import { Router } from 'express';
import { authMiddleware } from '../middlewares/auth.middleware';
import { validate } from '../middlewares/validate.middleware';
import {
  listarValoresPadrao,
  obterValorPadrao,
  buscarValorPadraoPorNcm,
  criarValorPadrao,
  atualizarValorPadrao,
  removerValorPadrao
} from '../controllers/ncm-valores-padrao.controller';
import {
  createNcmValoresPadraoSchema,
  updateNcmValoresPadraoSchema
} from '../validators/ncm-valores-padrao.validator';

const router = Router();

router.use(authMiddleware);

router.get('/', listarValoresPadrao);
router.get('/ncm/:ncmCodigo', buscarValorPadraoPorNcm);
router.get('/:id', obterValorPadrao);
router.post('/', validate(createNcmValoresPadraoSchema), criarValorPadrao);
router.put('/:id', validate(updateNcmValoresPadraoSchema), atualizarValorPadrao);
router.delete('/:id', removerValorPadrao);

export default router;
