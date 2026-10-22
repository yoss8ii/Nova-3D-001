-- 009_custom_requests.sql
--  * custom_requests: "sur mesure" requests sent from the public form. Saved here (and still opened in WhatsApp) so the admin
--    can follow them: status "new" -> "quoted" (price sent) -> "done".
CREATE TABLE custom_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '',
  budget TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'new',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX custom_requests_created_idx ON custom_requests (created_at DESC);
