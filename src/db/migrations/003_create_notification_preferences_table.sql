CREATE TABLE notification_preferences (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  notification_type VARCHAR(50) NOT NULL,
  in_app_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  email_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, notification_type)
);