import express from 'express';
import authRoutes from './modules/auth/auth.route.js';
import notificationRoutes from './modules/notifications/notification.routes.js';
import testEventRoutes from './events/producers/testEvent.routes.js';
import preferenceRoutes from './modules/preferences/preference.routes.js';
import { errorHandler } from './common/middleware/error.middleware.js';
const app=express();

app.use(express.json());
app.use('/api/auth', authRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/test-events', testEventRoutes);
app.use('/api/preferences', preferenceRoutes);
app.use(errorHandler);

app.get('/health',(req,res)=>{
    res.status(200).json({
        status:'ok'
    });
});

export default app;