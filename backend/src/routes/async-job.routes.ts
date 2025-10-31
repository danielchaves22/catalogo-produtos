import { Router } from 'express';
import { authMiddleware } from '../middlewares/auth.middleware';
import {
  limparAsyncJobs,
  listarAsyncJobs,
  removerAsyncJob,
} from '../controllers/async-job.controller';

const router = Router();

router.use(authMiddleware);
router.get('/', listarAsyncJobs);
router.delete('/', limparAsyncJobs);
router.delete('/:id', removerAsyncJob);

export default router;
