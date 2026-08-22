import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.middleware.js';
import {
  listNotificationsController,
  getUnreadCountController,
  markAsReadController,
  markAllAsReadController,
  deleteNotificationController,
} from './notification.controller.js';

const router = Router();

router.use(requireAuth);

router.get('/', listNotificationsController);
router.get('/unread-count', getUnreadCountController);
router.patch('/read-all', markAllAsReadController);
router.patch('/:id/read', markAsReadController);
router.delete('/:id', deleteNotificationController);

export default router;