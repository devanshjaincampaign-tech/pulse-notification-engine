-- Run as a database administrator in the application database after creating
-- the role with a secret-manager-managed credential.
-- The role can inspect safe metadata and replay dead-letter rows, but cannot
-- read payloads/errors or claim/publish events.
GRANT CONNECT ON DATABASE pulse_notifications TO pulse_outbox_operator;
GRANT USAGE ON SCHEMA public TO pulse_outbox_operator;
GRANT SELECT (
  event_id, event_type, occurred_at, attempts, status, dead_lettered_at
) ON TABLE event_outbox TO pulse_outbox_operator;

GRANT UPDATE (
  status, attempts, available_at, locked_at, locked_by,
  last_error, processed_at, dead_lettered_at
) ON TABLE event_outbox TO pulse_outbox_operator;
