import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { pool } from '../../config/database.js';
import { withTransaction } from '../../config/transaction.js';
import { findUserByEmail, createUser } from './auth.repository.js';
import {
  createSession,
  storeRefreshToken,
  findRefreshTokenForUpdate,
  rotateRefreshToken,
  isSessionActive,
  revokeSession,
  listSessions,
  cleanupExpiredSessions,
} from './refreshToken.repository.js';

beforeEach(async () => {
  await pool.query('DELETE FROM users');
});

afterAll(async () => {
  await pool.end();
});

describe('auth.repository (integration)', () => {
  it('createUser inserts a real row and findUserByEmail retrieves it', async () => {
    await createUser({
      username: 'integrationuser',
      email: 'integration@example.com',
      passwordHash: 'fakehash123',
    });

    const found = await findUserByEmail('integration@example.com');

    expect(found).not.toBeNull();
    expect(found.username).toBe('integrationuser');
    expect(found.password_hash).toBe('fakehash123');
  });

  it('findUserByEmail returns null for a genuinely nonexistent email', async () => {
    const found = await findUserByEmail('doesnotexist@example.com');
    expect(found).toBeNull();
  });

  it('persists device sessions, rotates token history, and revokes access by session', async () => {
    const user = await createUser({
      username: 'sessionuser',
      email: 'session@example.com',
      passwordHash: 'hash',
    });
    const expiresAt = new Date(Date.now() + 60_000);
    const sessionId = await createSession(user.id, {
      deviceName: 'laptop',
      userAgent: 'integration-test',
      ipAddress: '127.0.0.1',
      expiresAt,
    });
    const tokenId = await storeRefreshToken(user.id, 'old-hash', expiresAt, sessionId);

    expect(await isSessionActive(sessionId, user.id)).toBe(true);
    expect((await listSessions(user.id))[0].device_name).toBe('laptop');

    const nextTokenId = await storeRefreshToken(user.id, 'new-hash', expiresAt, sessionId);
    await withTransaction((client) =>
      rotateRefreshToken(tokenId, nextTokenId, sessionId, expiresAt, client)
    );
    const oldToken = await pool.query('SELECT revoked_at, replaced_by_id FROM refresh_tokens WHERE id = $1', [tokenId]);
    expect(oldToken.rows[0].revoked_at).not.toBeNull();
    expect(oldToken.rows[0].replaced_by_id).toBe(nextTokenId);

    await revokeSession(sessionId, user.id);
    expect(await isSessionActive(sessionId, user.id)).toBe(false);
    expect(await listSessions(user.id)).toEqual([]);
  });

  it('cleans up expired sessions and their refresh-token history', async () => {
    const user = await createUser({
      username: 'cleanupuser',
      email: 'cleanup@example.com',
      passwordHash: 'hash',
    });
    const sessionId = await createSession(user.id, {
      expiresAt: new Date(Date.now() + 60_000),
    });
    const legacyTokenId = await storeRefreshToken(
      user.id,
      'expired-legacy-token-hash',
      new Date(Date.now() + 60_000),
      null
    );
    await pool.query(
      `UPDATE user_sessions SET expires_at = NOW() - INTERVAL '31 days' WHERE id = $1`,
      [sessionId]
    );
    await pool.query(
      `UPDATE refresh_tokens SET expires_at = NOW() - INTERVAL '31 days' WHERE id = $1`,
      [legacyTokenId]
    );

    await cleanupExpiredSessions();
    const remaining = await pool.query('SELECT 1 FROM user_sessions WHERE id = $1', [sessionId]);
    const remainingLegacyToken = await pool.query('SELECT 1 FROM refresh_tokens WHERE id = $1', [legacyTokenId]);
    expect(remaining.rowCount).toBe(0);
    expect(remainingLegacyToken.rowCount).toBe(0);
  });
});