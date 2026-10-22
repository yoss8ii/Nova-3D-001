-- 010_promo_codes.sql: promo codes created by the admin (one percentage per code) + what an order used.
-- promo_codes.percent = discount in % applied to the products subtotal (delivery is never discounted).
-- uses = how many orders used the code. active = false keeps the code in the list but refuses it.
-- orders.promo_code / orders.discount = code used and amount taken off (0 / NULL for older orders).
CREATE TABLE IF NOT EXISTS promo_codes (
  code TEXT PRIMARY KEY,
  percent NUMERIC(5,2) NOT NULL CHECK (percent > 0 AND percent <= 100),
  active BOOLEAN NOT NULL DEFAULT true,
  uses INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS promo_code TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS discount NUMERIC(10,2) NOT NULL DEFAULT 0;
