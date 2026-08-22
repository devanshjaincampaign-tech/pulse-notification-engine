import express from 'express';
import authRoutes from './modules/auth/auth.route.js';
import notificationRoutes from './modules/notifications/notification.routes.js';

const app=express();

app.use(express.json());
app.use('/api/auth', authRoutes);
app.use('/api/notifications', notificationRoutes);
app.get('/health',(req,res)=>{
    res.status(200).json({
        status:'ok'
    });
});

export default app;