-- migrate:up

ALTER TABLE partners_master ADD COLUMN IF NOT EXISTS detail_url TEXT;
ALTER TABLE partners_master ADD COLUMN IF NOT EXISTS region TEXT;

CREATE INDEX IF NOT EXISTS idx_partners_master_region ON partners_master (region);

-- migrate:down

DROP INDEX IF EXISTS idx_partners_master_region;
ALTER TABLE partners_master DROP COLUMN IF EXISTS region;
ALTER TABLE partners_master DROP COLUMN IF EXISTS detail_url;
