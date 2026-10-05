import { env } from "./config/env.js";
import { testConnection, pool } from "./config/database.js";
import { connectRedis, redisClient, redisSubscriber } from "./config/redis.js";
import { createOutboxWorker } from './events/outbox/outbox.worker.js';
import app from './app.js';

import http from 'http';
import { initializeWebSocket } from './websocket/index.js';
import { logger } from './config/logger.js';
import { cleanupExpiredSessions } from './modules/auth/auth.service.js';

let httpServer;
let ioServer;
let outboxWorker;
let sessionCleanupTimer;
let shuttingDown = false;
let shutdownPromise;

async function closeResource(label, close) {
  try {
    await close();
    logger.info({ resource: label }, 'Resource closed');
    return true;
  } catch (err) {
    logger.error({ err, resource: label }, 'Could not close resource cleanly');
    return false;
  }
}

async function closeResources() {
  let clean = true;
  if (ioServer) {
    clean = await closeResource('Socket.IO server', () => new Promise((resolve) => {
      ioServer.close(resolve);
    })) && clean;
    ioServer = null;
  }
  if (httpServer?.listening) {
    clean = await closeResource('HTTP server', () => new Promise((resolve, reject) => {
      httpServer.close((err) => (err ? reject(err) : resolve()));
    })) && clean;
  }
  if (outboxWorker) {
    clean = await closeResource('outbox worker', () => outboxWorker.stop()) && clean;
  }
  if (sessionCleanupTimer) clearInterval(sessionCleanupTimer);
  clean = await closeResource('Postgres pool', () => pool.end()) && clean;
  if (redisClient.isOpen) {
    clean = await closeResource('Redis client', () => redisClient.quit()) && clean;
  }
  if (redisSubscriber.isOpen) {
    clean = await closeResource('Redis subscriber', () => redisSubscriber.quit()) && clean;
  }
  return clean;
}

function gracefulShutdown(signal) {
  if (shutdownPromise) return shutdownPromise;
  shuttingDown = true;
  logger.info({ signal }, 'Shutdown signal received, closing connections');

  const forceTimer = setTimeout(() => {
    logger.error({}, 'Forced shutdown after timeout');
    process.exit(1);
  }, 10000);

  shutdownPromise = closeResources().then((clean) => {
    clearTimeout(forceTimer);
    process.exitCode = clean && (signal === 'SIGTERM' || signal === 'SIGINT') ? 0 : 1;
  });
  return shutdownPromise;
}

async function startServer() {
  await testConnection();
  if (shuttingDown) return;
  await connectRedis();
  if (shuttingDown) return;
  await cleanupExpiredSessions();
  if (shuttingDown) return;
  sessionCleanupTimer = setInterval(() => {
    cleanupExpiredSessions().catch((err) => logger.error({ err }, 'Session cleanup failed'));
  }, 24 * 60 * 60 * 1000);
  sessionCleanupTimer.unref?.();
  if (env.appRole !== 'api') {
    outboxWorker = createOutboxWorker().start();
  }

  httpServer = http.createServer(app);
  ioServer = await initializeWebSocket(httpServer);
  if (shuttingDown) return;

  httpServer.on('error', (err) => {
    logger.fatal({ err }, 'HTTP server failed');
    void gracefulShutdown('httpServerError');
  });
  httpServer.listen(env.port, () => {
    logger.info({ port: env.port }, 'Server started');
  });
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('unhandledRejection', (reason) => {
  logger.fatal({ reason }, 'Unhandled promise rejection; shutting down');
  void gracefulShutdown('unhandledRejection');
});

startServer().catch(async (err) => {
  logger.fatal({ err }, 'Server startup failed');
  if (shutdownPromise) {
    process.exitCode = 1;
    return;
  }
  shuttingDown = true;
  const forceTimer = setTimeout(() => {
    logger.error({}, 'Forced shutdown after startup failure');
    process.exit(1);
  }, 10000);
  await closeResources();
  clearTimeout(forceTimer);
  process.exitCode = 1;
});