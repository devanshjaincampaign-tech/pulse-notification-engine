import { describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
});

import { listDeadLetterEvents, replayDeadLetterEvent } from './outbox.repository.js';

describe('outbox operator repository methods', () => {
  it('lists only safe dead-letter metadata with a parameterized bounded limit', async () => {
    const client = { query: vi.fn().mockResolvedValue({ rows: [] }) };

    await listDeadLetterEvents({ limit: 25, client });

    const [sql, parameters] = client.query.mock.calls[0];
    expect(sql).toContain("WHERE status = 'dead_letter'");
    expect(sql).toContain('LIMIT $1');
    expect(sql).not.toMatch(/payload|last_error/);
    expect(parameters).toEqual([25]);
  });

  it('requeues only a row currently in dead-letter state', async () => {
    const client = { query: vi.fn().mockResolvedValue({ rowCount: 1 }) };
    const eventId = '550e8400-e29b-41d4-a716-446655440000';

    await expect(replayDeadLetterEvent(eventId, client)).resolves.toBe(true);

    const [sql, parameters] = client.query.mock.calls[0];
    expect(sql).toContain("WHERE event_id = $1 AND status = 'dead_letter'");
    expect(sql).toContain('attempts = 0');
    expect(parameters).toEqual([eventId]);
  });
});
