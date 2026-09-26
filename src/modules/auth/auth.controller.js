import {
  registerUser,
  login,
  refreshAccessToken,
  logoutSession,
  logoutAllSessions,
  getUserSessions,
} from './auth.service.js';

function sessionContext(req, deviceName) {
  return {
    deviceName,
    userAgent: req.get('user-agent'),
    ipAddress: req.socket?.remoteAddress,
  };
}

export async function registerController(req, res, next) {
  try {
    const { username, email, password } = req.validated.body;
    const result = await registerUser({ username, email, password }, sessionContext(req));
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
}

export async function loginController(req, res, next) {
  try {
    const { email, password, deviceName } = req.validated.body;
    const result = await login({ email, password }, sessionContext(req, deviceName));
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

export function meController(req, res) {
  res.status(200).json({ userId: req.user.userId });
}

export async function refreshController(req, res, next) {
  try {
    const { refreshToken } = req.validated.body;
    const result = await refreshAccessToken(refreshToken, sessionContext(req));
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

export async function sessionsController(req, res, next) {
  try {
    const sessions = await getUserSessions(req.user.userId);
    res.status(200).json({
      sessions: sessions.map((session) => ({
        ...session,
        current: session.id === req.user.sessionId,
      })),
    });
  } catch (err) {
    next(err);
  }
}

export async function logoutController(req, res, next) {
  try {
    await logoutSession(req.user.userId, req.user.sessionId);
    res.status(200).json({ ok: true });
  } catch (err) {
    next(err);
  }
}

export async function logoutDeviceController(req, res, next) {
  try {
    await logoutSession(req.user.userId, req.validated.params.id);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
}

export async function logoutAllController(req, res, next) {
  try {
    await logoutAllSessions(req.user.userId);
    res.status(200).json({ ok: true });
  } catch (err) {
    next(err);
  }
}
