export function buildUserFollowedNotification(event) {
  return {
    eventId: event.eventId,
    recipientId: event.targetUserId,
    actorId: event.actorId,
    type: event.eventType,
    title: 'New Follower',
    message: 'Someone started following you',
    metadata: event.payload,
  };
}