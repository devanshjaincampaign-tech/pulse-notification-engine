import { describe, expect, it } from 'vitest';
import { decodeNotificationCursor, encodeNotificationCursor } from './notification.cursor.js';

describe('notification cursor', () => {
  it('round-trips the ordering position', () => {
    const notification = { id: 23, created_at: '2026-10-01T12:00:00.000Z' };
    expect(decodeNotificationCursor(encodeNotificationCursor(notification))).toEqual({
      id: 23,
      createdAt: '2026-10-01T12:00:00.000Z',
    });
  });

  it('preserves PostgreSQL timestamp precision supplied for cursor pagination', () => {
    const timestamp = '2026-10-01T12:00:00.123456Z';
    const cursor = encodeNotificationCursor({
      id: 23,
      created_at: '2026-10-01T12:00:00.123Z',
      cursor_created_at: timestamp,
    });

    expect(decodeNotificationCursor(cursor)).toEqual({ id: 23, createdAt: timestamp });
  });

  it('rejects malformed cursor data', () => {
    expect(() => decodeNotificationCursor('invalid')).toThrow('Invalid notification cursor');
  });
});
