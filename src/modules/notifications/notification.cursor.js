import { z } from 'zod';
import { ValidateError } from '../../common/errors/index.js';

const cursorPositionSchema = z.object({
  createdAt: z.string().datetime({ offset: true }),
  id: z.number().int().positive(),
});

export function encodeNotificationCursor(notification) {
  return Buffer.from(JSON.stringify({
    createdAt: notification.cursor_created_at || new Date(notification.created_at).toISOString(),
    id: notification.id,
  })).toString('base64url');
}

export function decodeNotificationCursor(cursor) {
  try {
    const value = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    const result = cursorPositionSchema.safeParse(value);
    if (!result.success) throw new Error('Invalid cursor payload');
    return result.data;
  } catch {
    throw new ValidateError('Invalid notification cursor');
  }
}
