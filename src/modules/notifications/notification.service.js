import {
  getNotificationsForUser,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  deleteNotification,
} from './notification.repository.js';
import { NotFoundError } from '../../common/errors/index.js';

export async function listNotifications(recipientId, { limit, offset } = {}) {
  return getNotificationsForUser(recipientId, { limit, offset });
}

export async function getUnreadCountForUser(recipientId) {
  const count = await getUnreadCount(recipientId);
  return { count };
}

export async function markNotificationAsRead(notificationId, recipientId) {
  const notification = await markAsRead(notificationId, recipientId);

  if (!notification) {
    throw new Error('Notification not found');  }

  return notification;
}

export async function markAllNotificationsAsRead(recipientId) {
  await markAllAsRead(recipientId);
  return { success: true };
}

export async function removeNotification(notificationId, recipientId) {
  await deleteNotification(notificationId, recipientId);
  return { success: true };
}