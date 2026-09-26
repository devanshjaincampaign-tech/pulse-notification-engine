CREATE TABLE user_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_name TEXT,
  user_agent TEXT,
  ip_address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ
);

CREATE INDEX idx_user_sessions_user_active
  ON user_sessions(user_id, created_at DESC)
  WHERE revoked_at IS NULL;
CREATE INDEX idx_user_sessions_cleanup
  ON user_sessions(expires_at, revoked_at);

ALTER TABLE refresh_tokens
  ADD COLUMN session_id UUID REFERENCES user_sessions(id) ON DELETE CASCADE,
  ADD COLUMN replaced_by_id INTEGER REFERENCES refresh_tokens(id);

CREATE INDEX idx_refresh_tokens_session ON refresh_tokens(session_id);
CREATE INDEX idx_refresh_tokens_reuse
  ON refresh_tokens(session_id, replaced_by_id)
  WHERE replaced_by_id IS NOT NULL;
