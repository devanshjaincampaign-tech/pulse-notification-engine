import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.middleware.js';
import { listPreferencesController, updatePreferenceController } from './preference.controller.js';

const router = Router();

router.use(requireAuth);

router.get('/', listPreferencesController);
router.patch('/:type', updatePreferenceController);

export default router;