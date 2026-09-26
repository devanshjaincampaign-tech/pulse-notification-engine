import { z } from 'zod';
import { EVENT_TYPES } from './eventTypes.js';

const eventTypeValues = Object.values(EVENT_TYPES);

export const eventEnvelopeSchema = z.object({
  eventId: z.string().uuid(),
  eventType: z.enum(eventTypeValues),
  timestamp: z.string().datetime({ offset: true }),
  source: z.string().trim().min(1).max(255),
  actorId: z.number().int().positive().nullable(),
  targetUserId: z.number().int().positive(),
  payload: z.record(z.string(), z.unknown()),
});

export const postLikedEventBodySchema = z.object({
  targetUserId: z.coerce.number().int().positive(),
  postId: z.string().trim().min(1),
});

export const userFollowedEventBodySchema = z.object({
  targetUserId: z.coerce.number().int().positive(),
});
