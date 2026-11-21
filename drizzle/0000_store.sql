CREATE TABLE users (
  id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE, email TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL, password TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'customer' CHECK(role IN ('customer','admin')),
  balance INTEGER NOT NULL DEFAULT 0 CHECK(balance BETWEEN 0 AND 100000000),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX single_admin ON users(role) WHERE role='admin';
--> statement-breakpoint
CREATE TABLE sessions (
  token TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires INTEGER NOT NULL
);
--> statement-breakpoint
CREATE INDEX session_expiry ON sessions(expires);
--> statement-breakpoint
CREATE TABLE login_limits (scope TEXT PRIMARY KEY, hits INTEGER NOT NULL, until INTEGER NOT NULL);
--> statement-breakpoint
CREATE TABLE products (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, category TEXT NOT NULL, description TEXT NOT NULL,
  price INTEGER NOT NULL CHECK(price BETWEEN 1 AND 10000000),
  stock INTEGER NOT NULL CHECK(stock BETWEEN 0 AND 1000000),
  revision INTEGER NOT NULL DEFAULT 0,
  image_key TEXT, delivery TEXT NOT NULL DEFAULT '', active INTEGER NOT NULL CHECK(active IN (0,1)),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
--> statement-breakpoint
CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
--> statement-breakpoint
CREATE TABLE ledger (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), delta INTEGER NOT NULL CHECK(delta <> 0),
  kind TEXT NOT NULL CHECK(kind IN ('order','topup','adjustment')), reason TEXT NOT NULL,
  actor_id TEXT REFERENCES users(id), balance_after INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
--> statement-breakpoint
CREATE INDEX wallet_history ON ledger(user_id, created_at DESC);
--> statement-breakpoint
CREATE TRIGGER ledger_post AFTER INSERT ON ledger BEGIN
  UPDATE users SET balance=balance+NEW.delta WHERE id=NEW.user_id;
  UPDATE ledger SET balance_after=(SELECT balance FROM users WHERE id=NEW.user_id) WHERE id=NEW.id;
END;
--> statement-breakpoint
CREATE TABLE orders (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), request_key TEXT NOT NULL,
  product_id TEXT NOT NULL REFERENCES products(id), product_name TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK(quantity BETWEEN 1 AND 99), unit_price INTEGER NOT NULL,
  total INTEGER NOT NULL CHECK(total=quantity*unit_price),
  delivery TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('confirmed','delivered')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(user_id, request_key)
);
--> statement-breakpoint
CREATE INDEX order_history ON orders(user_id, created_at DESC);
--> statement-breakpoint
CREATE TRIGGER order_post AFTER INSERT ON orders BEGIN
  UPDATE products SET stock=stock-NEW.quantity,revision=revision+1 WHERE id=NEW.product_id;
  INSERT INTO ledger(id,user_id,delta,kind,reason)
  VALUES('order:'||NEW.id,NEW.user_id,-NEW.total,'order',NEW.product_name);
END;
--> statement-breakpoint
CREATE TABLE topups (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id),
  image_digest TEXT NOT NULL UNIQUE, image_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
  amount INTEGER CHECK(amount BETWEEN 1 AND 10000000),
  reference TEXT UNIQUE, note TEXT NOT NULL DEFAULT '', reviewer TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  reviewed_at TEXT,
  CHECK(status<>'approved' OR (amount IS NOT NULL AND reference IS NOT NULL))
);
--> statement-breakpoint
CREATE INDEX topup_history ON topups(user_id, created_at DESC);
--> statement-breakpoint
CREATE TRIGGER topup_post AFTER UPDATE OF status ON topups
WHEN OLD.status='pending' AND NEW.status='approved' BEGIN
  INSERT INTO ledger(id,user_id,delta,kind,reason,actor_id)
  VALUES('topup:'||NEW.id,NEW.user_id,NEW.amount,'topup','เติมเงินผ่านธนาคาร',NEW.reviewer);
END;
