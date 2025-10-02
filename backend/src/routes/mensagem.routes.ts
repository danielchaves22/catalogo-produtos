// backend/src/routes/mensagem.routes.ts
import { Router } from 'express';
import { authMiddleware } from '../middlewares/auth.middleware';
import {
  listarMensagens,
  obterMensagem,
  marcarMensagemComoLida,
  resumoNaoLidas,
  contarNaoLidas,
  listarCategorias,
  removerMensagem,
} from '../controllers/mensagem.controller';

const router = Router();

router.use(authMiddleware);

router.get('/categorias', listarCategorias);
router.get('/resumo-nao-lidas', resumoNaoLidas);
router.get('/contagem-nao-lidas', contarNaoLidas);
router.get('/', listarMensagens);
router.get('/:id', obterMensagem);
router.patch('/:id/lida', marcarMensagemComoLida);
router.delete('/:id', removerMensagem);

export default router;
