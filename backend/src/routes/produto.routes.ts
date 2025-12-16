// backend/src/routes/produto.routes.ts
import { Router } from 'express';
import {
  listarProdutos,
  obterProduto,
  criarProduto,
  atualizarProduto,
  removerProduto,
  clonarProduto,
  contarPendenciasAjusteEstrutura,
  listarPendenciasAjusteEstruturaDetalhadas,
  ajustarEstruturaCatalogo,
  removerProdutosEmMassa
} from '../controllers/produto.controller';
import { solicitarExportacaoFabricantes, solicitarExportacaoProdutos } from '../controllers/produto-exportacao.controller';
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
  deleteProdutosEmMassaSchema,
  exportarProdutosSchema
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
router.get('/pendencias/ajuste-estrutura', contarPendenciasAjusteEstrutura);
router.get('/pendencias/ajuste-estrutura/detalhes', listarPendenciasAjusteEstruturaDetalhadas);
router.post('/ajuste-estrutura/ajustar-catalogo', ajustarEstruturaCatalogo);
router.get('/:id', obterProduto);
router.post('/', validate(createProdutoSchema), criarProduto);
router.put('/:id', validate(updateProdutoSchema), atualizarProduto);
router.post('/exportacoes', validate(exportarProdutosSchema), solicitarExportacaoProdutos);
router.post('/exportacoes/fabricantes', validate(exportarProdutosSchema), solicitarExportacaoFabricantes);
router.post('/:id/clonar', validate(cloneProdutoSchema), clonarProduto);
router.post('/excluir-em-massa', validate(deleteProdutosEmMassaSchema), removerProdutosEmMassa);
router.delete('/:id', removerProduto);

export default router;
