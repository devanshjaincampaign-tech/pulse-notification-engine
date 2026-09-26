import { EVENT_TYPES } from '../eventTypes.js';
import { buildPostLikedNotification } from '../handlers/postLiked.handler.js';
import { createNotification } from '../../modules/notifications/notification.repository.js';
import { emitToUser } from '../../websocket/socketEmitter.js';
import { getPreferenceForType } from '../../modules/preferences/preference.repository.js';
import { retryWithBackoff } from '../../common/utils/retry.js';
import { logger } from '../../config/logger.js';
import { buildUserFollowedNotification } from '../handlers/userFollowed.handler.js';
async function handlePostLiked(event) {
    const preference = await getPreferenceForType(event.targetUserId, event.eventType);

    if (preference && !preference.in_app_enabled) {
      logger.info(
        { eventId: event.eventId, userId: event.targetUserId, eventType: event.eventType },
        'Notification skipped due to user preference'
      );
      return;
    }

    const notificationData = buildPostLikedNotification(event);

    const notification = await retryWithBackoff(
      () => createNotification(notificationData),
      { isRetryable: (err) => err.code !== '23505' }
    );

    logger.info(
      { eventId: event.eventId, userId: notification.recipient_id, notificationId: notification.id },
      'Notification created'
    );
    await emitToUser(notification.recipient_id, 'notification', notification);
}

async function handleUserFollowed(event) {
    const preference = await getPreferenceForType(event.targetUserId, event.eventType);

    if (preference && !preference.in_app_enabled) {
      logger.info(
        { eventId: event.eventId, userId: event.targetUserId, eventType: event.eventType },
        'Notification skipped due to user preference'
      );
      return;
    }

    const notificationData = buildUserFollowedNotification(event);

    const notification = await retryWithBackoff(
      () => createNotification(notificationData),
      { isRetryable: (err) => err.code !== '23505' }
    );

    logger.info(
      { eventId: event.eventId, userId: notification.recipient_id, notificationId: notification.id },
      'Notification created'
    );
    await emitToUser(notification.recipient_id, 'notification', notification);
}

export async function dispatchNotificationEvent(event) {
  if (event.eventType === EVENT_TYPES.POST_LIKED) return handlePostLiked(event);
  if (event.eventType === EVENT_TYPES.USER_FOLLOWED) return handleUserFollowed(event);
  throw new Error(`Unsupported notification event type: ${event.eventType}`);
}

// Kept as a compatibility no-op for callers that used the old in-process bus.
export function registerNotificationConsumers() {
  return dispatchNotificationEvent;
}