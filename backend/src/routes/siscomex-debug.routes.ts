// backend/src/routes/siscomex-debug.routes.ts

import { Router } from 'express';
import { 
  gerarDiagnostico,
  validarCertificado,
  testarConectividade,
  obterMetricas,
  resetarMetricas,
  testarTransformacaoProduto,
  mostrarConfiguracao,
  simularEnvio
} from '../controllers/siscomex-debug.controller';
import { authMiddleware } from '../middlewares/auth.middleware';
import { validate } from '../middlewares/validate.middleware';
import { z } from 'zod';

const router = Router();

// Middleware de autenticação
router.use(authMiddleware);

// Middleware para verificar se é ambiente de desenvolvimento
router.use((req, res, next) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(403).json({
      sucesso: false,
      mensagem: 'Endpoints de debug não disponíveis em produção'
    });
  }
  next();
});

// Schema para teste de produto
const testarProdutoSchema = z.object({
  produtoId: z.number().int().positive({
    message: 'ID do produto deve ser um número positivo'
  })
});

// Schema para simulação de envio
const simularEnvioSchema = z.object({
  produtoId: z.number().int().positive({
    message: 'ID do produto deve ser um número positivo'
  }),
  executarValidacoes: z.boolean().optional().default(true)
});

/**
 * @swagger
 * /api/v1/siscomex/debug/diagnostico:
 *   get:
 *     summary: Gera relatório completo de diagnóstico SISCOMEX
 *     tags: [SISCOMEX Debug]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Diagnóstico gerado com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 sucesso:
 *                   type: boolean
 *                   example: true
 *                 diagnostico:
 *                   type: object
 *                   properties:
 *                     timestamp:
 *                       type: string
 *                       format: date-time
 *                     configuracao:
 *                       type: object
 *                       description: Status da configuração
 *                     conectividade:
 *                       type: object
 *                       description: Status da conectividade
 *                     certificado:
 *                       type: object
 *                       description: Status do certificado digital
 *                     recomendacoes:
 *                       type: array
 *                       items:
 *                         type: string
 *                       description: Lista de recomendações
 *       403:
 *         description: Disponível apenas em desenvolvimento
 *       500:
 *         description: Erro interno do servidor
 */
router.get('/diagnostico', gerarDiagnostico);

/**
 * @swagger
 * /api/v1/siscomex/debug/certificado:
 *   get:
 *     summary: Valida o certificado digital configurado
 *     tags: [SISCOMEX Debug]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Certificado válido
 *       400:
 *         description: Problemas encontrados no certificado
 *       500:
 *         description: Erro interno do servidor
 */
router.get('/certificado', validarCertificado);

/**
 * @swagger
 * /api/v1/siscomex/debug/conectividade:
 *   get:
 *     summary: Testa conectividade com a API SISCOMEX
 *     tags: [SISCOMEX Debug]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Conexão estabelecida
 *       503:
 *         description: Falha na conexão
 *       500:
 *         description: Erro interno do servidor
 */
router.get('/conectividade', testarConectividade);

/**
 * @swagger
 * /api/v1/siscomex/debug/metricas:
 *   get:
 *     summary: Obtém métricas de performance das operações SISCOMEX
 *     tags: [SISCOMEX Debug]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Métricas obtidas com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 sucesso:
 *                   type: boolean
 *                 metricas:
 *                   type: object
 *                   properties:
 *                     estatisticasGerais:
 *                       type: object
 *                       properties:
 *                         totalOperacoes:
 *                           type: integer
 *                         taxaSucessoGeral:
 *                           type: integer
 *                         tempoMedioGeral:
 *                           type: integer
 *                     porOperacao:
 *                       type: object
 *                       description: Métricas por tipo de operação
 */
router.get('/metricas', obterMetricas);

/**
 * @swagger
 * /api/v1/siscomex/debug/resetar-metricas:
 *   post:
 *     summary: Reseta as métricas de performance
 *     tags: [SISCOMEX Debug]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Métricas resetadas com sucesso
 */
router.post('/resetar-metricas', resetarMetricas);

/**
 * @swagger
 * /api/v1/siscomex/debug/testar-produto:
 *   post:
 *     summary: Testa transformação de produto para formato SISCOMEX
 *     tags: [SISCOMEX Debug]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - produtoId
 *             properties:
 *               produtoId:
 *                 type: integer
 *                 description: ID do produto a ser testado
 *     responses:
 *       200:
 *         description: Teste concluído
 *       400:
 *         description: Dados inválidos
 *       404:
 *         description: Produto não encontrado
 */
router.post('/testar-produto', validate(testarProdutoSchema), testarTransformacaoProduto);

/**
 * @swagger
 * /api/v1/siscomex/debug/configuracao:
 *   get:
 *     summary: Mostra configuração atual do SISCOMEX
 *     tags: [SISCOMEX Debug]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Configuração obtida
 */
router.get('/configuracao', mostrarConfiguracao);

/**
 * @swagger
 * /api/v1/siscomex/debug/simular-envio:
 *   post:
 *     summary: Simula envio de produto para SISCOMEX (sem enviar)
 *     tags: [SISCOMEX Debug]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - produtoId
 *             properties:
 *               produtoId:
 *                 type: integer
 *                 description: ID do produto a ser simulado
 *               executarValidacoes:
 *                 type: boolean
 *                 default: true
 *                 description: Se deve executar validações
 *     responses:
 *       200:
 *         description: Simulação concluída
 *       400:
 *         description: Dados inválidos
 *       404:
 *         description: Produto não encontrado
 */
router.post('/simular-envio', validate(simularEnvioSchema), simularEnvio);

export default router;