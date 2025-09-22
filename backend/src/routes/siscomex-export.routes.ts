// backend/src/routes/siscomex-export.routes.ts

import { Router } from 'express';
import { 
  exportarCatalogo,
  exportarProdutos,
  downloadArquivoExportado,
  validarProdutosParaExportacao,
  gerarPreviewExportacao,
  listarHistoricoExportacoes,
  removerArquivoExportacao,
  verificarStatusExportacao
} from '../controllers/siscomex-export.controller';
import { authMiddleware } from '../middlewares/auth.middleware';
import { validate } from '../middlewares/validate.middleware';
import { z } from 'zod';

const router = Router();

// Todas as rotas de exportação são protegidas por autenticação
router.use(authMiddleware);

// Schemas de validação
const exportarProdutosSchema = z.object({
  produtoIds: z.array(z.number().int().positive()).min(1, {
    message: 'Pelo menos um produto deve ser informado'
  }),
  formato: z.enum(['json', 'xml']).optional().default('json')
});

const validarProdutosSchema = z.object({
  produtoIds: z.array(z.number().int().positive()).min(1, {
    message: 'Pelo menos um produto deve ser informado'
  })
});

/**
 * @swagger
 * /api/v1/siscomex/export/catalogo:
 *   get:
 *     summary: Exporta catálogo completo para formato SISCOMEX
 *     tags: [SISCOMEX Export]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: catalogoId
 *         schema:
 *           type: integer
 *         description: ID do catálogo específico (opcional)
 *       - in: query
 *         name: incluirOperadores
 *         schema:
 *           type: boolean
 *           default: true
 *         description: Incluir operadores estrangeiros
 *       - in: query
 *         name: incluirProdutos
 *         schema:
 *           type: boolean
 *           default: true
 *         description: Incluir produtos
 *       - in: query
 *         name: apenasAtivos
 *         schema:
 *           type: boolean
 *           default: true
 *         description: Incluir apenas itens ativos
 *       - in: query
 *         name: formato
 *         schema:
 *           type: string
 *           enum: [json, xml]
 *           default: json
 *         description: Formato do arquivo de exportação
 *     responses:
 *       200:
 *         description: Catálogo exportado com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 sucesso:
 *                   type: boolean
 *                   example: true
 *                 mensagem:
 *                   type: string
 *                   example: "Catálogo exportado com sucesso"
 *                 arquivo:
 *                   type: object
 *                   properties:
 *                     nome:
 *                       type: string
 *                       example: "catalogo_siscomex_1640995200000.json"
 *                     caminho:
 *                       type: string
 *                       example: "123/certificados/exports/catalogo_siscomex_1640995200000.json"
 *                     tamanho:
 *                       type: integer
 *                       example: 1024
 *                 resumo:
 *                   type: object
 *                   properties:
 *                     totalProdutos:
 *                       type: integer
 *                       example: 10
 *                     totalOperadores:
 *                       type: integer
 *                       example: 5
 *                     produtosValidados:
 *                       type: integer
 *                       example: 8
 *                     produtosComErro:
 *                       type: integer
 *                       example: 2
 *                     erros:
 *                       type: array
 *                       items:
 *                         type: string
 *       400:
 *         description: Erro na exportação
 *       500:
 *         description: Erro interno do servidor
 */
router.get('/catalogo', exportarCatalogo);

/**
 * @swagger
 * /api/v1/siscomex/export/produtos:
 *   post:
 *     summary: Exporta produtos específicos para formato SISCOMEX
 *     tags: [SISCOMEX Export]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - produtoIds
 *             properties:
 *               produtoIds:
 *                 type: array
 *                 items:
 *                   type: integer
 *                 example: [1, 2, 3]
 *                 description: Lista de IDs dos produtos a exportar
 *               formato:
 *                 type: string
 *                 enum: [json, xml]
 *                 default: json
 *                 description: Formato do arquivo
 *     responses:
 *       200:
 *         description: Produtos exportados com sucesso
 *       400:
 *         description: Dados inválidos
 *       500:
 *         description: Erro interno do servidor
 */
router.post('/produtos', validate(exportarProdutosSchema), exportarProdutos);

/**
 * @swagger
 * /api/v1/siscomex/export/download/{arquivo}:
 *   get:
 *     summary: Download de arquivo exportado
 *     tags: [SISCOMEX Export]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: arquivo
 *         required: true
 *         schema:
 *           type: string
 *         description: Nome do arquivo a ser baixado
 *     responses:
 *       200:
 *         description: Arquivo baixado com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *           application/xml:
 *             schema:
 *               type: string
 *       400:
 *         description: Nome de arquivo inválido
 *       404:
 *         description: Arquivo não encontrado
 *       500:
 *         description: Erro interno do servidor
 */
router.get('/download/:arquivo', downloadArquivoExportado);

/**
 * @swagger
 * /api/v1/siscomex/export/validar:
 *   post:
 *     summary: Valida produtos antes da exportação
 *     tags: [SISCOMEX Export]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - produtoIds
 *             properties:
 *               produtoIds:
 *                 type: array
 *                 items:
 *                   type: integer
 *                 example: [1, 2, 3]
 *                 description: Lista de IDs dos produtos a validar
 *     responses:
 *       200:
 *         description: Validação concluída
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 sucesso:
 *                   type: boolean
 *                   example: true
 *                 produtosValidos:
 *                   type: array
 *                   items:
 *                     type: integer
 *                   example: [1, 3]
 *                 produtosInvalidos:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: integer
 *                       denominacao:
 *                         type: string
 *                       erros:
 *                         type: array
 *                         items:
 *                           type: string
 *       400:
 *         description: Dados inválidos
 *       500:
 *         description: Erro interno do servidor
 */
router.post('/validar', validate(validarProdutosSchema), validarProdutosParaExportacao);

/**
 * @swagger
 * /api/v1/siscomex/export/preview/{catalogoId}:
 *   get:
 *     summary: Gera preview dos dados que seriam exportados
 *     tags: [SISCOMEX Export]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: catalogoId
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID do catálogo
 *     responses:
 *       200:
 *         description: Preview gerado com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 sucesso:
 *                   type: boolean
 *                   example: true
 *                 preview:
 *                   type: object
 *                   properties:
 *                     produtos:
 *                       type: array
 *                       description: Primeiros 5 produtos transformados
 *                     operadores:
 *                       type: array
 *                       description: Primeiros 5 operadores transformados
 *                     resumo:
 *                       type: object
 *                       properties:
 *                         totalItens:
 *                           type: integer
 *                         produtosValidos:
 *                           type: integer
 *                         produtosInvalidos:
 *                           type: integer
 *                         operadoresAtivos:
 *                           type: integer
 *       400:
 *         description: ID do catálogo inválido
 *       500:
 *         description: Erro interno do servidor
 */
router.get('/preview/:catalogoId', gerarPreviewExportacao);

/**
 * @swagger
 * /api/v1/siscomex/export/historico:
 *   get:
 *     summary: Lista histórico de exportações
 *     tags: [SISCOMEX Export]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limite
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Limite de resultados por página
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *         description: Offset para paginação
 *     responses:
 *       200:
 *         description: Histórico obtido com sucesso
 *       500:
 *         description: Erro interno do servidor
 */
router.get('/historico', listarHistoricoExportacoes);

/**
 * @swagger
 * /api/v1/siscomex/export/arquivo/{arquivo}:
 *   delete:
 *     summary: Remove arquivo de exportação
 *     tags: [SISCOMEX Export]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: arquivo
 *         required: true
 *         schema:
 *           type: string
 *         description: Nome do arquivo a ser removido
 *     responses:
 *       200:
 *         description: Arquivo removido com sucesso
 *       400:
 *         description: Nome de arquivo inválido
 *       404:
 *         description: Arquivo não encontrado
 *       500:
 *         description: Erro interno do servidor
 */
router.delete('/arquivo/:arquivo', removerArquivoExportacao);

/**
 * @swagger
 * /api/v1/siscomex/export/status:
 *   get:
 *     summary: Verifica status dos dados para exportação
 *     tags: [SISCOMEX Export]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: catalogoId
 *         schema:
 *           type: integer
 *         description: ID do catálogo (opcional)
 *     responses:
 *       200:
 *         description: Status verificado com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 sucesso:
 *                   type: boolean
 *                   example: true
 *                 status:
 *                   type: object
 *                   properties:
 *                     prontoPara:
 *                       type: object
 *                       properties:
 *                         siscomex:
 *                           type: boolean
 *                           description: Pronto para envio ao SISCOMEX
 *                         exportacao:
 *                           type: boolean
 *                           description: Pronto para exportação
 *                     estatisticas:
 *                       type: object
 *                       properties:
 *                         totalProdutos:
 *                           type: integer
 *                         produtosValidos:
 *                           type: integer
 *                         produtosInvalidos:
 *                           type: integer
 *                         operadoresAtivos:
 *                           type: integer
 *                         percentualValidacao:
 *                           type: integer
 *                     recomendacoes:
 *                       type: array
 *                       items:
 *                         type: string
 *                       description: Recomendações para melhorar os dados
 *       500:
 *         description: Erro interno do servidor
 */
router.get('/status', verificarStatusExportacao);

export default router;

// Arquivo para atualizar: backend/src/app.ts
// Adicionar na seção de imports:
// import siscomexExportRoutes from './routes/siscomex-export.routes';

// Adicionar na seção de rotas protegidas:
// apiRouter.use('/siscomex/export', siscomexExportRoutes);