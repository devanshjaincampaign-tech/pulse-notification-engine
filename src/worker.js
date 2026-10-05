import { createServer } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { env } from './config/env.js';
import { pool } from './config/database.js';
import { connectRedis, redisClient } from './config/redis.js';
import { logger } from './config/logger.js';
import { renderMetrics } from './config/metrics.js';
import { createOutboxWorker } from './events/outbox/outbox.worker.js';

let worker;
let server;
let shuttingDown = false;

function isAuthorized(request) {
  if (env.nodeEnv !== 'production' && !env.metrics.token) return true;
  const supplied = request.headers.authorization?.replace(/^Bearer\s+/i, '');
  const expected = env.metrics.token;
  return Boolean(supplied && expected &&
    Buffer.byteLength(supplied) === Buffer.byteLength(expected) &&
    timingSafeEqual(Buffer.from(supplied), Buffer.from(expected)));
}

async function dependencyReady(operation) {
  let timeout;
  try {
    await Promise.race([
      operation(),
      new Promise((_, reject) => {
        timeout = setTimeout(() => reject(new Error('timeout')), 2000);
      }),
    ]);
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

async function handleRequest(request, response) {
  if (request.method !== 'GET') {
    response.writeHead(405).end();
    return;
  }
  if (request.url === '/healthz') {
    response.writeHead(200, { 'content-type': 'application/json' }).end('{"status":"ok"}');
    return;
  }
  if (request.url === '/readyz') {
    const health = worker?.getHealth();
    const pollFresh = health?.lastSuccessfulPollAt !== null &&
      health?.lastSuccessfulPollAt !== undefined &&
      Date.now() - health.lastSuccessfulPollAt <= Math.max(health.pollIntervalMs * 3, health.leaseMs * 2);
    const [database, redis] = await Promise.all([
      dependencyReady(() => pool.query('SELECT 1')),
      dependencyReady(() => redisClient.ping()),
    ]);
    const ready = !shuttingDown && health?.started && pollFresh && database && redis;
    response.writeHead(ready ? 200 : 503, { 'content-type': 'application/json' })
      .end(JSON.stringify({ status: ready ? 'ready' : 'not_ready', checks: { database, redis, pollFresh } }));
    return;
  }
  if (request.url === '/metrics') {
    if (!isAuthorized(request)) {
      response.writeHead(env.nodeEnv === 'production' ? 404 : 401).end();
      return;
    }
    response.writeHead(200, {
      'content-type': 'text/plain; version=0.0.4; charset=utf-8',
      'cache-control': 'no-store',
    }).end(renderMetrics());
    return;
  }
  response.writeHead(404).end();
}

async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, 'Outbox worker shutdown requested');
  const forcedExit = setTimeout(() => process.exit(1), 10_000);
  forcedExit.unref?.();
  server?.close(async () => {
    try {
      await worker?.stop();
      await pool.end();
      if (redisClient.isOpen) await redisClient.quit();
      clearTimeout(forcedExit);
      process.exit(0);
    } catch (error) {
      logger.error({ error }, 'Outbox worker shutdown failed');
      process.exit(1);
    }
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

try {
  await pool.query('SELECT 1');
  await connectRedis();
  worker = createOutboxWorker().start();
  server = createServer((request, response) => {
    handleRequest(request, response).catch((error) => {
      logger.error({ error }, 'Worker health endpoint failed');
      if (!response.headersSent) response.writeHead(500);
      response.end();
    });
  });
  server.listen(env.workerHealthPort, () => {
    logger.info({ port: env.workerHealthPort }, 'Outbox worker health server started');
  });
} catch (error) {
  logger.error({ error }, 'Could not start outbox worker');
  await pool.end();
  if (redisClient.isOpen) await redisClient.quit();
  process.exit(1);
}
