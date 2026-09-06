import { logger } from './logger.js';

const allowedOrigin = process.env.CORS_ORIGIN;

if (process.env.NODE_ENV === 'production' && !allowedOrigin) {
  logger.error({}, 'CORS_ORIGIN is not set in production — this is a security risk');
}

export const corsOptions = {
  origin: process.env.NODE_ENV === 'production' ? allowedOrigin : '*',
  credentials: true,
};