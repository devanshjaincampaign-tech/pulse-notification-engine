import { redisClient } from '../config/redis.js';
import { NOTIFICATION_CHANNEL, SESSION_REVOKE_CHANNEL } from '../events/redisChannel.js';
import { increment, observe } from '../config/metrics.js';

let ioInstance = null;

export function setIoInstance(io) {
  ioInstance = io;
}

export async function emitToUser(userId, eventName, data) {
  const message = JSON.stringify({ userId, eventName, data });
  const startedAt = Date.now();
  try {
    await redisClient.publish(NOTIFICATION_CHANNEL, message);
    increment('notification_delivery_total', { outcome: 'published' }, 1, 'Notification delivery outcomes');
    observe('notification_publish_duration_ms', 'Redis notification publish duration in milliseconds', Date.now() - startedAt, { outcome: 'success' });
  } catch (err) {
    increment('notification_delivery_total', { outcome: 'publish_error' }, 1, 'Notification delivery outcomes');
    observe('notification_publish_duration_ms', 'Redis notification publish duration in milliseconds', Date.now() - startedAt, { outcome: 'error' });
    throw err;
  }
}

export function deliverLocally(userId, eventName, data) {
  if (!ioInstance) {
    console.error('Socket.IO instance not initialized yet');
    return;
  }
  ioInstance.to(`user:${userId}`).emit(eventName, data);
  increment('notification_delivery_total', { outcome: 'emitted_locally' }, 1, 'Notification delivery outcomes');
}

export async function publishSessionRevocation(sessionId) {
  if (ioInstance) ioInstance.in(`session:${sessionId}`).disconnectSockets(true);
  try {
    await redisClient.publish(SESSION_REVOKE_CHANNEL, JSON.stringify({ sessionId }));
  } catch (err) {
    increment('session_revocation_notifications_total', { outcome: 'publish_error' }, 1, 'Session revocation notifications');
    throw err;
  }
  increment('session_revocation_notifications_total', { outcome: 'published' }, 1, 'Session revocation notifications');
}

export function disconnectSessionLocally(sessionId) {
  ioInstance?.in(`session:${sessionId}`).disconnectSockets(true);
}
