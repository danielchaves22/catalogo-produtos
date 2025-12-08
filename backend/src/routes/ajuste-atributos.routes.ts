import { Router } from 'express';
import { authMiddleware } from '../middlewares/auth.middleware';
import {
  detalharVerificacaoAtributos,
  iniciarVerificacaoAtributos,
  listarVerificacoesAtributos,
} from '../controllers/ajuste-atributos.controller';

const router = Router();

router.use(authMiddleware);
router.get('/verificacoes', listarVerificacoesAtributos);
router.post('/verificacoes', iniciarVerificacaoAtributos);
router.get('/verificacoes/:id', detalharVerificacaoAtributos);

export default router;
