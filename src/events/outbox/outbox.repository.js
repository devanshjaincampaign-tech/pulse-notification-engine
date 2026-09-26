import { pool } from '../../config/database.js';

const eventColumns = `
  e.event_id, e.event_type, e.source, e.actor_id, e.target_user_id, e.payload,
  e.occurred_at, e.attempts, e.status
`;

export async function insertEvent(event, client = pool) {
  const { rowCount } = await client.query(
    `INSERT INTO event_outbox
       (event_id, event_type, source, actor_id, target_user_id, payload, occurred_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (event_id) DO NOTHING`,
    [event.eventId, event.eventType, event.source, event.actorId, event.targetUserId,
      event.payload, event.timestamp]
  );
  return rowCount === 1;
}

export async function claimEvents({ workerId, limit = 10, leaseMs = 60000 } = {}) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `WITH candidates AS (
         SELECT event_id
         FROM event_outbox
         WHERE (status = 'pending' AND available_at <= NOW())
            OR (status = 'processing' AND locked_at < NOW() - ($2 * INTERVAL '1 millisecond'))
         ORDER BY event_outbox.occurred_at, event_outbox.event_id
         FOR UPDATE SKIP LOCKED
         LIMIT $1
       )
       UPDATE event_outbox e
       SET status = 'processing', attempts = e.attempts + 1,
           locked_at = NOW(), locked_by = $3, last_error = NULL
       FROM candidates c
       WHERE e.event_id = c.event_id
       RETURNING ${eventColumns}`,
      [limit, leaseMs, workerId]
    );
    await client.query('COMMIT');
    return rows;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function markPublished(eventId, workerId, client = pool) {
  const { rowCount } = await client.query(
    `UPDATE event_outbox
     SET status = 'published', processed_at = NOW(), locked_at = NULL, locked_by = NULL
     WHERE event_id = $1 AND status = 'processing' AND locked_by = $2`,
    [eventId, workerId]
  );
  return rowCount === 1;
}

export async function releaseForRetry(eventId, workerId, { availableAt, error }, client = pool) {
  const { rowCount } = await client.query(
    `UPDATE event_outbox
     SET status = 'pending', available_at = $3, last_error = $4,
         locked_at = NULL, locked_by = NULL
     WHERE event_id = $1 AND status = 'processing' AND locked_by = $2`,
    [eventId, workerId, availableAt, error]
  );
  return rowCount === 1;
}

export async function moveToDeadLetter(eventId, workerId, error, client = pool) {
  const { rowCount } = await client.query(
    `UPDATE event_outbox
     SET status = 'dead_letter', dead_lettered_at = NOW(), last_error = $3,
         locked_at = NULL, locked_by = NULL
     WHERE event_id = $1 AND status = 'processing' AND locked_by = $2`,
    [eventId, workerId, error]
  );
  return rowCount === 1;
}
