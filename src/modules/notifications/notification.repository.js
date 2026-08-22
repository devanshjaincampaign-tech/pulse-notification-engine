import { pool } from '../../config/database.js';

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
     SET is_read = true, read_at = NOW()
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
  await pool.query(
    `DELETE FROM notifications WHERE id = $1 AND recipient_id = $2`,
    [notificationId, recipientId]
  );
}