import bcrypt from 'bcrypt';
import { findUserByEmail, createUser } from './auth.repository.js';
import { signToken } from '../../utils/jwt.js';
import { ConflictError, UnauthorizedError } from '../../common/errors/index.js';
import { generateRefreshToken, hashToken } from '../../utils/refreshToken.js';
import {
  createSession,
  storeRefreshToken,
  findRefreshTokenForUpdate,
  lockActiveSession,
  attachRefreshTokenToSession,
  rotateRefreshToken,
  revokeSessionForReuse,
  revokeSession,
  revokeAllSessions,
  listSessions,
  cleanupExpiredSessions,
} from './refreshToken.repository.js';
import { withTransaction } from '../../config/transaction.js';
import { publishSessionRevocation } from '../../websocket/socketEmitter.js';
import { logger } from '../../config/logger.js';
import { increment } from '../../config/metrics.js';

const REFRESH_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;

function sessionExpiry() {
  return new Date(Date.now() + REFRESH_LIFETIME_MS);
}

function tokenPair(userId, sessionId) {
  const refreshToken = generateRefreshToken();
  return {
    accessToken: signToken({ userId, sessionId }),
    refreshToken,
    tokenHash: hashToken(refreshToken),
  };
}

async function createUserSession(userId, context, client) {
  const expiresAt = sessionExpiry();
  const sessionId = await createSession(userId, { ...context, expiresAt }, client);
  const tokens = tokenPair(userId, sessionId);
  await storeRefreshToken(userId, tokens.tokenHash, expiresAt, sessionId, client);
  return { sessionId, accessToken: tokens.accessToken, refreshToken: tokens.refreshToken };
}

export async function registerUser({ username, email, password }, context = {}) {
  const existingUser = await findUserByEmail(email);
  if (existingUser) throw new ConflictError('Email already registered');

  const passwordHash = await bcrypt.hash(password, 10);
  return withTransaction(async (client) => {
    const user = await createUser({ username, email, passwordHash }, client);
    const tokens = await createUserSession(user.id, context, client);
    return { user, ...tokens };
  });
}

export async function login({ email, password }, context = {}) {
  const user = await findUserByEmail(email);
  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    throw new UnauthorizedError('Invalid email or password');
  }

  const tokens = await withTransaction((client) => createUserSession(user.id, context, client));
  await cleanupExpiredSessions().catch((err) => {
    logger.warn({ err }, 'Expired session cleanup failed');
  });
  return {
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      created_at: user.created_at,
    },
    ...tokens,
  };
}

export async function refreshAccessToken(refreshToken, context = {}) {
  const tokenHash = hashToken(refreshToken);
  const result = await withTransaction(async (client) => {
    const stored = await findRefreshTokenForUpdate(tokenHash, client);
    if (!stored) return { status: 'invalid' };

    if (stored.revoked_at) {
      if (stored.replaced_by_id) {
        await revokeSessionForReuse(stored.session_id, client);
        return { status: 'reuse', sessionId: stored.session_id };
      }
      return { status: 'invalid' };
    }
    if (new Date(stored.expires_at) <= new Date()) return { status: 'invalid' };

    let sessionId = stored.session_id;
    if (sessionId) {
      const activeSession = await lockActiveSession(sessionId, client);
      if (!activeSession) return { status: 'invalid' };
    } else {
      sessionId = await createSession(stored.user_id, {
        ...context,
        expiresAt: sessionExpiry(),
      }, client);
      await attachRefreshTokenToSession(stored.id, sessionId, client);
    }

    const expiresAt = sessionExpiry();
    const tokens = tokenPair(stored.user_id, sessionId);
    const newTokenId = await storeRefreshToken(
      stored.user_id,
      tokens.tokenHash,
      expiresAt,
      sessionId,
      client
    );
    await rotateRefreshToken(stored.id, newTokenId, sessionId, expiresAt, client);
    return {
      status: 'ok',
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    };
  });

  if (result.status !== 'ok') {
    if (result.status === 'reuse') {
      increment('refresh_token_reuse_total', {}, 1, 'Detected refresh-token replays');
      if (result.sessionId) await notifySessionRevoked(result.sessionId);
    }
    throw new UnauthorizedError('Invalid or expired refresh token');
  }
  return { accessToken: result.accessToken, refreshToken: result.refreshToken };
}

export async function logoutSession(userId, sessionId) {
  if (!sessionId) return false;
  const revoked = await revokeSession(sessionId, userId);
  if (revoked) await notifySessionRevoked(sessionId);
  return revoked;
}

export async function logoutAllSessions(userId) {
  const sessionIds = await revokeAllSessions(userId);
  await Promise.all(sessionIds.map(notifySessionRevoked));
  return sessionIds.length;
}

export async function getUserSessions(userId) {
  return listSessions(userId);
}

async function notifySessionRevoked(sessionId) {
  try {
    await publishSessionRevocation(sessionId);
  } catch (err) {
    logger.error({ sessionId, err }, 'Could not broadcast session revocation');
  }
}

export { cleanupExpiredSessions };
