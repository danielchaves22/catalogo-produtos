// backend/src/routes/operador-estrangeiro.routes.ts
import { Router } from 'express';
import { 
  listarOperadoresEstrangeiros,
  obterOperadorEstrangeiro,
  buscarPorTin,
  criarOperadorEstrangeiro,
  atualizarOperadorEstrangeiro,
  removerOperadorEstrangeiro,
  listarPaises,
  listarSubdivisoes,
  listarAgenciasEmissoras,
  listarCnpjsCatalogos,
  listarSubdivisoesPorPais
} from '../controllers/operador-estrangeiro.controller';
import { authMiddleware } from '../middlewares/auth.middleware';
import { validate } from '../middlewares/validate.middleware';
import { createOperadorEstrangeiroSchema, updateOperadorEstrangeiroSchema } from '../validators/operador-estrangeiro.validator';

const router = Router();

// Todas as rotas protegidas por autenticação
router.use(authMiddleware, (req, res, next) => {
  if (!req.user?.superUserId) {
    return res.status(401).json({ error: 'Identificador do superusuário ausente' });
  }
  next();
});

// ========== ROTAS AUXILIARES (devem vir ANTES das rotas principais) ==========
router.get('/aux/paises', listarPaises);
router.get('/aux/agencias-emissoras', listarAgenciasEmissoras);
router.get('/aux/cnpjs-catalogos', listarCnpjsCatalogos);
router.get('/aux/subdivisoes/:paisCodigo', listarSubdivisoesPorPais);
router.get('/aux/subdivisoes', listarSubdivisoes);

// ========== ROTAS PRINCIPAIS ==========
router.get('/buscar-por-tin/:tin', buscarPorTin);
router.get('/:id', obterOperadorEstrangeiro);
router.get('/', listarOperadoresEstrangeiros);
router.post('/', validate(createOperadorEstrangeiroSchema), criarOperadorEstrangeiro);
router.put('/:id', validate(updateOperadorEstrangeiroSchema), atualizarOperadorEstrangeiro);
router.delete('/:id', removerOperadorEstrangeiro);

export default router;