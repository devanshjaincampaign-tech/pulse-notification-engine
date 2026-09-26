import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./auth.repository.js', () => ({
  findUserByEmail: vi.fn(),
  createUser: vi.fn(),
}));

vi.mock('bcrypt', () => ({
  default: {
    hash: vi.fn().mockResolvedValue('hashed_password_123'),
    compare: vi.fn().mockResolvedValue(true),
  },
}));

vi.mock('./refreshToken.repository.js', () => ({
  createSession: vi.fn().mockResolvedValue('session-1'),
  storeRefreshToken: vi.fn().mockResolvedValue(12),
  findRefreshTokenForUpdate: vi.fn(),
  lockActiveSession: vi.fn().mockResolvedValue({ id: 'session-1' }),
  attachRefreshTokenToSession: vi.fn(),
  rotateRefreshToken: vi.fn(),
  revokeSessionForReuse: vi.fn(),
  revokeSession: vi.fn(),
  revokeAllSessions: vi.fn(),
  listSessions: vi.fn(),
  cleanupExpiredSessions: vi.fn().mockResolvedValue(0),
}));

vi.mock('../../config/transaction.js', () => ({
  withTransaction: vi.fn((callback) => callback({ query: vi.fn() })),
}));

vi.mock('../../websocket/socketEmitter.js', () => ({
  publishSessionRevocation: vi.fn(),
}));

import { registerUser, login, refreshAccessToken } from './auth.service.js';
import { findUserByEmail, createUser } from './auth.repository.js';
import {
  createSession,
  storeRefreshToken,
  findRefreshTokenForUpdate,
  revokeSessionForReuse,
  rotateRefreshToken,
} from './refreshToken.repository.js';
import { hashToken } from '../../utils/refreshToken.js';
import { publishSessionRevocation } from '../../websocket/socketEmitter.js';

beforeEach(() => vi.clearAllMocks());

describe('authentication session lifecycle', () => {
  it('registers the user and creates session credentials within the same transaction', async () => {
    findUserByEmail.mockResolvedValue(null);
    createUser.mockResolvedValue({ id: 2, username: 'newuser', email: 'new@example.com', created_at: new Date() });

    const result = await registerUser(
      { username: 'newuser', email: 'new@example.com', password: 'password123' },
      { deviceName: 'laptop', userAgent: 'test', ipAddress: '127.0.0.1' }
    );

    expect(result.user.email).toBe('new@example.com');
    expect(result.accessToken).toBeDefined();
    expect(result.refreshToken).toBeDefined();
    expect(createSession).toHaveBeenCalledWith(2, expect.objectContaining({ deviceName: 'laptop' }), expect.anything());
    expect(storeRefreshToken).toHaveBeenCalledWith(2, expect.any(String), expect.any(Date), 'session-1', expect.anything());
  });

  it('rejects duplicate registration', async () => {
    findUserByEmail.mockResolvedValue({ id: 1, email: 'test@example.com' });
    await expect(registerUser({ username: 'test', email: 'test@example.com', password: 'password123' }))
      .rejects.toThrow('Email already registered');
  });

  it('rotates refresh credentials in one transaction and records replacement', async () => {
    findRefreshTokenForUpdate.mockResolvedValue({
      id: 8,
      user_id: 2,
      session_id: 'session-1',
      expires_at: new Date(Date.now() + 60_000),
      revoked_at: null,
      replaced_by_id: null,
    });
    storeRefreshToken.mockResolvedValue(9);

    const result = await refreshAccessToken('refresh-token');

    expect(result.accessToken).toBeDefined();
    expect(result.refreshToken).toBeDefined();
    expect(findRefreshTokenForUpdate).toHaveBeenCalledWith(hashToken('refresh-token'), expect.anything());
    expect(rotateRefreshToken).toHaveBeenCalledWith(8, 9, 'session-1', expect.any(Date), expect.anything());
  });

  it('revokes the session and rejects a reused rotated token', async () => {
    findRefreshTokenForUpdate.mockResolvedValue({
      id: 8,
      user_id: 2,
      session_id: 'session-1',
      expires_at: new Date(Date.now() + 60_000),
      revoked_at: new Date(),
      replaced_by_id: 9,
    });

    await expect(refreshAccessToken('replayed-token')).rejects.toThrow('Invalid or expired refresh token');
    expect(revokeSessionForReuse).toHaveBeenCalledWith('session-1', expect.anything());
    expect(publishSessionRevocation).toHaveBeenCalledWith('session-1');
    expect(storeRefreshToken).not.toHaveBeenCalled();
  });

  it('creates a refresh session after successful login', async () => {
    findUserByEmail.mockResolvedValue({
      id: 7,
      username: 'user',
      email: 'user@example.com',
      password_hash: 'hash',
    });
    const result = await login({ email: 'user@example.com', password: 'password123' });
    expect(result.refreshToken).toBeDefined();
    expect(createSession).toHaveBeenCalled();
  });
});
