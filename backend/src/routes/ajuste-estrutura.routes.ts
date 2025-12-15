import { Router } from 'express';
import {
  contarProdutosComAjuste,
  listarNcmsDivergentes,
  ajustarEstruturaProduto,
  ajustarEstruturaLote,
  marcarProdutosParaAjuste,
  marcarMultiplasNCMsParaAjuste,
} from '../controllers/ajuste-estrutura.controller';
import { authMiddleware } from '../middlewares/auth.middleware';

const router = Router();

// Todas as rotas requerem autenticação
router.use(authMiddleware);

// Rotas para usuários
router.get('/contar', contarProdutosComAjuste);
router.get('/ncms-divergentes', listarNcmsDivergentes);
router.post('/produto/:id', ajustarEstruturaProduto);
router.post('/lote', ajustarEstruturaLote);

// Rotas para admin
router.post('/admin/marcar', marcarProdutosParaAjuste);
router.post('/admin/marcar-multiplas', marcarMultiplasNCMsParaAjuste);

export default router;
