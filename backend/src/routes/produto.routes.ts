// backend/src/routes/produto.routes.ts
import { Router } from 'express';
import {
  listarProdutos,
  obterProduto,
  criarProduto,
  atualizarProduto,
  removerProduto,
  clonarProduto,
  removerProdutosEmMassa
} from '../controllers/produto.controller';
import {
  importarProdutosPorPlanilha,
  listarImportacoes,
  obterDetalhesImportacao,
  reverterImportacao,
  removerImportacao,
  limparImportacoes
} from '../controllers/produto-importacao.controller';
import { authMiddleware } from '../middlewares/auth.middleware';
import { validate } from '../middlewares/validate.middleware';
import {
  createProdutoSchema,
  updateProdutoSchema,
  cloneProdutoSchema,
  deleteProdutosEmMassaSchema
} from '../validators/produto.validator';

const router = Router();

router.use(authMiddleware);

router.get('/importacoes', listarImportacoes);
router.get('/importacoes/:id', obterDetalhesImportacao);
router.post('/importacao', importarProdutosPorPlanilha);
router.post('/importacoes/:id/reverter', reverterImportacao);
router.delete('/importacoes/:id', removerImportacao);
router.delete('/importacoes', limparImportacoes);

router.get('/', listarProdutos);
router.get('/:id', obterProduto);
router.post('/', validate(createProdutoSchema), criarProduto);
router.put('/:id', validate(updateProdutoSchema), atualizarProduto);
router.post('/:id/clonar', validate(cloneProdutoSchema), clonarProduto);
router.post('/excluir-em-massa', validate(deleteProdutosEmMassaSchema), removerProdutosEmMassa);
router.delete('/:id', removerProduto);

export default router;
