ALTER TABLE hazards ADD COLUMN IF NOT EXISTS photo_key TEXT;

ALTER TABLE infrastructure_issues
ADD COLUMN IF NOT EXISTS photo_key TEXT;