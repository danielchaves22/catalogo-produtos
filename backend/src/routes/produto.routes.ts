// backend/src/routes/produto.routes.ts
import { Router } from 'express';
import {
  listarProdutos,
  obterProduto,
  obterHistoricoProduto,
  criarProduto,
  atualizarProduto,
  removerProduto,
  inativarProduto,
  prepararRetificacaoProduto,
  transmitirReativacaoProduto,
  transmitirRetificacaoProduto,
  clonarProduto,
  contarPendenciasAjusteEstrutura,
  listarPendenciasAjusteEstruturaDetalhadas,
  verificarAjusteEstruturaProduto,
  ajustarEstruturaCatalogo,
  corrigirStatusAjusteEstrutura,
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
  reativarProdutoSchema,
  cloneProdutoSchema,
  deleteProdutosEmMassaSchema,
  exportarProdutosSchema,
  corrigirStatusAjusteEstruturaSchema
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
router.post(
  '/ajuste-estrutura/corrigir-status',
  validate(corrigirStatusAjusteEstruturaSchema),
  corrigirStatusAjusteEstrutura
);
router.post('/:id/ajuste-estrutura/verificar', verificarAjusteEstruturaProduto);
router.get('/:id', obterProduto);
router.get('/:id/historico', obterHistoricoProduto);
router.post('/', validate(createProdutoSchema), criarProduto);
router.put('/:id', validate(updateProdutoSchema), atualizarProduto);
router.post('/exportacoes', validate(exportarProdutosSchema), solicitarExportacaoProdutos);
router.post('/exportacoes/fabricantes', validate(exportarProdutosSchema), solicitarExportacaoFabricantes);
router.post('/:id/clonar', validate(cloneProdutoSchema), clonarProduto);
router.post('/:id/inativar', inativarProduto);
/**
 * @swagger
 * /api/v1/produtos/{id}/reativar/transmitir:
 *   post:
 *     summary: Salva um produto desativado e enfileira uma nova versão para reativação no SISCOMEX
 *     tags: [Produtos]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [denominacao]
 *             properties:
 *               denominacao:
 *                 type: string
 *                 maxLength: 120
 *               descricao:
 *                 type: string
 *               modalidade:
 *                 type: string
 *               valoresAtributos:
 *                 type: object
 *               codigosInternos:
 *                 type: array
 *                 items:
 *                   type: string
 *               operadoresEstrangeiros:
 *                 type: array
 *                 items:
 *                   type: object
 *     responses:
 *       202:
 *         description: Reativação enfileirada para transmissão
 *       400:
 *         description: Produto não elegível ou denominação não alterada
 */
router.post('/:id/reativar/transmitir', validate(reativarProdutoSchema), transmitirReativacaoProduto);
router.post('/:id/retificar/transmitir', transmitirRetificacaoProduto);
router.post('/:id/retificar', prepararRetificacaoProduto);
router.post('/excluir-em-massa', validate(deleteProdutosEmMassaSchema), removerProdutosEmMassa);
router.delete('/:id', removerProduto);

export default router;
