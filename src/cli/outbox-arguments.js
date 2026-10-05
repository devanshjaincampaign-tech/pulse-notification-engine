const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function parseOutboxArguments(args) {
  const [command, ...options] = args;

  if (command === 'list') {
    let limit = 50;
    if (options.length) {
      if (options.length !== 2 || options[0] !== '--limit' || !/^[1-9]\d*$/.test(options[1])) {
        throw new Error('list accepts only --limit <positive integer>');
      }
      limit = Number(options[1]);
      if (!Number.isSafeInteger(limit) || limit > 500) {
        throw new Error('--limit must be between 1 and 500');
      }
    }
    return { command, limit };
  }

  if (command === 'replay') {
    if (
      options.length !== 2 ||
      !UUID_PATTERN.test(options[0]) ||
      options[1] !== '--confirm'
    ) {
      throw new Error('replay requires <event-uuid> --confirm');
    }
    return { command, eventId: options[0] };
  }

  throw new Error('command must be "list" or "replay"');
}
