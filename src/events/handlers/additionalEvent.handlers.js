import { EVENT_TYPES } from '../eventTypes.js';
import { eventPayloadSchemas } from '../event.schema.js';

function buildNotification(event, { title, message, metadata }) {
  return {
    eventId: event.eventId,
    recipientId: event.targetUserId,
    actorId: event.actorId,
    type: event.eventType,
    title,
    message,
    metadata,
  };
}

export function buildCommentCreatedNotification(event) {
  const payload = eventPayloadSchemas[EVENT_TYPES.COMMENT_CREATED].parse(event.payload);
  return buildNotification(event, {
    title: 'New comment',
    message: 'Someone commented on your post.',
    metadata: {
      postId: payload.postId,
      ...(payload.commentId ? { commentId: payload.commentId } : {}),
    },
  });
}

export function buildMessageReceivedNotification(event) {
  const payload = eventPayloadSchemas[EVENT_TYPES.MESSAGE_RECEIVED].parse(event.payload);
  return buildNotification(event, {
    title: 'New message',
    message: 'You received a new message.',
    metadata: {
      conversationId: payload.conversationId,
      ...(payload.messageId ? { messageId: payload.messageId } : {}),
    },
  });
}

export function buildOrderStatusChangedNotification(event) {
  const payload = eventPayloadSchemas[EVENT_TYPES.ORDER_STATUS_CHANGED].parse(event.payload);
  return buildNotification(event, {
    title: 'Order status updated',
    message: `Order ${payload.orderId} status changed to ${payload.status}.`,
    metadata: {
      orderId: payload.orderId,
      status: payload.status,
      ...(payload.previousStatus ? { previousStatus: payload.previousStatus } : {}),
    },
  });
}

export function buildPaymentCompletedNotification(event) {
  const payload = eventPayloadSchemas[EVENT_TYPES.PAYMENT_COMPLETED].parse(event.payload);
  const amount = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(payload.amount);
  return buildNotification(event, {
    title: 'Payment completed',
    message: `Your payment of ${payload.currency} ${amount} is complete.`,
    metadata: {
      paymentId: payload.paymentId,
      ...(payload.orderId ? { orderId: payload.orderId } : {}),
      amount: payload.amount,
      currency: payload.currency,
    },
  });
}

export function buildSecurityAlertNotification(event) {
  const payload = eventPayloadSchemas[EVENT_TYPES.SECURITY_ALERT].parse(event.payload);
  const descriptions = {
    new_login: 'A new login was detected on your account.',
    password_changed: 'Your account password was changed.',
    suspicious_activity: 'Suspicious activity was detected on your account.',
    account_locked: 'Your account was locked for security reasons.',
  };
  return buildNotification(event, {
    title: 'Security alert',
    message: descriptions[payload.alertType] || 'A security event needs your attention.',
    metadata: { alertType: payload.alertType },
  });
}
