import { pool } from '../../config/database.js';
import { decodeNotificationCursor, encodeNotificationCursor } from './notification.cursor.js';

export async function getNotificationsForUser(recipientId, { limit = 20, offset = 0 } = {}) {
  const { rows } = await pool.query(
    `SELECT id, event_id, actor_id, type, title, message, metadata, is_read, created_at, read_at
     FROM notifications
     WHERE recipient_id = $1
     ORDER BY created_at DESC
     LIMIT $2 OFFSET $3`,
    [recipientId, limit, offset]
  );

  return rows;
}

export async function getNotificationsForUserByCursor(recipientId, { limit = 20, cursor } = {}) {
  const position = cursor ? decodeNotificationCursor(cursor) : null;
  const { rows } = await pool.query(
    `SELECT id, event_id, actor_id, type, title, message, metadata, is_read, created_at, read_at,
            to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS cursor_created_at
     FROM notifications
     WHERE recipient_id = $1
       AND ($2::timestamptz IS NULL OR (created_at, id) < ($2::timestamptz, $3::integer))
     ORDER BY created_at DESC, id DESC
     LIMIT $4`,
    [recipientId, position?.createdAt ?? null, position?.id ?? null, limit + 1]
  );

  const hasMore = rows.length > limit;
  const pageRows = hasMore ? rows.slice(0, limit) : rows;
  const notifications = pageRows.map(({ cursor_created_at, ...notification }) => notification);
  return {
    notifications,
    hasMore,
    nextCursor: hasMore && pageRows.length
      ? encodeNotificationCursor(pageRows[pageRows.length - 1])
      : null,
  };
}

export async function getUnreadNotificationsForUser(recipientId, { limit = 50, offset = 0 } = {}) {
  const { rows } = await pool.query(
    `SELECT id, event_id, actor_id, type, title, message, metadata, is_read, created_at, read_at
     FROM notifications
     WHERE recipient_id = $1 AND is_read = false
     ORDER BY created_at DESC
     LIMIT $2 OFFSET $3`,
    [recipientId, limit, offset]
  );

  return rows;
}

export async function getUnreadCount(recipientId) {
  const { rows } = await pool.query(
    `SELECT COUNT(*) FROM notifications WHERE recipient_id = $1 AND is_read = false`,
    [recipientId]
  );

  return Number(rows[0].count);
}

export async function markAsRead(notificationId, recipientId) {
  const { rows } = await pool.query(
    `UPDATE notifications
     SET is_read = true, read_at = COALESCE(read_at, NOW())
     WHERE id = $1 AND recipient_id = $2
     RETURNING id, is_read, read_at`,
    [notificationId, recipientId]
  );

  return rows[0] || null;
}

export async function markAllAsRead(recipientId) {
  await pool.query(
    `UPDATE notifications
     SET is_read = true, read_at = NOW()
     WHERE recipient_id = $1 AND is_read = false`,
    [recipientId]
  );
}

export async function deleteNotification(notificationId, recipientId) {
  const { rowCount } = await pool.query(
    `DELETE FROM notifications WHERE id = $1 AND recipient_id = $2`,
    [notificationId, recipientId]
  );

  return rowCount > 0;
}

export async function createNotification({ eventId, recipientId, actorId, type, title, message, metadata }) {
  const { rows } = await pool.query(
    `INSERT INTO notifications (event_id, recipient_id, actor_id, type, title, message, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (event_id) DO NOTHING
     RETURNING id, event_id, recipient_id, actor_id, type, title, message, metadata, is_read, created_at`,
    [eventId, recipientId, actorId, type, title, message, metadata]
  );

  if (rows[0]) return rows[0];
  const existing = await pool.query(
    `SELECT id, event_id, recipient_id, actor_id, type, title, message, metadata, is_read, created_at
     FROM notifications WHERE event_id = $1`,
    [eventId]
  );
  if (!existing.rows[0]) {
    throw new Error(`Notification conflict row for event ${eventId} no longer exists`);
  }
  return existing.rows[0];
}
