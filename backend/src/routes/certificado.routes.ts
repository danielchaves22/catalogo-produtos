import { Router } from 'express';
import { listarCertificados, uploadCertificado } from '../controllers/certificado.controller';
import { authMiddleware } from '../middlewares/auth.middleware';
import { validate } from '../middlewares/validate.middleware';
import { uploadCertificadoSchema } from '../validators/certificado.validator';

const router = Router();

router.use(authMiddleware);
router.get('/', listarCertificados);
router.post('/', validate(uploadCertificadoSchema), uploadCertificado);

export default router;
