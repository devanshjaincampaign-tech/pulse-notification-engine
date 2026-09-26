import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { randomUUID } from 'crypto';
import { pool } from '../../config/database.js';
import { createNotification, getUnreadNotificationsForUser } from './notification.repository.js';

beforeEach(async () => {
  await pool.query('DELETE FROM notifications');
  await pool.query('DELETE FROM users');
});

afterAll(async () => {
  await pool.end();
});

describe('notification.repository (integration)', () => {
  it('returns only unread notifications ordered newest-first', async () => {
    const { rows: [user] } = await pool.query(
      `INSERT INTO users (username, email, password_hash)
       VALUES ($1, $2, $3)
       RETURNING id`,
      ['unreaduser', 'unread@example.com', 'hashedpass']
    );

    const olderUnread = {
      eventId: randomUUID(),
      recipientId: user.id,
      actorId: null,
      type: 'POST_LIKED',
      title: 'Older unread',
      message: 'This one is unread',
      metadata: { source: 'old' },
    };

    const newestUnread = {
      eventId: randomUUID(),
      recipientId: user.id,
      actorId: null,
      type: 'USER_FOLLOWED',
      title: 'Newest unread',
      message: 'This one is also unread',
      metadata: { source: 'new' },
    };

    await createNotification(olderUnread);
    await createNotification(newestUnread);
    await pool.query(
      `INSERT INTO notifications (event_id, recipient_id, actor_id, type, title, message, metadata, is_read)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [randomUUID(), user.id, null, 'POST_LIKED', 'Read item', 'Already read', { source: 'read' }, true]
    );

    const unread = await getUnreadNotificationsForUser(user.id, { limit: 50, offset: 0 });

    expect(unread).toHaveLength(2);
    expect(unread.map((row) => row.title)).toEqual(['Newest unread', 'Older unread']);
    expect(unread.every((row) => row.is_read === false)).toBe(true);
  });
});
