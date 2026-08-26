import { redisClient } from '../config/redis.js';
import { NOTIFICATION_CHANNEL } from '../events/redisChannel.js';

let ioInstance = null;

export function setIoInstance(io) {
  ioInstance = io;
}

export async function emitToUser(userId, eventName, data) {
  const message = JSON.stringify({ userId, eventName, data });
  await redisClient.publish(NOTIFICATION_CHANNEL, message);
}

export function deliverLocally(userId, eventName, data) {
  if (!ioInstance) {
    console.error('Socket.IO instance not initialized yet');
    return;
  }

  ioInstance.to(`user:${userId}`).emit(eventName, data);
}