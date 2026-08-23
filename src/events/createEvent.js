import { randomUUID} from 'crypto';

export function createEvent({eventType,source,actorId=null,targetUserId,payload={}}){
    return {
        eventId:randomUUID(),
        eventType,
        timestamp: new Date().toISOString(),
        source,
        actorId,
        targetUserId,
        payload,
    };
}
/*actorId = null as a default — connects directly back to our schema decision: some events genuinely have no actor (security alerts, system events). Rather than forcing every single producer to remember to explicitly pass actorId: null, we default it, so producers that don't have one can simply omit it entirely.*/

/*payload = {} as a default — similarly, some events (like USER_FOLLOWED) might not need any extra metadata at all; defaulting to an empty object means the payload field is always present and always at least a valid object, never undefined, keeping the envelope shape fully consistent regardless of event type.*/

/*eventType, source, targetUserId have no defaults — deliberate: these are required for every single event, no sensible fallback exists (an event with no type, no source, or no recipient is meaningless), so we don't provide defaults, meaning a producer that forgets one of these gets undefined in that field — which, once we build the consumer side properly, we'll want to actually validate against, rather than silently letting broken events through. Flagging that as a known gap for now, not fixing it prematurely. */

/* randomUUID() — generates the actual unique eventId, guaranteed to work correctly with our notifications.event_id UUID column.

new Date().toISOString() — produces a standardized, sortable, unambiguous timestamp string like "2026-08-23T14:30:00.000Z" — the Z indicates UTC, avoiding the exact timezone ambiguity we specifically designed around when choosing TIMESTAMPTZ for our database columns.*/

