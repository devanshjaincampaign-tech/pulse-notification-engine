import { eventBus } from '../eventBus.js';
import { EVENT_TYPES } from '../eventTypes.js';
import { buildPostLikedNotification } from '../handlers/postLiked.handler.js';
import { createNotification } from '../../modules/notifications/notification.repository.js';
import { emitToUser } from '../../websocket/socketEmitter.js';

async function handlePostLiked(event) {
  const notificationData = buildPostLikedNotification(event);

  try {
    const notification = await createNotification(notificationData);
    console.log(`Notification created for event ${event.eventId}`);

    emitToUser(notification.recipient_id, 'notification', notification);
  } catch (err) {
    if (err.code === '23505') {
      console.log(`Duplicate event ${event.eventId} — already processed, skipping`);
    } else {
      console.error('Failed to create notification:', err);
    }
  }
}

export function registerNotificationConsumers() {
  eventBus.on(EVENT_TYPES.POST_LIKED, handlePostLiked);
}