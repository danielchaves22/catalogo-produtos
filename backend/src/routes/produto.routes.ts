import { Router } from 'express';
import { authMiddleware } from '../middlewares/auth.middleware';
import { listarProdutos, criarProduto, obterEstrutura } from '../controllers/produto.controller';

const router = Router();

router.use(authMiddleware);

router.get('/', listarProdutos);
router.post('/', criarProduto);
router.get('/atributos/:ncm', obterEstrutura);

export default router;
