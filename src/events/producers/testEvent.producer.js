import { createEvent } from '../createEvent.js';
import { EVENT_TYPES } from "../eventTypes.js";
import { publishEvent } from '../eventPublisher.js';

export async function emitPostLiked({actorId,targetUserId,postId}){
    const event = createEvent({
        eventType: EVENT_TYPES.POST_LIKED,
        source: 'test-producer',
        actorId,
        targetUserId,
        payload:{postId},
    });

    await publishEvent(event);
    return event;
}

// src/events/producers/testEvent.producer.js — add this function
export async function emitUserFollowed({ actorId, targetUserId }) {
  const event = createEvent({
    eventType: EVENT_TYPES.USER_FOLLOWED,
    source: 'test-producer',
    actorId,
    targetUserId,
    payload: {},
  });

  await publishEvent(event);
  return event;
}