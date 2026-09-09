import { Router } from 'express';
import { registerController, loginController, meController } from './auth.controller.js';
import { requireAuth } from '../../middleware/auth.middleware.js';
import { createAuthRateLimiter } from '../../common/middleware/rateLimit.middleware.js';

const router = Router();
const authRateLimiter = createAuthRateLimiter();

router.post('/register', authRateLimiter, registerController);
router.post('/login', authRateLimiter, loginController);
router.get('/me', requireAuth, meController);

export default router;