import { Router } from 'express';
import { registerController, loginController, meController } from './auth.controller.js';
import { requireAuth } from '../../middleware/auth.middleware.js';
import { authRateLimiter } from '../../common/middleware/rateLimit.middleware.js';

const router = Router();

router.post('/register', authRateLimiter, registerController);
router.post('/login', authRateLimiter, loginController);
router.get('/me', requireAuth, meController);

export default router;