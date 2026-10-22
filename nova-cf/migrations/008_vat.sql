-- 008_vat.sql: TVA (VAT) printed on invoices.
-- vat_rate = rate in % used when the order was placed (19 = 19 %), vat = amount of VAT contained in the total (prices are TTC).
-- Orders made before this migration keep 0 / 0: their invoice is rebuilt exactly as it was (no VAT lines).
ALTER TABLE orders ADD COLUMN IF NOT EXISTS vat_rate NUMERIC(5,2) NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS vat NUMERIC(10,2) NOT NULL DEFAULT 0;
