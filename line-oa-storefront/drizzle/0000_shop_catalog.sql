CREATE TABLE shop_catalog (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  revision INTEGER NOT NULL CHECK (revision > 0),
  state TEXT NOT NULL CHECK (json_valid(state)),
  updated_at TEXT NOT NULL
);
