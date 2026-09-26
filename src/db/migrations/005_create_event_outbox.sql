CREATE TABLE event_outbox (
  event_id UUID PRIMARY KEY,
  event_type VARCHAR(100) NOT NULL,
  source VARCHAR(255) NOT NULL,
  actor_id INTEGER,
  target_user_id INTEGER NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  occurred_at TIMESTAMPTZ NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'published', 'dead_letter')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  locked_at TIMESTAMPTZ,
  locked_by VARCHAR(255),
  last_error TEXT,
  processed_at TIMESTAMPTZ,
  dead_lettered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_event_outbox_poll
  ON event_outbox(status, available_at, occurred_at);

CREATE INDEX idx_event_outbox_stale_claims
  ON event_outbox(status, locked_at);
