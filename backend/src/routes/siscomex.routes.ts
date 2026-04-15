// backend/src/routes/siscomex.routes.ts
import { Router } from 'express';
import {
  transmitirProdutos,
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
 * /api/v1/siscomex/produtos/transmitir:
 *   post:
 *     summary: Envia produtos aprovados do catálogo ao SISCOMEX
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
 *                 description: IDs dos produtos aprovados a transmitir (máximo de 100 por envio)
 *               catalogoId:
 *                 type: integer
 *                 description: Catálogo selecionado para utilizar certificado e dados fiscais
 *             required:
 *               - ids
 *               - catalogoId
 *     responses:
 *       200:
 *         description: Resultado da transmissão
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
