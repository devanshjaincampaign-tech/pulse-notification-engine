import { describe, it, expect, vi } from 'vitest';

vi.mock('./notification.repository.js', () => ({
  markAsRead: vi.fn(),
}));

import { markNotificationAsRead } from './notification.service.js';
import { markAsRead } from './notification.repository.js';

describe('markNotificationAsRead', () => {
  it('throws NotFoundError when no matching notification is found', async () => {
    markAsRead.mockResolvedValue(null);

    await expect(
      markNotificationAsRead(999, 1)
    ).rejects.toThrow('Notification not found');
  });

  it('returns the updated notification when found and owned by the user', async () => {
    markAsRead.mockResolvedValue({ id: 5, is_read: true, read_at: new Date() });

    const result = await markNotificationAsRead(5, 1);

    expect(result.id).toBe(5);
    expect(result.is_read).toBe(true);
    expect(markAsRead).toHaveBeenCalledWith(5, 1);
  });
});