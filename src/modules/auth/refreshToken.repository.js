import { pool } from '../../config/database.js';

export async function createSession(userId, { deviceName, userAgent, ipAddress, expiresAt }, dbClient = pool) {
  const { rows } = await dbClient.query(
    `INSERT INTO user_sessions (user_id, device_name, user_agent, ip_address, expires_at)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    [userId, deviceName || null, userAgent || null, ipAddress || null, expiresAt]
  );
  return rows[0].id;
}

export async function storeRefreshToken(userId, tokenHash, expiresAt, sessionId, dbClient = pool) {
  const { rows } = await dbClient.query(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at, session_id)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [userId, tokenHash, expiresAt, sessionId]
  );
  return rows[0].id;
}

export async function findRefreshTokenForUpdate(tokenHash, dbClient) {
  const { rows } = await dbClient.query(
    `SELECT id, user_id, session_id, expires_at, revoked_at, replaced_by_id
     FROM refresh_tokens WHERE token_hash = $1 FOR UPDATE`,
    [tokenHash]
  );
  return rows[0] || null;
}

export async function lockActiveSession(sessionId, dbClient) {
  const { rows } = await dbClient.query(
    `SELECT id, user_id FROM user_sessions
     WHERE id = $1 AND revoked_at IS NULL AND expires_at > NOW()
     FOR UPDATE`,
    [sessionId]
  );
  return rows[0] || null;
}

export async function revokeSessionForReuse(sessionId, dbClient) {
  if (!sessionId) return;
  await dbClient.query(
    'UPDATE user_sessions SET revoked_at = COALESCE(revoked_at, NOW()) WHERE id = $1',
    [sessionId]
  );
}

export async function attachRefreshTokenToSession(tokenId, sessionId, dbClient) {
  await dbClient.query(
    'UPDATE refresh_tokens SET session_id = $2 WHERE id = $1 AND session_id IS NULL',
    [tokenId, sessionId]
  );
}

export async function rotateRefreshToken(oldTokenId, newTokenId, sessionId, expiresAt, dbClient) {
  await dbClient.query(
    `UPDATE refresh_tokens
     SET revoked_at = NOW(), replaced_by_id = $2, session_id = COALESCE(session_id, $3)
     WHERE id = $1 AND revoked_at IS NULL`,
    [oldTokenId, newTokenId, sessionId]
  );
  await dbClient.query(
    'UPDATE user_sessions SET last_used_at = NOW(), expires_at = $2 WHERE id = $1',
    [sessionId, expiresAt]
  );
}

export async function revokeSession(sessionId, userId, dbClient = pool) {
  const { rowCount } = await dbClient.query(
    `UPDATE user_sessions SET revoked_at = COALESCE(revoked_at, NOW())
     WHERE id = $1 AND user_id = $2`,
    [sessionId, userId]
  );
  return rowCount === 1;
}

export async function revokeAllSessions(userId, dbClient = pool) {
  const { rows } = await dbClient.query(
    `UPDATE user_sessions SET revoked_at = NOW()
     WHERE user_id = $1 AND revoked_at IS NULL
     RETURNING id`,
    [userId]
  );
  return rows.map((row) => row.id);
}

export async function listSessions(userId, dbClient = pool) {
  const { rows } = await dbClient.query(
    `SELECT id, device_name, user_agent, ip_address, created_at, last_used_at, expires_at
     FROM user_sessions
     WHERE user_id = $1 AND revoked_at IS NULL AND expires_at > NOW()
     ORDER BY last_used_at DESC`,
    [userId]
  );
  return rows;
}

export async function isSessionActive(sessionId, userId, dbClient = pool) {
  const { rowCount } = await dbClient.query(
    `WITH touched AS (
       UPDATE user_sessions
       SET last_used_at = NOW()
       WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL AND expires_at > NOW()
         AND last_used_at < NOW() - INTERVAL '5 minutes'
       RETURNING id
     )
     SELECT id FROM touched
     UNION ALL
     SELECT id FROM user_sessions
     WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL AND expires_at > NOW()
       AND NOT EXISTS (SELECT 1 FROM touched)
     LIMIT 1`,
    [sessionId, userId]
  );
  return rowCount === 1;
}

export async function cleanupExpiredSessions(dbClient = pool) {
  const { rowCount } = await dbClient.query(
    `DELETE FROM user_sessions
     WHERE (expires_at < NOW() - INTERVAL '30 days')
        OR (revoked_at IS NOT NULL AND revoked_at < NOW() - INTERVAL '30 days')`
  );
  const legacy = await dbClient.query(
    `DELETE FROM refresh_tokens
     WHERE session_id IS NULL
       AND ((expires_at < NOW() - INTERVAL '30 days')
         OR (revoked_at IS NOT NULL AND revoked_at < NOW() - INTERVAL '30 days'))`
  );
  return rowCount + legacy.rowCount;
}
