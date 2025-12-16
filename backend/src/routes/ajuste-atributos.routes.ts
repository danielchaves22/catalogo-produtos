import { Router } from 'express';
import { authMiddleware } from '../middlewares/auth.middleware';
import {
  detalharVerificacaoAtributos,
  aplicarAtualizacoesVerificacao,
  iniciarVerificacaoAtributos,
  listarVerificacoesAtributos,
} from '../controllers/ajuste-atributos.controller';

const router = Router();

router.use(authMiddleware);
router.get('/verificacoes', listarVerificacoesAtributos);
router.post('/verificacoes', iniciarVerificacaoAtributos);
router.get('/verificacoes/:id', detalharVerificacaoAtributos);
router.post('/verificacoes/:id/aplicar', aplicarAtualizacoesVerificacao);

export default router;
