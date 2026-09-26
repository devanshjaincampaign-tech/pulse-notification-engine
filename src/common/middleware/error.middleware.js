import { logger } from '../../config/logger.js';

export function errorHandler(err,req,res,next){
    const statusCode =err.statusCode || 500;
    const message=err.statusCode?err.message : 'Internal server error';

    logger[statusCode >= 500 ? 'error' : 'warn']({
        requestId: req.requestId,
        method: req.method,
        path: req.path,
        statusCode,
        err,
    }, 'Request failed');

    res.status(statusCode).json({ error: message});
}