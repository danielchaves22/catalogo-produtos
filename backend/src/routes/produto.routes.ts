// backend/src/routes/produto.routes.ts
import { Router } from 'express';
import { listarProdutos, obterProduto, criarProduto } from '../controllers/produto.controller';
import { authMiddleware } from '../middlewares/auth.middleware';
import { validate } from '../middlewares/validate.middleware';
import { createProdutoSchema } from '../validators/produto.validator';

const router = Router();

router.use(authMiddleware);

router.get('/', listarProdutos);
router.get('/:id', obterProduto);
router.post('/', validate(createProdutoSchema), criarProduto);

export default router;
