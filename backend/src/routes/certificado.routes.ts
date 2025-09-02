import { Router } from 'express';
import {
  listarCertificados,
  uploadCertificado,
  listarCatalogosCertificado,
  removerCertificado,
  downloadCertificado,
  extrairInformacoes,
} from '../controllers/certificado.controller';
import { authMiddleware } from '../middlewares/auth.middleware';
import { validate } from '../middlewares/validate.middleware';
import { uploadCertificadoSchema } from '../validators/certificado.validator';

const router = Router();

router.use(authMiddleware);
router.get('/', listarCertificados);
router.post('/', validate(uploadCertificadoSchema), uploadCertificado);
router.get('/:id/catalogos', listarCatalogosCertificado);
router.get('/:id/download', downloadCertificado);
router.get('/:id/info', extrairInformacoes);
router.delete('/:id', removerCertificado);

export default router;
