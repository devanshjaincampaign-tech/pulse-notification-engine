import { randomUUID } from 'crypto';
import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { claimEvents, markPublished, releaseForRetry, moveToDeadLetter, getOutboxStats } from './outbox.repository.js';
import { dispatchNotificationEvent } from '../consumers/notification.consumer.js';
import { increment, observe, observeOutboxLag, setLabeledGauge } from '../../config/metrics.js';

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
  getStats = getOutboxStats,
  processEvent = dispatchNotificationEvent,
  publish = markPublished,
  retry = releaseForRetry,
  deadLetter = moveToDeadLetter,
} = {}) {
  let timer;
  let stopped = false;
  let running = false;
  let inFlight = Promise.resolve();
  let nextStatsAt = 0;

  async function processBatch() {
    if (stopped || running) return;
    running = true;
    try {
      if (Date.now() >= nextStatsAt) {
        nextStatsAt = Date.now() + 15000;
        try {
          const stats = await getStats();
          for (const { status, count } of stats) {
            setLabeledGauge('outbox_rows', Number(count), { status }, 'Outbox rows by status');
          }
        } catch (error) {
          logger.warn({ error }, 'Could not refresh outbox metrics');
        }
      }
      const events = await claim({ workerId, limit: batchSize, leaseMs });
      for (const storedEvent of events) {
        const processingStartedAt = Date.now();
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
        const occurredAt = new Date(event.timestamp).getTime();
        if (Number.isFinite(occurredAt)) {
          observeOutboxLag(Math.max(0, Date.now() - occurredAt) / 1000);
        }
        try {
          await processEvent(event);
          await publish(event.eventId, workerId);
          increment('outbox_events_total', { result: 'published' }, 1, 'Outbox event processing outcomes');
        } catch (error) {
          const eventId = event.eventId;
          const message = error?.stack || error?.message || String(error);
          if ((event.attempts || 0) >= maxAttempts) {
            await deadLetter(eventId, workerId, message);
            increment('outbox_events_total', { result: 'dead_letter' }, 1, 'Outbox event processing outcomes');
          } else {
            const backoff = Math.min(retryMaxDelayMs, retryBaseDelayMs * 2 ** Math.max(0, (event.attempts || 1) - 1));
            await retry(eventId, workerId, { availableAt: new Date(Date.now() + backoff), error: message });
            increment('outbox_events_total', { result: 'retry' }, 1, 'Outbox event processing outcomes');
          }
          logger.error({ eventId, error: message }, 'Outbox event processing failed');
        } finally {
          observe(
            'outbox_event_processing_duration_ms',
            'Outbox event processing duration in milliseconds',
            Date.now() - processingStartedAt
          );
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
