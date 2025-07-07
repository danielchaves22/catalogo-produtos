import { Router } from 'express';
import { obterResumoDashboard } from '../controllers/dashboard.controller';
import { authMiddleware } from '../middlewares/auth.middleware';

const router = Router();

router.use(authMiddleware);
router.get('/resumo', obterResumoDashboard);

export default router;
