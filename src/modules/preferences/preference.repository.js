import { pool } from '../../config/database.js';

export async function getPreferencesForUser(userId) {
  const { rows } = await pool.query(
    `SELECT notification_type, in_app_enabled, email_enabled
     FROM notification_preferences
     WHERE user_id = $1`,
    [userId]
  );

  return rows;
}

export async function getPreferenceForType(userId, notificationType) {
  const { rows } = await pool.query(
    `SELECT in_app_enabled, email_enabled
     FROM notification_preferences
     WHERE user_id = $1 AND notification_type = $2`,
    [userId, notificationType]
  );

  return rows[0] || null;
}

export async function setPreference(userId, notificationType, { inAppEnabled, emailEnabled }) {
  const { rows } = await pool.query(
    `INSERT INTO notification_preferences (user_id, notification_type, in_app_enabled, email_enabled)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id, notification_type)
     DO UPDATE SET in_app_enabled = $3, email_enabled = $4, updated_at = NOW()
     RETURNING user_id, notification_type, in_app_enabled, email_enabled, updated_at`,
    [userId, notificationType, inAppEnabled, emailEnabled]
  );

  return rows[0];
}