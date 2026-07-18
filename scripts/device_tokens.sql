-- Stores one row per (user, device) FCM registration token, used to target
-- push notifications. A token is re-issued by Firebase occasionally (app
-- reinstall, data clear, token rotation) — ON CONFLICT (token) in the
-- application's upsert handles re-registration without duplicate rows.
CREATE TABLE device_tokens (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  platform TEXT NOT NULL DEFAULT 'android',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_device_tokens_user_id ON device_tokens(user_id);
