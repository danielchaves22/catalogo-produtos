import { Router } from 'express';
import { obterEstruturaPorNcm } from '../controllers/atributo.controller';
import { authMiddleware } from '../middlewares/auth.middleware';

const router = Router();
router.use(authMiddleware);
router.get('/ncm/:ncm', obterEstruturaPorNcm);
export default router;
