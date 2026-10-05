import { describe, expect, it } from 'vitest';
import { buildPostLikedNotification } from './postLiked.handler.js';
import { buildUserFollowedNotification } from './userFollowed.handler.js';
import { EVENT_TYPES } from '../eventTypes.js';

const event = (eventType, payload) => ({
  eventId: '00000000-0000-4000-8000-000000000001',
  eventType,
  actorId: 7,
  targetUserId: 42,
  payload,
});

describe('notification metadata allowlists', () => {
  it('exposes only the post identifier for a like event', () => {
    const notification = buildPostLikedNotification(event(EVENT_TYPES.POST_LIKED, {
      postId: 'post-1',
      privatePayload: 'must not be exposed',
    }));

    expect(notification.metadata).toEqual({ postId: 'post-1' });
  });

  it('does not expose arbitrary follow-event payload fields', () => {
    const notification = buildUserFollowedNotification(event(EVENT_TYPES.USER_FOLLOWED, {
      privatePayload: 'must not be exposed',
    }));

    expect(notification.metadata).toEqual({});
  });
});
