import { env } from "./config/env.js";
import { testConnection, pool } from "./config/database.js";
import { connectRedis, redisClient, redisSubscriber } from "./config/redis.js";
import { registerNotificationConsumers } from './events/consumers/notification.consumer.js';
import app from './app.js';

import http from 'http';
import { initializeWebSocket } from './websocket/index.js';
import { logger } from './config/logger.js';

let httpServer;

function gracefulShutdown(signal) {
  logger.info({ signal }, 'Shutdown signal received, closing connections');

  httpServer.close(async () => {
    logger.info({}, 'HTTP server closed');

    await pool.end();
    logger.info({}, 'Postgres pool closed');

    await redisClient.quit();
    await redisSubscriber.quit();
    logger.info({}, 'Redis connections closed');

    process.exit(0);
  });

  setTimeout(() => {
    logger.error({}, 'Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
}

async function startServer() {
  await testConnection();
  await connectRedis();
  registerNotificationConsumers();

  httpServer = http.createServer(app);
  await initializeWebSocket(httpServer);

  httpServer.listen(env.port, () => {
    logger.info({ port: env.port }, 'Server started');
  });
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('unhandledRejection', (reason) => {
  logger.error({ reason }, 'Unhandled promise rejection');
});

startServer();