// backend/src/routes/produto.routes.ts
import { Router } from 'express';
import {
  listarProdutos,
  obterProduto,
  criarProduto,
  atualizarProduto,
  removerProduto,
  clonarProduto
} from '../controllers/produto.controller';
import { authMiddleware } from '../middlewares/auth.middleware';
import { validate } from '../middlewares/validate.middleware';
import {
  createProdutoSchema,
  updateProdutoSchema,
  cloneProdutoSchema
} from '../validators/produto.validator';

const router = Router();

router.use(authMiddleware);

router.get('/', listarProdutos);
router.get('/:id', obterProduto);
router.post('/', validate(createProdutoSchema), criarProduto);
router.put('/:id', validate(updateProdutoSchema), atualizarProduto);
router.post('/:id/clonar', validate(cloneProdutoSchema), clonarProduto);
router.delete('/:id', removerProduto);

export default router;
