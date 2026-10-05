import { afterEach, describe, expect, it, vi } from 'vitest';
import { runOutboxCli } from './outbox.js';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('outbox operator CLI', () => {
  it('lists only the requested number of repository rows', async () => {
    const events = [{ event_id: '550e8400-e29b-41d4-a716-446655440000', event_type: 'USER_FOLLOWED' }];
    const list = vi.fn().mockResolvedValue(events);
    const output = vi.spyOn(console, 'log').mockImplementation(() => {});

    await runOutboxCli(['list', '--limit', '10'], { list });

    expect(list).toHaveBeenCalledWith({ limit: 10 });
    expect(output).toHaveBeenCalledWith(JSON.stringify(events, null, 2));
  });

  it('reports replay conflicts instead of silently claiming success', async () => {
    const replay = vi.fn().mockResolvedValue(false);
    const eventId = '550e8400-e29b-41d4-a716-446655440000';

    await expect(runOutboxCli(['replay', eventId, '--confirm'], { replay }))
      .rejects.toThrow('No dead-letter event was replayed');
  });
});
