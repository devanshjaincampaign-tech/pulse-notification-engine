import { env } from "./config/env.js";
import { testConnection } from "./config/database.js";
import { connectRedis } from "./config/redis.js";
import { eventBus } from './events/eventBus.js';
import { registerNotificationConsumers } from './events/consumers/notification.consumer.js';
import app from './app.js';

import http from 'http';
import { initializeWebSocket } from './websocket/index.js';

eventBus.on('POST_LIKED', (event) => {
  console.log('TEST LISTENER received event:', event);
});

async function startServer(){
    await testConnection();
    await connectRedis();
    registerNotificationConsumers();

    const httpServer = http.createServer(app);
initializeWebSocket(httpServer);

httpServer.listen(env.port, () => {
  console.log(`server running on port ${env.port}`);
});
}

startServer();