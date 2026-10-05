import { z } from 'zod';
import { EVENT_TYPES } from './eventTypes.js';

const eventTypeValues = Object.values(EVENT_TYPES);

const nonEmptyIdentifier = z.string()
  .trim()
  .min(1)
  .max(128)
  .refine((value) => !/[\u0000-\u001f\u007f]/.test(value));
const statusText = z.string()
  .trim()
  .min(1)
  .max(64)
  .refine((value) => !/[\u0000-\u001f\u007f]/.test(value));

export const eventPayloadSchemas = {
  [EVENT_TYPES.POST_LIKED]: z.object({
    postId: nonEmptyIdentifier,
  }),
  [EVENT_TYPES.USER_FOLLOWED]: z.object({}).passthrough(),
  [EVENT_TYPES.COMMENT_CREATED]: z.object({
    postId: nonEmptyIdentifier,
    commentId: nonEmptyIdentifier.optional(),
  }),
  [EVENT_TYPES.MESSAGE_RECEIVED]: z.object({
    conversationId: nonEmptyIdentifier,
    messageId: nonEmptyIdentifier.optional(),
  }),
  [EVENT_TYPES.ORDER_STATUS_CHANGED]: z.object({
    orderId: nonEmptyIdentifier,
    status: statusText,
    previousStatus: statusText.optional(),
  }),
  [EVENT_TYPES.PAYMENT_COMPLETED]: z.object({
    paymentId: nonEmptyIdentifier,
    orderId: nonEmptyIdentifier.optional(),
    amount: z.number().finite().positive(),
    currency: z.string().regex(/^[A-Z]{3}$/),
  }),
  [EVENT_TYPES.SECURITY_ALERT]: z.object({
    alertType: z.string().trim().min(1).max(64).regex(/^[a-zA-Z0-9_-]+$/),
  }),
};

export const eventEnvelopeSchema = z.object({
  eventId: z.string().uuid(),
  eventType: z.enum(eventTypeValues),
  timestamp: z.string().datetime({ offset: true }),
  source: z.string().trim().min(1).max(255),
  actorId: z.number().int().positive().nullable(),
  targetUserId: z.number().int().positive(),
  payload: z.record(z.string(), z.unknown()),
}).superRefine((event, context) => {
  const payloadSchema = eventPayloadSchemas[event.eventType];
  if (!payloadSchema) return;

  const result = payloadSchema.safeParse(event.payload);
  if (!result.success) {
    for (const issue of result.error.issues) {
      context.addIssue({
        ...issue,
        path: ['payload', ...issue.path],
      });
    }
  }
});

export const postLikedEventBodySchema = z.object({
  targetUserId: z.coerce.number().int().positive(),
  postId: z.string().trim().min(1),
});

export const userFollowedEventBodySchema = z.object({
  targetUserId: z.coerce.number().int().positive(),
});
