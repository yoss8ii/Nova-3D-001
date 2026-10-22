-- 007_drop_photo_thumb.sql
-- Invoice product previews were removed: the small JPEG kept with each photo (photos.thumb, added in 006) is no longer used.
-- Invoices already saved keep their PDF as it was; new ones simply have no pictures.
ALTER TABLE photos DROP COLUMN IF EXISTS thumb;
