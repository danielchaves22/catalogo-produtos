// backend/src/routes/siscomex.routes.ts
import { Router } from 'express';
import {
  transmitirProdutos,
  prepararTransmissaoProdutos,
  iniciarTransmissaoProdutos,
  cancelarPreTransmissaoProdutos,
  removerItemPreTransmissaoProdutos,
  consultarAtributosPorNcm,
  listarSugestoesNcm,
  listarTransmissoes,
  detalharTransmissao,
  baixarArquivoTransmissao,
} from '../controllers/siscomex.controller';
import { authMiddleware } from '../middlewares/auth.middleware';

const router = Router();

// Todas as rotas SISCOMEX são protegidas por autenticação
router.use(authMiddleware);

router.get('/transmissoes', listarTransmissoes);
router.get('/transmissoes/:id', detalharTransmissao);
router.get('/transmissoes/:id/arquivos/:tipo', baixarArquivoTransmissao);

/**
 * @swagger
 * /api/v1/siscomex/transmissoes/{id}/iniciar:
 *   post:
 *     summary: Inicia uma pré-transmissão já criada e aguardando confirmação
 *     tags: [SISCOMEX]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       202:
 *         description: Transmissão enfileirada
 */
router.post('/transmissoes/:id/iniciar', iniciarTransmissaoProdutos);

/**
 * @swagger
 * /api/v1/siscomex/transmissoes/{id}/cancelar:
 *   post:
 *     summary: Cancela uma pré-transmissão aguardando confirmação
 *     tags: [SISCOMEX]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Pré-transmissão cancelada
 */
router.post('/transmissoes/:id/cancelar', cancelarPreTransmissaoProdutos);

/**
 * @swagger
 * /api/v1/siscomex/transmissoes/{id}/itens/{itemId}:
 *   delete:
 *     summary: Remove um item de uma pré-transmissão aguardando confirmação
 *     tags: [SISCOMEX]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *       - in: path
 *         name: itemId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Item removido da pré-transmissão
 */
router.delete('/transmissoes/:id/itens/:itemId', removerItemPreTransmissaoProdutos);

/**
 * @swagger
 * /api/v1/siscomex/ncm/sugestoes:
 *   get:
 *     summary: Lista sugestões de códigos NCM
 *     tags: [SISCOMEX]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: prefixo
 *         required: true
 *         schema:
 *           type: string
 *           minLength: 4
 *           maxLength: 7
 *     responses:
 *       200:
 *         description: Lista de sugestões de NCM
 */
router.get('/ncm/sugestoes', listarSugestoesNcm);

/**
 * @swagger
 * /api/v1/siscomex/produtos/preparar:
 *   post:
 *     summary: Cria uma pré-transmissão persistida de produtos aguardando confirmação
 *     tags: [SISCOMEX]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               ids:
 *                 type: array
 *                 items:
 *                   type: integer
 *               catalogoId:
 *                 type: integer
 *             required:
 *               - ids
 *               - catalogoId
 *     responses:
 *       201:
 *         description: Pré-transmissão criada
 */
router.post('/produtos/preparar', prepararTransmissaoProdutos);

/**
 * @swagger
 * /api/v1/siscomex/produtos/transmitir:
 *   post:
 *     summary: Enfileira transmissão assíncrona individual de produtos aprovados ao SISCOMEX
 *     tags: [SISCOMEX]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               ids:
 *                 type: array
 *                 items:
 *                   type: integer
 *                 description: IDs dos produtos aprovados a transmitir
 *               catalogoId:
 *                 type: integer
 *                 description: Catálogo selecionado para utilizar certificado e dados fiscais
 *             required:
 *               - ids
 *               - catalogoId
 *     responses:
 *       202:
 *         description: Transmissão enfileirada
 */
router.post('/produtos/transmitir', transmitirProdutos);

/**
 * @swagger
 * /api/v1/siscomex/atributos/ncm/{ncm}:
 *   get:
 *     summary: Consulta atributos por NCM
 *     tags: [SISCOMEX]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: ncm
 *         required: true
 *         schema:
 *           type: string
 *           minLength: 8
 *     responses:
 *       200:
 *         description: Lista de atributos do NCM
 */
router.get('/atributos/ncm/:ncm', consultarAtributosPorNcm);

export default router;
