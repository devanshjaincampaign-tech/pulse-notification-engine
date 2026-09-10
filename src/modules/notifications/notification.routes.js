import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.middleware.js';
import {
  listNotificationsController,
  getUnreadCountController,
  markAsReadController,
  markAllAsReadController,
  deleteNotificationController,
} from './notification.controller.js';
import { validate } from '../../common/middleware/validate.middleware.js';
import { listNotificationsQuerySchema, notificationIdParamSchema } from './notification.schema.js';



const router = Router();

router.use(requireAuth);
router.get('/', validate(listNotificationsQuerySchema, 'query'), listNotificationsController);
router.patch('/:id/read', validate(notificationIdParamSchema, 'params'), markAsReadController);
router.delete('/:id', validate(notificationIdParamSchema, 'params'), deleteNotificationController);
router.get('/unread-count', getUnreadCountController);
router.patch('/read-all', markAllAsReadController);

export default router;