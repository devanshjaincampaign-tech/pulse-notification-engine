import { env } from "./config/env.js";
import { testConnection } from "./config/database.js";
import { connectRedis } from "./config/redis.js";
import { eventBus } from './events/eventBus.js';
import { registerNotificationConsumers } from './events/consumers/notification.consumer.js';
import app from './app.js';

import http from 'http';
import { initializeWebSocket } from './websocket/index.js';
import { logger } from './config/logger.js';

async function startServer(){
    await testConnection();
    await connectRedis();
    registerNotificationConsumers();

    const httpServer = http.createServer(app);
await initializeWebSocket(httpServer);

httpServer.listen(env.port, () => {
  logger.info({ port: env.port }, 'Server started');});
}

startServer();