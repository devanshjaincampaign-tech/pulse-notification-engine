import { eventBus } from "../eventBus.js";
import { createEvent } from '../createEvent.js';
import { EVENT_TYPES } from "../eventTypes.js";

export function emitPostLiked({actorId,targetUserId,postId}){
    const event = createEvent({
        eventType: EVENT_TYPES.POST_LIKED,
        source: 'test-producer',
        actorId,
        targetUserId,
        payload:{postId},
    });

    eventBus.emit(event.eventType,event);
}