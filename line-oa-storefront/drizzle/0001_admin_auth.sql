CREATE TABLE shop_admin_password (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  salt TEXT NOT NULL,
  verifier TEXT NOT NULL
);
--> statement-breakpoint
CREATE TABLE shop_admin_sessions (
  token_hash TEXT PRIMARY KEY,
  expires_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE INDEX shop_admin_sessions_expiry ON shop_admin_sessions (expires_at);
--> statement-breakpoint
CREATE TABLE shop_admin_login_limits (
  client_hash TEXT PRIMARY KEY,
  time_window INTEGER NOT NULL,
  attempts INTEGER NOT NULL
);
--> statement-breakpoint
CREATE INDEX shop_admin_login_limits_window ON shop_admin_login_limits (time_window);
