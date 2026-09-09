import {
  listNotifications,
  getUnreadCountForUser,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  removeNotification,
} from './notification.service.js';

export async function listNotificationsController(req, res, next) {
  try {
    const limit = Number(req.query.limit) || 20;
    const offset = Number(req.query.offset) || 0;

    const notifications = await listNotifications(req.user.userId, { limit, offset });
    res.status(200).json(notifications);
  } catch (err) {
    next(err);
  }
}

export async function getUnreadCountController(req, res, next) {
  try {
    const result = await getUnreadCountForUser(req.user.userId);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

export async function markAsReadController(req, res, next) {
  try {
    const notificationId = Number(req.params.id);
    const result = await markNotificationAsRead(notificationId, req.user.userId);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

export async function markAllAsReadController(req, res, next) {
  try {
    const result = await markAllNotificationsAsRead(req.user.userId);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

export async function deleteNotificationController(req, res, next) {
  try {
    const notificationId = Number(req.params.id);
    const result = await removeNotification(notificationId, req.user.userId);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}