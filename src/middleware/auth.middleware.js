import { verifyToken } from '../utils/jwt.js';
import { isSessionActive } from '../modules/auth/refreshToken.repository.js';

export async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }

  try {
    const payload = verifyToken(authHeader.slice(7));
    if (payload.sessionId && !(await isSessionActive(payload.sessionId, payload.userId))) {
      return res.status(401).json({ error: 'Session revoked or expired' });
    }
    req.user = { userId: payload.userId, sessionId: payload.sessionId || null };
    return next();
  } catch (err) {
    if (err?.name === 'JsonWebTokenError' || err?.name === 'TokenExpiredError' || err?.name === 'NotBeforeError') {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
    return next(err);
  }
}
