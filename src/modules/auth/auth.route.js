import { Router } from 'express';
import { registerController, loginController, meController } from './auth.controller.js';
import { requireAuth } from '../../middleware/auth.middleware.js';
import { createAuthRateLimiter } from '../../common/middleware/rateLimit.middleware.js';
import { validate } from '../../common/middleware/validate.middleware.js';
import { registerSchema, loginSchema } from './auth.schema.js';


const router = Router();
const authRateLimiter = createAuthRateLimiter();

router.post('/register', authRateLimiter, validate(registerSchema, 'body'), registerController);
router.post('/login', authRateLimiter, validate(loginSchema, 'body'), loginController);
router.get('/me', requireAuth, meController);

export default router;