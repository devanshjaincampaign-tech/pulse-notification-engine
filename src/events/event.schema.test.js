import { describe, expect, it } from 'vitest';
import { createEvent } from './createEvent.js';
import {
  eventPayloadSchemas,
  eventEnvelopeSchema,
  postLikedEventBodySchema,
  userFollowedEventBodySchema,
} from './event.schema.js';
import { EVENT_TYPES } from './eventTypes.js';

describe('event validation', () => {
  it('creates an event matching the envelope schema', () => {
    const event = createEvent({
      eventType: EVENT_TYPES.POST_LIKED,
      source: 'test-producer',
      actorId: 1,
      targetUserId: 2,
      payload: { postId: 'post-1' },
    });

    expect(eventEnvelopeSchema.safeParse(event).success).toBe(true);
  });

  it('rejects malformed envelopes and unknown event types', () => {
    const result = eventEnvelopeSchema.safeParse({
      eventId: 'not-a-uuid',
      eventType: 'NOT_AN_EVENT',
      timestamp: 'not-a-date',
      source: '',
      actorId: null,
      targetUserId: 0,
      payload: {},
    });

    expect(result.success).toBe(false);
    expect(eventEnvelopeSchema.safeParse({
      eventId: '00000000-0000-4000-8000-000000000001',
      eventType: 'NOT_AN_EVENT',
      timestamp: '2026-01-01T00:00:00.000Z',
      source: 'test-producer',
      actorId: null,
      targetUserId: 42,
      payload: {},
    }).success).toBe(false);
  });

  it('validates development test-event request bodies', () => {
    expect(postLikedEventBodySchema.parse({
      targetUserId: '2',
      postId: 'post-1',
    })).toEqual({ targetUserId: 2, postId: 'post-1' });

    expect(userFollowedEventBodySchema.safeParse({ targetUserId: 0 }).success).toBe(false);
  });

  it('validates payloads for every notification event type', () => {
    const validPayloads = {
      [EVENT_TYPES.POST_LIKED]: { postId: 'post-1' },
      [EVENT_TYPES.USER_FOLLOWED]: {},
      [EVENT_TYPES.COMMENT_CREATED]: { postId: 'post-1', commentId: 'comment-1' },
      [EVENT_TYPES.MESSAGE_RECEIVED]: { conversationId: 'conversation-1', messageId: 'message-1' },
      [EVENT_TYPES.ORDER_STATUS_CHANGED]: { orderId: 'order-1', status: 'shipped' },
      [EVENT_TYPES.PAYMENT_COMPLETED]: {
        paymentId: 'payment-1',
        orderId: 'order-1',
        amount: 25.5,
        currency: 'USD',
      },
      [EVENT_TYPES.SECURITY_ALERT]: { alertType: 'new_login' },
    };

    for (const [eventType, payload] of Object.entries(validPayloads)) {
      expect(eventPayloadSchemas[eventType].safeParse(payload).success).toBe(true);
      expect(eventEnvelopeSchema.safeParse({
        eventId: '00000000-0000-4000-8000-000000000001',
        eventType,
        timestamp: '2026-01-01T00:00:00.000Z',
        source: 'test-producer',
        actorId: null,
        targetUserId: 42,
        payload,
      }).success).toBe(true);
    }
  });

  it('rejects missing or malformed event-specific payload fields before persistence', () => {
    const invalidPayloads = [
      [EVENT_TYPES.COMMENT_CREATED, { commentId: 'comment-1' }],
      [EVENT_TYPES.MESSAGE_RECEIVED, {}],
      [EVENT_TYPES.ORDER_STATUS_CHANGED, { orderId: 'order-1', status: '' }],
      [EVENT_TYPES.PAYMENT_COMPLETED, { paymentId: 'payment-1', amount: -1, currency: 'usd' }],
      [EVENT_TYPES.SECURITY_ALERT, { alertType: 'new login' }],
    ];

    for (const [eventType, payload] of invalidPayloads) {
      expect(eventPayloadSchemas[eventType].safeParse(payload).success).toBe(false);
      expect(eventEnvelopeSchema.safeParse({
        eventId: '00000000-0000-4000-8000-000000000001',
        eventType,
        timestamp: '2026-01-01T00:00:00.000Z',
        source: 'test-producer',
        actorId: null,
        targetUserId: 42,
        payload,
      }).success).toBe(false);
    }
  });
});
