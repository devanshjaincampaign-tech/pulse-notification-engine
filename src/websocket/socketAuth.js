import { verifyToken } from '../utils/jwt.js';
import { isSessionActive } from '../modules/auth/refreshToken.repository.js';
import { env } from '../config/env.js';
import { increment } from '../config/metrics.js';

export function clientIp(socket) {
  if (env.websocket.trustProxy) {
    const forwarded = socket.handshake.headers['x-forwarded-for'];
    if (typeof forwarded === 'string' && forwarded.length) return forwarded.split(',')[0].trim();
  }
  return socket.handshake.address || 'unknown';
}

export function createSocketAuthMiddleware(connectionCounts = new Map()) {
  return async function socketAuthMiddleware(socket, next) {
    const ip = clientIp(socket);
    if ((connectionCounts.get(ip) || 0) >= env.websocket.maxConnectionsPerIp) {
      increment('websocket_rejections_total', { reason: 'connection_limit' }, 1, 'Rejected WebSocket connections');
      return next(new Error('Connection limit exceeded'));
    }

    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error('No token provided'));

    connectionCounts.set(ip, (connectionCounts.get(ip) || 0) + 1);
    let reserved = true;
    const releaseReservation = () => {
      if (!reserved) return;
      reserved = false;
      const remaining = Math.max(0, (connectionCounts.get(ip) || 1) - 1);
      if (remaining) connectionCounts.set(ip, remaining);
      else connectionCounts.delete(ip);
    };

    try {
      const payload = verifyToken(token);
      if (payload.sessionId && !(await isSessionActive(payload.sessionId, payload.userId))) {
        releaseReservation();
        return next(new Error('Session revoked or expired'));
      }
      socket.userId = payload.userId;
      socket.sessionId = payload.sessionId || null;
      socket.clientIp = ip;
      socket.releaseIpReservation = releaseReservation;
      return next();
    } catch (err) {
      releaseReservation();
      if (!['JsonWebTokenError', 'TokenExpiredError', 'NotBeforeError'].includes(err?.name)) {
        increment('websocket_auth_errors_total', { reason: 'verification_error' }, 1, 'WebSocket authentication errors');
        return next(new Error('Authentication unavailable'));
      }
      return next(new Error('Invalid or expired token'));
    }
  };
}

export const socketAuthMiddleware = createSocketAuthMiddleware();
