import {
  listNotifications,
  getUnreadCountForUser,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  removeNotification,
} from './notification.service.js';

export async function listNotificationsController(req, res) {
  try {
    const limit = Number(req.query.limit) || 20;
    const offset = Number(req.query.offset) || 0;

    const notifications = await listNotifications(req.user.userId, { limit, offset });
    res.status(200).json(notifications);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

export async function getUnreadCountController(req, res) {
  try {
    const result = await getUnreadCountForUser(req.user.userId);
    res.status(200).json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

export async function markAsReadController(req, res) {
  try {
    const notificationId = Number(req.params.id);
    const result = await markNotificationAsRead(notificationId, req.user.userId);
    res.status(200).json(result);
  } catch (err) {
    res.status(404).json({ error: err.message });
  }
}

export async function markAllAsReadController(req, res) {
  try {
    const result = await markAllNotificationsAsRead(req.user.userId);
    res.status(200).json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

export async function deleteNotificationController(req, res) {
  try {
    const notificationId = Number(req.params.id);
    const result = await removeNotification(notificationId, req.user.userId);
    res.status(200).json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}