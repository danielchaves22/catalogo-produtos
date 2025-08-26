// src/routes/catalogo.routes.ts
import { Router } from 'express';
import {
  listarCatalogos,
  obterCatalogo,
  criarCatalogo,
  atualizarCatalogo,
  removerCatalogo,
  uploadCertificado,
  downloadCertificado
} from '../controllers/catalogo.controller';
import { authMiddleware } from '../middlewares/auth.middleware';
import { validate } from '../middlewares/validate.middleware';
import { createCatalogoSchema, updateCatalogoSchema } from '../validators/catalogo.validator';
import { uploadCertificadoSchema } from '../validators/catalogo-certificado.validator';

const router = Router();

// Todas as rotas protegidas por autenticação
router.use(authMiddleware);

// Rotas CRUD
router.get('/', listarCatalogos);
router.get('/:id', obterCatalogo);
router.post('/', validate(createCatalogoSchema), criarCatalogo);
router.put('/:id', validate(updateCatalogoSchema), atualizarCatalogo);
router.delete('/:id', removerCatalogo);
router.post('/:id/certificado', validate(uploadCertificadoSchema), uploadCertificado);
router.get('/:id/certificado', downloadCertificado);

export default router;