import { eventBus } from '../eventBus.js';
import { EVENT_TYPES } from '../eventTypes.js';
import { buildPostLikedNotification } from '../handlers/postLiked.handler.js';
import { createNotification } from '../../modules/notifications/notification.repository.js';
import { emitToUser } from '../../websocket/socketEmitter.js';
import { getPreferenceForType } from '../../modules/preferences/preference.repository.js';
import { retryWithBackoff } from '../../common/utils/retry.js';
import { logger } from '../../config/logger.js';
async function handlePostLiked(event) {
  try {
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
  } catch (err) {
    if (err.code === '23505') {
      logger.warn({ eventId: event.eventId }, 'Duplicate event detected, skipping');
    } else {
      logger.error({ eventId: event.eventId, err }, 'Failed to process notification event');
    }
  }
}

export function registerNotificationConsumers() {
  eventBus.on(EVENT_TYPES.POST_LIKED, handlePostLiked);
}