CREATE TABLE notifications (
  id SERIAL PRIMARY KEY,
  event_id UUID UNIQUE NOT NULL,
  recipient_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  type VARCHAR(50) NOT NULL,
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  metadata JSONB,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  read_at TIMESTAMPTZ
);

CREATE INDEX idx_notifications_recipient_created 
  ON notifications(recipient_id, created_at DESC);

CREATE INDEX idx_notifications_recipient_unread 
  ON notifications(recipient_id, is_read);