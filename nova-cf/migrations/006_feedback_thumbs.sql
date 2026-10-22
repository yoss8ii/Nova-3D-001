-- 006_feedback_thumbs.sql
--  * feedback: service ratings left by visitors on the home page (1 to 5 stars, optional name, optional comment).
--    Public to read; abusive ones are deleted from the admin page.
--  * photos.thumb: small JPEG (about 200 px) of a product photo, used as the product preview on invoice PDFs.
CREATE TABLE feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT,                                   -- NULL = anonymous
  stars SMALLINT NOT NULL CHECK (stars BETWEEN 1 AND 5),
  comment TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX feedback_created_idx ON feedback (created_at DESC);

ALTER TABLE photos ADD COLUMN thumb BYTEA;
