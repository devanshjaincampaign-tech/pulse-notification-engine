import { Server } from 'socket.io';
import { createSocketAuthMiddleware } from './socketAuth.js';
import { setIoInstance, deliverLocally, disconnectSessionLocally } from './socketEmitter.js';
import { redisSubscriber, connectRedisSubscriber } from '../config/redis.js';
import { NOTIFICATION_CHANNEL, SESSION_REVOKE_CHANNEL } from '../events/redisChannel.js';
import { getUnreadNotificationsForUser } from '../modules/notifications/notification.repository.js';
import { logger } from '../config/logger.js';
import { env } from '../config/env.js';
import { addGauge, increment, observeUnreadSync } from '../config/metrics.js';

const MAX_PUBSUB_BYTES = 1024 * 1024;
const connectionsByIp = new Map();
const handshakeTimesByIp = new Map();
const messageTimesByIp = new Map();

function parseDeliveryMessage(message) {
  try {
    if (typeof message !== 'string' || Buffer.byteLength(message, 'utf8') > MAX_PUBSUB_BYTES) {
      return null;
    }
    const parsed = JSON.parse(message);
    if (
      !parsed ||
      !Number.isSafeInteger(Number(parsed.userId)) ||
      Number(parsed.userId) <= 0 ||
      parsed.eventName !== 'notification' ||
      !parsed.data ||
      typeof parsed.data !== 'object' ||
      Array.isArray(parsed.data)
    ) return null;
    return { userId: Number(parsed.userId), eventName: parsed.eventName, data: parsed.data };
  } catch {
    return null;
  }
}

function consumeIpMessage(ip, now = Date.now()) {
  const recent = (messageTimesByIp.get(ip) || []).filter((timestamp) => now - timestamp < 60_000);
  if (recent.length >= env.websocket.maxMessagesPerMinute) {
    messageTimesByIp.set(ip, recent);
    return false;
  }
  recent.push(now);
  messageTimesByIp.set(ip, recent);
  return true;
}

function consumeHandshake(ip, now = Date.now()) {
  const recent = (handshakeTimesByIp.get(ip) || []).filter((timestamp) => now - timestamp < 60_000);
  if (recent.length >= env.websocket.maxHandshakesPerMinute) {
    handshakeTimesByIp.set(ip, recent);
    return false;
  }
  recent.push(now);
  handshakeTimesByIp.set(ip, recent);
  if (handshakeTimesByIp.size > 10_000) {
    for (const [key, timestamps] of handshakeTimesByIp) {
      if (!timestamps.some((timestamp) => now - timestamp < 60_000)) handshakeTimesByIp.delete(key);
    }
  }
  return true;
}

export async function initializeWebSocket(httpServer) {
  const io = new Server(httpServer, {
    maxHttpBufferSize: env.websocket.maxPayloadBytes,
    allowRequest: (request, callback) => {
      const ip = env.websocket.trustProxy && request.headers['x-forwarded-for']
        ? request.headers['x-forwarded-for'].split(',')[0].trim()
        : request.socket.remoteAddress || 'unknown';
      const underHandshakeLimit = consumeHandshake(ip);
      const underConnectionLimit = (connectionsByIp.get(ip) || 0) < env.websocket.maxConnectionsPerIp;
      const allowed = underHandshakeLimit && underConnectionLimit;
      if (!underHandshakeLimit) increment('websocket_rejections_total', { reason: 'handshake_rate_limit' }, 1, 'Rejected WebSocket connections');
      else if (!underConnectionLimit) increment('websocket_rejections_total', { reason: 'connection_limit' }, 1, 'Rejected WebSocket connections');
      callback(null, allowed);
    },
  });

  setIoInstance(io);
  await connectRedisSubscriber();
  await redisSubscriber.subscribe(NOTIFICATION_CHANNEL, (message) => {
    const delivery = parseDeliveryMessage(message);
    if (!delivery) {
      increment('notification_delivery_total', { outcome: 'invalid_pubsub' }, 1, 'Notification delivery outcomes');
      logger.warn({}, 'Ignored malformed Redis notification message');
      return;
    }
    try {
      deliverLocally(delivery.userId, delivery.eventName, delivery.data);
      increment('notification_delivery_total', { outcome: 'received_pubsub' }, 1, 'Notification delivery outcomes');
    } catch (err) {
      increment('notification_delivery_total', { outcome: 'local_delivery_error' }, 1, 'Notification delivery outcomes');
      logger.error({ err }, 'Failed to deliver Redis notification message');
    }
  });
  await redisSubscriber.subscribe(SESSION_REVOKE_CHANNEL, (message) => {
    try {
      if (typeof message !== 'string' || Buffer.byteLength(message, 'utf8') > 256) throw new Error('invalid size');
      const { sessionId } = JSON.parse(message);
      if (typeof sessionId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(sessionId)) {
        throw new Error('invalid session identifier');
      }
      disconnectSessionLocally(sessionId);
    } catch {
      increment('session_revocation_notifications_total', { outcome: 'invalid_message' }, 1, 'Session revocation notifications');
      logger.warn({}, 'Ignored malformed session revocation message');
    }
  });

  io.use(createSocketAuthMiddleware(connectionsByIp));
  io.on('connection', async (socket) => {
    const ip = socket.clientIp;
    const syncStartedAt = Date.now();
    addGauge('websocket_connections', 1, 'Current authenticated WebSocket connections');
    increment('websocket_connections_total', {}, 1, 'Authenticated WebSocket connections');
    socket.onAny(() => {
      if (!consumeIpMessage(ip)) {
        increment('websocket_rejections_total', { reason: 'message_rate_limit' }, 1, 'Rejected WebSocket connections');
        socket.disconnect(true);
      }
    });

    try {
      const room = `user:${socket.userId}`;
      socket.join(room);
      if (socket.sessionId) socket.join(`session:${socket.sessionId}`);
      logger.info({ userId: socket.userId, room }, 'User connected');
      const unread = await getUnreadNotificationsForUser(socket.userId, { limit: 50, offset: 0 });
      observeUnreadSync(unread.length, Date.now() - syncStartedAt);
      socket.emit('sync', { notifications: unread });
    } catch (err) {
      observeUnreadSync(0, Date.now() - syncStartedAt, 'error');
      increment('websocket_sync_failures_total', {}, 1, 'WebSocket unread sync failures');
      logger.error({ userId: socket.userId, err }, 'Failed during connection setup');
    }

    socket.on('disconnect', () => {
      socket.releaseIpReservation?.();
      if (!connectionsByIp.has(ip)) messageTimesByIp.delete(ip);
      addGauge('websocket_connections', -1, 'Current authenticated WebSocket connections');
      logger.info({ userId: socket.userId }, 'User disconnected');
    });
  });

  return io;
}

export { parseDeliveryMessage, consumeHandshake, consumeIpMessage };
