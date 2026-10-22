-- 004_price_delivery.sql: ancien prix (barré quand il y a une remise) + frais de livraison par commande.
-- old_price = 0 : pas de remise. Les frais de livraison actuels sont dans settings (clé 'delivery').
ALTER TABLE products ADD COLUMN old_price NUMERIC(10,2) NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN delivery NUMERIC(10,2) NOT NULL DEFAULT 0;
