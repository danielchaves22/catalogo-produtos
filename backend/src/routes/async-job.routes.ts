import { Router } from 'express';
import { authMiddleware } from '../middlewares/auth.middleware';
import { listarAsyncJobs } from '../controllers/async-job.controller';

const router = Router();

router.use(authMiddleware);
router.get('/', listarAsyncJobs);

export default router;
