-- 005_orders_history_security.sql
--  * orders: the invoice PDF sent to the customer is now SAVED (invoice_pdf), plus whether the e-mail was sent
--    and a status ("new" = to prepare, "done" = handled) for the admin order history.
--    Orders that existed before this migration are marked "done" (nothing new to prepare).
--  * rate_limits: counters used against abuse (admin login attempts, order spam per IP / e-mail).
ALTER TABLE orders ADD COLUMN invoice_pdf BYTEA;
ALTER TABLE orders ADD COLUMN email_sent BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE orders ADD COLUMN status TEXT NOT NULL DEFAULT 'done';
ALTER TABLE orders ALTER COLUMN status SET DEFAULT 'new';
CREATE INDEX orders_created_idx ON orders (created_at DESC);

CREATE TABLE rate_limits (
  key TEXT PRIMARY KEY,
  n INTEGER NOT NULL,
  started TIMESTAMPTZ NOT NULL DEFAULT now()
);
