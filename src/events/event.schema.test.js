import { describe, expect, it } from 'vitest';
import { createEvent } from './createEvent.js';
import {
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
  });

  it('validates development test-event request bodies', () => {
    expect(postLikedEventBodySchema.parse({
      targetUserId: '2',
      postId: 'post-1',
    })).toEqual({ targetUserId: 2, postId: 'post-1' });

    expect(userFollowedEventBodySchema.safeParse({ targetUserId: 0 }).success).toBe(false);
  });
});
