import rateLimit from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import { redisClient } from '../../config/redis.js';

export function createAuthRateLimiter() {
  let limiter = null;

  return (req, res, next) => {
    if (!limiter) {
      limiter = rateLimit({
        windowMs: 15 * 60 * 1000,
        max: 5,
        message: { error: 'Too many attempts, please try again later' },
        standardHeaders: true,
        legacyHeaders: false,
        store: new RedisStore({
          sendCommand: (...args) => redisClient.sendCommand(args),
        }),
      });
    }
    return limiter(req, res, next);
  };
}