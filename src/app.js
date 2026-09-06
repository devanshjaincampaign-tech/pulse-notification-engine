import express from 'express';
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

const app = express();

app.use(requestIdMiddleware);
app.use(helmet());
app.use(cors(corsOptions));
app.use(express.json({ limit: '10kb' }));

app.use((req, res, next) => {
  logger.info({ requestId: req.requestId, method: req.method, path: req.path }, 'Incoming request');
  next();
});

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

app.use('/api/auth', authRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/test-events', testEventRoutes);
app.use('/api/preferences', preferenceRoutes);

app.use(errorHandler);

export default app;