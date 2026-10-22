-- 003_reviews.sql: customer review screenshots shown in the "Avis clients" cards on the home page.
-- Uploaded / deleted from the admin page; applied immediately (no "Enregistrer" needed).
CREATE TABLE reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_type TEXT NOT NULL,
  data BYTEA NOT NULL,                         -- the screenshot itself
  position SERIAL,                             -- display order (oldest first)
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
