import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.middleware.js';
import { listPreferencesController, updatePreferenceController } from './preference.controller.js';
import { validate } from '../../common/middleware/validate.middleware.js';
import { preferenceParamSchema, preferenceBodySchema } from './preference.schema.js';

const router = Router();

router.use(requireAuth);

router.get('/', listPreferencesController);
router.patch('/:type', validate(preferenceParamSchema, 'params'), validate(preferenceBodySchema, 'body'), updatePreferenceController);
export default router;