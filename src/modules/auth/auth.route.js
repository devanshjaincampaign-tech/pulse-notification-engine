import { Router } from 'express';
import {
  registerController,
  loginController,
  meController,
  refreshController,
  sessionsController,
  logoutController,
  logoutDeviceController,
  logoutAllController,
} from './auth.controller.js';
import { requireAuth } from '../../middleware/auth.middleware.js';
import { createAuthRateLimiter } from '../../common/middleware/rateLimit.middleware.js';
import { validate } from '../../common/middleware/validate.middleware.js';
import { registerSchema, loginSchema, refreshSchema, sessionIdParamSchema } from './auth.schema.js';


const router = Router();
const authRateLimiter = createAuthRateLimiter();

router.post('/register', authRateLimiter, validate(registerSchema, 'body'), registerController);
router.post('/login', authRateLimiter, validate(loginSchema, 'body'), loginController);
router.post('/refresh', validate(refreshSchema, 'body'), refreshController);
router.get('/me', requireAuth, meController);
router.get('/sessions', requireAuth, sessionsController);
router.post('/logout', requireAuth, logoutController);
router.post('/logout-all', requireAuth, logoutAllController);
router.delete('/sessions/:id', requireAuth, validate(sessionIdParamSchema, 'params'), logoutDeviceController);

export default router;