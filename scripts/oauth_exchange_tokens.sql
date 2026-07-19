-- Short-lived, single-use bridge token for OAuth login from the Android app.
-- Google/Facebook sign-in runs in a Chrome Custom Tab (required — they
-- block embedded WebViews), which has its own cookie jar separate from the
-- app's WebView. Once the callback completes there, it redirects to
-- laundrease://oauth-complete?token=... carrying one of these tokens; the
-- app's own WebView then exchanges it for a real session
-- (app/api/customer/auth/oauth/exchange/route.ts), which is what actually
-- sets cookies inside the WebView.
CREATE TABLE oauth_exchange_tokens (
  id BIGSERIAL PRIMARY KEY,
  token TEXT NOT NULL UNIQUE,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  return_to TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_oauth_exchange_tokens_token ON oauth_exchange_tokens(token);
