import { describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
});

import { createOutboxWorker } from './outbox.worker.js';

const storedEvent = {
  event_id: '00000000-0000-0000-0000-000000000001',
  event_type: 'USER_FOLLOWED',
  source: 'test',
  actor_id: 1,
  target_user_id: 2,
  payload: {},
  occurred_at: new Date().toISOString(),
  attempts: 1,
};

describe('outbox worker', () => {
  it('claims, dispatches, and publishes events', async () => {
    const processEvent = vi.fn();
    const publish = vi.fn();
    const worker = createOutboxWorker({
      claim: vi.fn().mockResolvedValue([storedEvent]),
      processEvent,
      publish,
    });

    await worker.processBatch();

    expect(processEvent).toHaveBeenCalledWith(expect.objectContaining({
      eventId: storedEvent.event_id,
      eventType: storedEvent.event_type,
      targetUserId: storedEvent.target_user_id,
    }));
    expect(publish).toHaveBeenCalledWith(storedEvent.event_id, worker.workerId);
  });

  it('releases failed events for retry before the attempt limit', async () => {
    const retry = vi.fn();
    const worker = createOutboxWorker({
      claim: vi.fn().mockResolvedValue([storedEvent]),
      processEvent: vi.fn().mockRejectedValue(new Error('temporary')),
      retry,
      retryBaseDelayMs: 1,
      retryMaxDelayMs: 10,
      maxAttempts: 3,
    });

    await worker.processBatch();

    expect(retry).toHaveBeenCalledWith(
      storedEvent.event_id,
      worker.workerId,
      expect.objectContaining({ error: expect.stringContaining('temporary') })
    );
  });

  it('moves exhausted events to the dead-letter state', async () => {
    const deadLetter = vi.fn();
    const worker = createOutboxWorker({
      claim: vi.fn().mockResolvedValue([{ ...storedEvent, attempts: 3 }]),
      processEvent: vi.fn().mockRejectedValue(new Error('permanent')),
      deadLetter,
      maxAttempts: 3,
    });

    await worker.processBatch();

    expect(deadLetter).toHaveBeenCalledWith(
      storedEvent.event_id,
      worker.workerId,
      expect.stringContaining('permanent')
    );
  });
});
