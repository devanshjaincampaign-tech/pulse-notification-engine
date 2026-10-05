import { describe, expect, it } from 'vitest';
import { parseOutboxArguments } from './outbox-arguments.js';

describe('outbox operator arguments', () => {
  it('defaults to a bounded dead-letter listing', () => {
    expect(parseOutboxArguments(['list'])).toEqual({ command: 'list', limit: 50 });
    expect(parseOutboxArguments(['list', '--limit', '500'])).toEqual({ command: 'list', limit: 500 });
  });

  it('rejects invalid limits and unexpected arguments', () => {
    for (const args of [
      ['list', '--limit', '0'],
      ['list', '--limit', '501'],
      ['list', '--limit', '1;DROP TABLE event_outbox'],
      ['list', '--all'],
    ]) {
      expect(() => parseOutboxArguments(args)).toThrow();
    }
  });

  it('requires an explicit confirmation and a UUID for replay', () => {
    const eventId = '550e8400-e29b-41d4-a716-446655440000';
    expect(parseOutboxArguments(['replay', eventId, '--confirm'])).toEqual({ command: 'replay', eventId });
    expect(() => parseOutboxArguments(['replay', eventId])).toThrow();
    expect(() => parseOutboxArguments(['replay', 'anything', '--confirm'])).toThrow();
  });
});
