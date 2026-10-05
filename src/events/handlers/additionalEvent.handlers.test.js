import { describe, expect, it } from 'vitest';
import { EVENT_TYPES } from '../eventTypes.js';
import {
  buildCommentCreatedNotification,
  buildMessageReceivedNotification,
  buildOrderStatusChangedNotification,
  buildPaymentCompletedNotification,
  buildSecurityAlertNotification,
} from './additionalEvent.handlers.js';

const event = (eventType, payload) => ({
  eventId: '00000000-0000-4000-8000-000000000001',
  eventType,
  actorId: null,
  targetUserId: 42,
  payload,
});

describe('additional event notification builders', () => {
  it('builds a comment notification without exposing comment text', () => {
    const result = buildCommentCreatedNotification(event(EVENT_TYPES.COMMENT_CREATED, {
      postId: 'post-1',
      commentId: 'comment-1',
      comment: 'private comment text',
    }));

    expect(result).toMatchObject({
      title: 'New comment',
      message: 'Someone commented on your post.',
      metadata: { postId: 'post-1', commentId: 'comment-1' },
    });
    expect(JSON.stringify(result)).not.toContain('private comment text');
  });

  it('builds a message notification with safe conversation metadata', () => {
    expect(buildMessageReceivedNotification(event(EVENT_TYPES.MESSAGE_RECEIVED, {
      conversationId: 'conversation-1',
      messageId: 'message-1',
      content: 'private message',
    }))).toMatchObject({
      title: 'New message',
      message: 'You received a new message.',
      metadata: { conversationId: 'conversation-1', messageId: 'message-1' },
    });
  });

  it('includes useful order status information', () => {
    expect(buildOrderStatusChangedNotification(event(EVENT_TYPES.ORDER_STATUS_CHANGED, {
      orderId: 'order-12',
      previousStatus: 'processing',
      status: 'shipped',
    }))).toMatchObject({
      title: 'Order status updated',
      message: 'Order order-12 status changed to shipped.',
      metadata: { orderId: 'order-12', previousStatus: 'processing', status: 'shipped' },
    });
  });

  it('formats payment details and exposes only validated fields', () => {
    expect(buildPaymentCompletedNotification(event(EVENT_TYPES.PAYMENT_COMPLETED, {
      paymentId: 'payment-1',
      orderId: 'order-1',
      amount: 1250.5,
      currency: 'USD',
      cardNumber: '4111111111111111',
    }))).toMatchObject({
      title: 'Payment completed',
      message: 'Your payment of USD 1,250.5 is complete.',
      metadata: { paymentId: 'payment-1', orderId: 'order-1', amount: 1250.5, currency: 'USD' },
    });
  });

  it('uses a safe security-alert message and limits metadata', () => {
    expect(buildSecurityAlertNotification(event(EVENT_TYPES.SECURITY_ALERT, {
      alertType: 'new_login',
      details: 'untrusted details',
    }))).toMatchObject({
      title: 'Security alert',
      message: 'A new login was detected on your account.',
      metadata: { alertType: 'new_login' },
    });
  });

  it('rejects malformed payloads at the handler boundary', () => {
    expect(() => buildSecurityAlertNotification(event(EVENT_TYPES.SECURITY_ALERT, {})))
      .toThrow();
  });
});
