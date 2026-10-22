-- 002_settings_orders.sql: replaces what Netlify Blobs used to store.
-- settings = small key/value pairs (the admin password hash is key 'pwhash')
-- orders   = one row per order (home page counter = number of rows)

CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE orders (
  no TEXT PRIMARY KEY,                         -- invoice number, e.g. NOVA-20261016-4821
  customer JSONB NOT NULL,                     -- name, email, phone, address
  lines JSONB NOT NULL,                        -- [{id, n, p, q}]
  total NUMERIC(10,2) NOT NULL,
  currency TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
