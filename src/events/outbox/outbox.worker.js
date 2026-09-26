import { randomUUID } from 'crypto';
import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { claimEvents, markPublished, releaseForRetry, moveToDeadLetter } from './outbox.repository.js';
import { dispatchNotificationEvent } from '../consumers/notification.consumer.js';

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function createOutboxWorker({
  workerId = randomUUID(),
  pollIntervalMs = env.outbox.pollIntervalMs,
  batchSize = env.outbox.batchSize,
  maxAttempts = env.outbox.maxAttempts,
  retryBaseDelayMs = env.outbox.retryBaseDelayMs,
  retryMaxDelayMs = env.outbox.retryMaxDelayMs,
  leaseMs = env.outbox.leaseMs,
  claim = claimEvents,
  processEvent = dispatchNotificationEvent,
  publish = markPublished,
  retry = releaseForRetry,
  deadLetter = moveToDeadLetter,
} = {}) {
  let timer;
  let stopped = false;
  let running = false;
  let inFlight = Promise.resolve();

  async function processBatch() {
    if (stopped || running) return;
    running = true;
    try {
      const events = await claim({ workerId, limit: batchSize, leaseMs });
      for (const storedEvent of events) {
        const event = {
          eventId: storedEvent.event_id ?? storedEvent.eventId,
          eventType: storedEvent.event_type ?? storedEvent.eventType,
          source: storedEvent.source,
          actorId: storedEvent.actor_id ?? storedEvent.actorId,
          targetUserId: storedEvent.target_user_id ?? storedEvent.targetUserId,
          payload: storedEvent.payload,
          timestamp: storedEvent.occurred_at ?? storedEvent.timestamp,
          attempts: storedEvent.attempts,
        };
        try {
          await processEvent(event);
          await publish(event.eventId, workerId);
        } catch (error) {
          const eventId = event.eventId;
          const message = error?.stack || error?.message || String(error);
          if ((event.attempts || 0) >= maxAttempts) {
            await deadLetter(eventId, workerId, message);
          } else {
            const backoff = Math.min(retryMaxDelayMs, retryBaseDelayMs * 2 ** Math.max(0, (event.attempts || 1) - 1));
            await retry(eventId, workerId, { availableAt: new Date(Date.now() + backoff), error: message });
          }
          logger.error({ eventId, error: message }, 'Outbox event processing failed');
        }
      }
    } finally {
      running = false;
    }
  }

  return {
    start() {
      stopped = false;
      const poll = () => {
        inFlight = processBatch().catch((error) => {
          logger.error({ error }, 'Outbox polling failed');
        });
      };
      poll();
      timer = setInterval(poll, pollIntervalMs);
      timer.unref?.();
      return this;
    },
    async stop() {
      stopped = true;
      if (timer) clearInterval(timer);
      while (running) await delay(10);
      await inFlight;
    },
    processBatch,
    workerId,
  };
}
