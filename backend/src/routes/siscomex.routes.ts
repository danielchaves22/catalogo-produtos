// backend/src/routes/siscomex.routes.ts
import { Router } from 'express';
import { 
  consultarProdutos,
  incluirProduto,
  transmitirProdutos,
  atualizarProduto,
  detalharVersaoProduto,
  exportarCatalogo,
  consultarAtributosPorNcm,
  listarSugestoesNcm,
  verificarStatus,
  listarTransmissoes,
  detalharTransmissao,
  baixarArquivoTransmissao
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
 * /api/v1/siscomex/status:
 *   get:
 *     summary: Verifica status da conexão com SISCOMEX
 *     tags: [SISCOMEX]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Status da conexão
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 */
router.get('/status', verificarStatus);

/**
 * @swagger
 * /api/v1/siscomex/produtos:
 *   get:
 *     summary: Consulta produtos no SISCOMEX
 *     tags: [SISCOMEX]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: cpfCnpjRaiz
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: codigoProduto
 *         schema:
 *           type: string
 *       - in: query
 *         name: ncm
 *         schema:
 *           type: string
 *       - in: query
 *         name: situacao
 *         schema:
 *           type: string
 *           enum: [ATIVADO, DESATIVADO, RASCUNHO]
 *       - in: query
 *         name: incluirDesativados
 *         schema:
 *           type: boolean
 *     responses:
 *       200:
 *         description: Lista de produtos
 */
router.get('/produtos', consultarProdutos);

/**
 * @swagger
 * /api/v1/siscomex/produtos:
 *   post:
 *     summary: Inclui novo produto no SISCOMEX
 *     tags: [SISCOMEX]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/SiscomexProduto'
 *     responses:
 *       201:
 *         description: Produto criado com sucesso
 */
router.post('/produtos', incluirProduto);

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
 * /api/v1/siscomex/produtos/{codigo}:
 *   put:
 *     summary: Atualiza produto no SISCOMEX
 *     tags: [SISCOMEX]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: codigo
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Produto atualizado com sucesso
 */
router.put('/produtos/:codigo', atualizarProduto);

/**
 * @swagger
 * /api/v1/siscomex/produtos/{codigo}/versoes/{versao}:
 *   get:
 *     summary: Detalha versão específica do produto
 *     tags: [SISCOMEX]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: codigo
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: versao
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Detalhes da versão do produto
 */
router.get('/produtos/:codigo/versoes/:versao', detalharVersaoProduto);

/**
 * @swagger
 * /api/v1/siscomex/produtos/exportar:
 *   get:
 *     summary: Exporta catálogo completo do SISCOMEX
 *     tags: [SISCOMEX]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: cpfCnpjRaiz
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: incluirDesativados
 *         schema:
 *           type: boolean
 *     responses:
 *       200:
 *         description: Catálogo exportado
 */
router.get('/produtos/exportar', exportarCatalogo);

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