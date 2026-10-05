#!/usr/bin/env node
import { pathToFileURL } from 'node:url';
import { parseOutboxArguments } from './outbox-arguments.js';

const usage = `Usage:
  npm run outbox -- list [--limit <1-500>]
  npm run outbox -- replay <event-uuid> --confirm

List output intentionally excludes event payloads and error text.`;

export async function runOutboxCli(args, dependencies = {}) {
  const parsed = parseOutboxArguments(args);
  if (parsed.command === 'list') {
    const list = dependencies.list ||
      (await import('../events/outbox/outbox.repository.js')).listDeadLetterEvents;
    const events = await list({ limit: parsed.limit });
    console.log(JSON.stringify(events, null, 2));
    return;
  }

  const replayDeadLetterEvent = dependencies.replay ||
    (await import('../events/outbox/outbox.repository.js')).replayDeadLetterEvent;
  const replayed = await replayDeadLetterEvent(parsed.eventId);
  if (!replayed) {
    throw new Error('No dead-letter event was replayed; verify the event ID and current status');
  }
  console.log(`Queued dead-letter event ${parsed.eventId} for immediate retry.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let pool;
  try {
    parseOutboxArguments(process.argv.slice(2));
    process.env.PULSE_OPERATOR_CLI = 'true';
    ({ pool } = await import('../config/database.js'));
    await runOutboxCli(process.argv.slice(2));
  } catch (error) {
    console.error(`Outbox operator command failed: ${error.message}\n\n${usage}`);
    process.exitCode = 1;
  } finally {
    await pool?.end();
  }
}
