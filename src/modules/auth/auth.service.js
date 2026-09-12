import bcrypt from 'bcrypt';
import {findUserByEmail, createUser} from './auth.repository.js';
import { signToken } from '../../utils/jwt.js';
import { ConflictError, UnauthorizedError } from '../../common/errors/index.js';
import { randomBytes } from 'crypto';
import { generateRefreshToken, hashToken } from '../../utils/refreshToken.js';
import { storeRefreshToken, findValidRefreshToken, revokeRefreshToken } from './refreshToken.repository.js';

async function issueTokens(userId) {
  const accessToken = signToken({ userId });

  const refreshToken = generateRefreshToken();
  const tokenHash = hashToken(refreshToken);
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  await storeRefreshToken(userId, tokenHash, expiresAt);

  return { accessToken, refreshToken };
}

export async function registerUser({ username, email, password }) {
  const existingUser = await findUserByEmail(email);

  if (existingUser) {
    throw new ConflictError('Email already registered');
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await createUser({ username, email, passwordHash });
  const { accessToken, refreshToken } = await issueTokens(user.id);

  return { user, accessToken, refreshToken };
}

export async function login({ email, password }) {
  const user = await findUserByEmail(email);

  if (!user) {
    throw new UnauthorizedError('Invalid email or password');
  }

  const isMatch = await bcrypt.compare(password, user.password_hash);

  if (!isMatch) {
    throw new UnauthorizedError('Invalid email or password');
  }

  const { accessToken, refreshToken } = await issueTokens(user.id);

  return {
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      created_at: user.created_at,
    },
    accessToken,
    refreshToken,
  };
}

export async function refreshAccessToken(refreshToken) {
  const tokenHash = hashToken(refreshToken);
  const stored = await findValidRefreshToken(tokenHash);

  if (!stored) {
    throw new UnauthorizedError('Invalid or expired refresh token');
  }

  await revokeRefreshToken(tokenHash);
  const { accessToken, refreshToken: newRefreshToken } = await issueTokens(stored.user_id);

  return { accessToken, refreshToken: newRefreshToken };
}
