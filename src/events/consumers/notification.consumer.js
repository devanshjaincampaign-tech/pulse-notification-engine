import { EVENT_TYPES } from '../eventTypes.js';
import { eventEnvelopeSchema } from '../event.schema.js';
import {
  buildCommentCreatedNotification,
  buildMessageReceivedNotification,
  buildOrderStatusChangedNotification,
  buildPaymentCompletedNotification,
  buildSecurityAlertNotification,
} from '../handlers/additionalEvent.handlers.js';
import { buildPostLikedNotification } from '../handlers/postLiked.handler.js';
import { buildUserFollowedNotification } from '../handlers/userFollowed.handler.js';
import { createNotification } from '../../modules/notifications/notification.repository.js';
import { findUserEmailById } from '../../modules/auth/auth.repository.js';
import { emitToUser } from '../../websocket/socketEmitter.js';
import { getPreferenceForType } from '../../modules/preferences/preference.repository.js';
import { retryWithBackoff } from '../../common/utils/retry.js';
import { sendNotificationEmail } from '../../email/email.service.js';
import { logger } from '../../config/logger.js';
import { increment } from '../../config/metrics.js';

const notificationBuilders = {
  [EVENT_TYPES.POST_LIKED]: buildPostLikedNotification,
  [EVENT_TYPES.USER_FOLLOWED]: buildUserFollowedNotification,
  [EVENT_TYPES.COMMENT_CREATED]: buildCommentCreatedNotification,
  [EVENT_TYPES.MESSAGE_RECEIVED]: buildMessageReceivedNotification,
  [EVENT_TYPES.ORDER_STATUS_CHANGED]: buildOrderStatusChangedNotification,
  [EVENT_TYPES.PAYMENT_COMPLETED]: buildPaymentCompletedNotification,
  [EVENT_TYPES.SECURITY_ALERT]: buildSecurityAlertNotification,
};

async function createInAppNotification(notificationData) {
  let notification;
  try {
    notification = await retryWithBackoff(
      () => createNotification(notificationData),
      { isRetryable: (error) => error.code !== '23505' }
    );
  } catch (error) {
    increment(
      'notification_creation_errors_total',
      { event_type: notificationData.type },
      1,
      'Notification creation errors'
    );
    throw error;
  }

  logger.info(
    {
      eventId: notificationData.eventId,
      userId: notification.recipient_id,
      notificationId: notification.id,
    },
    'Notification created'
  );
  await emitToUser(notification.recipient_id, 'notification', notification);
}

export async function dispatchNotificationEvent(event, {
  sendEmail = sendNotificationEmail,
} = {}) {
  const timestamp = event.timestamp instanceof Date
    ? event.timestamp.toISOString()
    : event.timestamp;
  const validatedEvent = eventEnvelopeSchema.parse({ ...event, timestamp });
  const buildNotification = notificationBuilders[validatedEvent.eventType];
  const notification = buildNotification(validatedEvent);
  const preference = await getPreferenceForType(
    validatedEvent.targetUserId,
    validatedEvent.eventType
  );

  const inAppEnabled = preference?.in_app_enabled ?? true;
  const emailEnabled = preference?.email_enabled ?? false;

  if (inAppEnabled) {
    await createInAppNotification(notification);
  }

  if (emailEnabled) {
    const recipientEmail = await findUserEmailById(validatedEvent.targetUserId);
    if (!recipientEmail) {
      throw new Error(`No email address found for notification recipient ${validatedEvent.targetUserId}`);
    }
    await sendEmail({ to: recipientEmail, notification });
    logger.info(
      { eventId: validatedEvent.eventId, userId: validatedEvent.targetUserId },
      'Notification email sent'
    );
  }

  if (!inAppEnabled && !emailEnabled) {
    logger.info(
      { eventId: validatedEvent.eventId, userId: validatedEvent.targetUserId, eventType: validatedEvent.eventType },
      'Notification skipped due to user preferences'
    );
  }
}

// Kept as a compatibility no-op for callers that used the old in-process bus.
export function registerNotificationConsumers() {
  return dispatchNotificationEvent;
}
