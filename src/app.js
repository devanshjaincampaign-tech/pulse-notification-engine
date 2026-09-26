import express from 'express';
import { env } from './config/env.js';
import authRoutes from './modules/auth/auth.route.js';
import notificationRoutes from './modules/notifications/notification.routes.js';
import testEventRoutes from './events/producers/testEvent.routes.js';
import preferenceRoutes from './modules/preferences/preference.routes.js';
import { errorHandler } from './common/middleware/error.middleware.js';
import { requestIdMiddleware } from './common/middleware/requestId.middleware.js';
import { logger } from './config/logger.js';
import helmet from 'helmet';
import cors from 'cors';
import { corsOptions } from './config/cors.js';
import { pool } from './config/database.js';
import { redisClient, redisSubscriber } from './config/redis.js';
import { observeHttpRequest, renderMetrics } from './config/metrics.js';
import { timingSafeEqual } from 'crypto';

const app = express();

function withTimeout(operation, timeoutMs = 2000) {
  const pending = Promise.resolve().then(operation);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Dependency check timed out')), timeoutMs);
    pending.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

app.use(requestIdMiddleware);
app.use(helmet());
app.use(cors(corsOptions));
app.use(express.json({ limit: '10kb' }));

app.use((req, res, next) => {
  const startedAt = process.hrtime.bigint();
  res.on('finish', () => {
    const route = req.route ? `${req.baseUrl}${req.route.path}` : 'unmatched';
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
    observeHttpRequest(durationMs, req.method, route, res.statusCode);
    logger.info({
      requestId: req.requestId,
      method: req.method,
      route,
      status: res.statusCode,
      durationMs: Math.round(durationMs * 100) / 100,
    }, 'HTTP request completed');
  });
  next();
});

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

app.get('/ready', async (req, res) => {
  const [database, redisPublisher, redisSubscriberReady] = await Promise.allSettled([
    withTimeout(() => pool.query('SELECT 1')),
    withTimeout(() => redisClient.ping()),
    withTimeout(() => redisSubscriber.ping()),
  ]);
  const checks = {
    database: database.status === 'fulfilled',
    redisPublisher: redisPublisher.status === 'fulfilled',
    redisSubscriber: redisSubscriberReady.status === 'fulfilled',
  };
  const ready = Object.values(checks).every(Boolean);
  res.status(ready ? 200 : 503).json({ status: ready ? 'ready' : 'not_ready', checks });
});

app.get('/metrics', (req, res) => {
  if (env.nodeEnv === 'production' || env.metrics.token) {
    const supplied = req.get('authorization')?.replace(/^Bearer\s+/i, '');
    const expected = env.metrics.token;
    const authenticated = supplied && expected &&
      Buffer.byteLength(supplied) === Buffer.byteLength(expected) &&
      timingSafeEqual(Buffer.from(supplied), Buffer.from(expected));
    if (!authenticated) return res.sendStatus(env.nodeEnv === 'production' ? 404 : 401);
  }
  res.set('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
  res.set('Cache-Control', 'no-store');
  res.status(200).send(renderMetrics());
});

app.use('/api/auth', authRoutes);
app.use('/api/notifications', notificationRoutes);
if (env.nodeEnv !== 'production') {
  app.use('/api/test-events', testEventRoutes);
}
app.use('/api/preferences', preferenceRoutes);

app.use(errorHandler);

export default app;