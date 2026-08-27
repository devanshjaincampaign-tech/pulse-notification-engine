import { eventBus } from '../eventBus.js';
import { EVENT_TYPES } from '../eventTypes.js';
import { buildPostLikedNotification } from '../handlers/postLiked.handler.js';
import { createNotification } from '../../modules/notifications/notification.repository.js';
import { emitToUser } from '../../websocket/socketEmitter.js';
import { getPreferenceForType } from '../../modules/preferences/preference.repository.js';

async function handlePostLiked(event) {
  const preference = await getPreferenceForType(event.targetUserId, event.eventType);

  if (preference && !preference.in_app_enabled) {
    console.log(`User ${event.targetUserId} has disabled in-app notifications for ${event.eventType}, skipping`);
    return;
  }

  const notificationData = buildPostLikedNotification(event);

  try {
    const notification = await createNotification(notificationData);
    console.log(`Notification created for event ${event.eventId}`);

    await emitToUser(notification.recipient_id, 'notification', notification);
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