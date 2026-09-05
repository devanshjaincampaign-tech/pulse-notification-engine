import rateLimit from 'express-rate-limit';

export const authRateLimiter=rateLimit({
    windowMs: 15*60*1000,
    max:5,
    message: { error: 'Too many attempts. please try again later'},
    standardHeaders: true,
    legacyHeaders:false,
});

