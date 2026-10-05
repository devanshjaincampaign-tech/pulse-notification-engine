import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createNotification: vi.fn(),
  findUserEmailById: vi.fn(),
  emitToUser: vi.fn(),
  getPreferenceForType: vi.fn(),
  sendNotificationEmail: vi.fn(),
}));

vi.mock('../../modules/notifications/notification.repository.js', () => ({
  createNotification: mocks.createNotification,
}));
vi.mock('../../modules/auth/auth.repository.js', () => ({
  findUserEmailById: mocks.findUserEmailById,
}));
vi.mock('../../websocket/socketEmitter.js', () => ({
  emitToUser: mocks.emitToUser,
}));
vi.mock('../../modules/preferences/preference.repository.js', () => ({
  getPreferenceForType: mocks.getPreferenceForType,
}));
vi.mock('../../email/email.service.js', () => ({
  sendNotificationEmail: mocks.sendNotificationEmail,
}));

import { dispatchNotificationEvent } from './notification.consumer.js';
import { createOutboxWorker } from '../outbox/outbox.worker.js';

const baseEvent = {
  eventId: '00000000-0000-4000-8000-000000000001',
  eventType: 'COMMENT_CREATED',
  timestamp: '2026-01-01T00:00:00.000Z',
  source: 'test',
  actorId: 7,
  targetUserId: 42,
  payload: { postId: 'post-1', commentId: 'comment-1' },
};

describe('notification event consumer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createNotification.mockResolvedValue({
      id: 10,
      recipient_id: 42,
    });
    mocks.findUserEmailById.mockResolvedValue('recipient@example.com');
    mocks.getPreferenceForType.mockResolvedValue({
      in_app_enabled: true,
      email_enabled: true,
    });
  });

  it('creates and emits in-app notifications and sends enabled email', async () => {
    await dispatchNotificationEvent(baseEvent);

    expect(mocks.createNotification).toHaveBeenCalledWith(expect.objectContaining({
      eventId: baseEvent.eventId,
      title: 'New comment',
      metadata: { postId: 'post-1', commentId: 'comment-1' },
    }));
    expect(mocks.emitToUser).toHaveBeenCalledWith(
      42,
      'notification',
      expect.objectContaining({ recipient_id: 42 })
    );
    expect(mocks.sendNotificationEmail).toHaveBeenCalledWith({
      to: 'recipient@example.com',
      notification: expect.objectContaining({ title: 'New comment' }),
    });
  });

  it('honors disabled email while retaining in-app delivery', async () => {
    mocks.getPreferenceForType.mockResolvedValue({
      in_app_enabled: true,
      email_enabled: false,
    });

    await dispatchNotificationEvent(baseEvent);

    expect(mocks.createNotification).toHaveBeenCalledOnce();
    expect(mocks.sendNotificationEmail).not.toHaveBeenCalled();
  });

  it('does not send email unless the recipient has explicitly enabled it', async () => {
    mocks.getPreferenceForType.mockResolvedValue(null);

    await dispatchNotificationEvent(baseEvent);

    expect(mocks.createNotification).toHaveBeenCalledOnce();
    expect(mocks.sendNotificationEmail).not.toHaveBeenCalled();
  });

  it('delivers email even when in-app notifications are disabled', async () => {
    mocks.getPreferenceForType.mockResolvedValue({
      in_app_enabled: false,
      email_enabled: true,
    });

    await dispatchNotificationEvent(baseEvent);

    expect(mocks.createNotification).not.toHaveBeenCalled();
    expect(mocks.emitToUser).not.toHaveBeenCalled();
    expect(mocks.sendNotificationEmail).toHaveBeenCalledOnce();
  });

  it('propagates email delivery failures so the outbox can retry', async () => {
    const smtpError = new Error('SMTP connection failed');
    mocks.sendNotificationEmail.mockRejectedValue(smtpError);

    const retry = vi.fn();
    const publish = vi.fn();
    const worker = createOutboxWorker({
      claim: vi.fn().mockResolvedValue([{
        event_id: baseEvent.eventId,
        event_type: baseEvent.eventType,
        source: baseEvent.source,
        actor_id: baseEvent.actorId,
        target_user_id: baseEvent.targetUserId,
        payload: baseEvent.payload,
        occurred_at: baseEvent.timestamp,
        attempts: 1,
      }]),
      getStats: vi.fn().mockResolvedValue([]),
      processEvent: dispatchNotificationEvent,
      retry,
      publish,
      retryBaseDelayMs: 1,
      retryMaxDelayMs: 10,
    });

    await worker.processBatch();

    expect(retry).toHaveBeenCalledWith(
      baseEvent.eventId,
      worker.workerId,
      expect.objectContaining({ error: expect.stringContaining('SMTP connection failed') })
    );
    expect(publish).not.toHaveBeenCalled();
  });
});
