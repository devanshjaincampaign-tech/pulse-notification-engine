import express from 'express';
import authRoutes from './modules/auth/auth.route.js';
import notificationRoutes from './modules/notifications/notification.routes.js';
import testEventRoutes from './events/producers/testEvent.routes.js';
import preferenceRoutes from './modules/preferences/preference.routes.js';
import { errorHandler } from './common/middleware/error.middleware.js';
import { requestIdMiddleware } from './common/middleware/requestId.middleware.js';
import { logger } from './config/logger.js';
const app=express();

app.use(requestIdMiddleware);
app.use(express.json());
app.use('/api/auth', authRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/test-events', testEventRoutes);
app.use('/api/preferences', preferenceRoutes);
app.use(errorHandler);
app.use((req, res, next) => {
  logger.info({ requestId: req.requestId, method: req.method, path: req.path }, 'Incoming request');
  next();
});
app.get('/health',(req,res)=>{
    res.status(200).json({
        status:'ok'
    });
});

export default app;