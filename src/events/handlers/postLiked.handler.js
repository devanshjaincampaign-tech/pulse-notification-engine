export function buildPostLikedNotification(event) {
  return {
    eventId: event.eventId,
    recipientId: event.targetUserId,
    actorId: event.actorId,
    type: event.eventType,
    title: 'New Like',
    message: `Someone liked your post`,
    metadata: event.payload,
  };
}