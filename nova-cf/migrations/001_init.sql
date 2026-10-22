-- 001_init.sql: shop tables (categories, products, photos) + one sample product.
-- Applied once by scripts/migrate.mjs. NEVER edit a migration that has already been applied:
-- add a new file (002_..., 003_...) instead.

CREATE TABLE categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0          -- display order
);

CREATE TABLE products (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  price NUMERIC(10,2) NOT NULL DEFAULT 0,
  quantity INTEGER NOT NULL DEFAULT 0,         -- stock
  description TEXT NOT NULL DEFAULT '',
  category_id TEXT REFERENCES categories(id) ON DELETE SET NULL,
  best BOOLEAN NOT NULL DEFAULT false,         -- shown in "Meilleures ventes"
  shape TEXT NOT NULL DEFAULT 'key',           -- 3D preview shape
  color TEXT NOT NULL DEFAULT '#00a6a6',       -- 3D preview colour
  position INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id TEXT REFERENCES products(id) ON DELETE CASCADE,  -- NULL = uploaded but not attached yet
  content_type TEXT NOT NULL,
  data BYTEA NOT NULL,                         -- the image itself
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO categories (id, name, position) VALUES
  ('c-keychains', 'Porte-clés', 0),
  ('c-fidgets', 'Fidgets', 1);

INSERT INTO products (id, name, price, quantity, description, category_id, best, shape, color, position) VALUES
  ('p1', 'Porte-clés prénom', 6, 10, 'Votre prénom sur une plaque solide, avec un trou pour l''anneau.', 'c-keychains', true, 'key', '#00a6a6', 0);
