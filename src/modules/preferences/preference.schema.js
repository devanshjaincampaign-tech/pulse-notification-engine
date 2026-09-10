import { z } from 'zod';
import { EVENT_TYPES } from '../../events/eventTypes.js';

export const preferenceParamSchema = z.object({
  type: z.enum(Object.values(EVENT_TYPES)),
});

export const preferenceBodySchema = z.object({
  inAppEnabled: z.boolean(),
  emailEnabled: z.boolean(),
});