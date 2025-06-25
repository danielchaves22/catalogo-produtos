import { Router } from 'express';
import { listarProdutos, criarProduto } from '../controllers/produto.controller';
import { authMiddleware } from '../middlewares/auth.middleware';

const router = Router();
router.use(authMiddleware);
router.get('/', listarProdutos);
router.post('/', criarProduto);
export default router;
