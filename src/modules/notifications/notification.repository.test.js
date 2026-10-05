import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../config/database.js', () => ({
  pool: { query: vi.fn() },
}));

import { pool } from '../../config/database.js';
import { createNotification } from './notification.repository.js';

describe('createNotification', () => {
  beforeEach(() => vi.clearAllMocks());

  it('fails explicitly if a conflicting notification disappears before it is fetched', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    await expect(createNotification({
      eventId: 'event-1',
      recipientId: 42,
      actorId: null,
      type: 'POST_LIKED',
      title: 'New Like',
      message: 'Someone liked your post',
      metadata: { postId: 'post-1' },
    })).rejects.toThrow('Notification conflict row for event event-1 no longer exists');
  });
});
