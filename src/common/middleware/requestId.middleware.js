import { randomUUID } from 'crypto';

export function requestIdMiddleware(req, res, next) {
    req.requestId = randomUUID();
    res.setHeader('X-Request-ID', req.requestId);
    next();
}