import { insertEvent } from './outbox/outbox.repository.js';
import { eventEnvelopeSchema } from './event.schema.js';

export async function publishEvent(event) {
  const result = eventEnvelopeSchema.safeParse(event);
  if (!result.success) {
    throw new TypeError('Invalid event envelope');
  }
  await insertEvent(result.data);
  return result.data;
}
