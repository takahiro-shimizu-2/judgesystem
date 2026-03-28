-- migrate:up

ALTER TABLE bid_announcements
  ALTER COLUMN announcement_no TYPE INTEGER USING NULLIF(TRIM(announcement_no::TEXT), '')::INTEGER;

ALTER TABLE announcements_documents_master
  ALTER COLUMN announcement_no TYPE INTEGER USING NULLIF(TRIM(announcement_no::TEXT), '')::INTEGER,
  ALTER COLUMN announcement_id TYPE INTEGER USING NULLIF(TRIM(announcement_id::TEXT), '')::INTEGER;

ALTER TABLE announcements_estimated_amounts
  ALTER COLUMN announcement_no TYPE INTEGER USING NULLIF(TRIM(announcement_no::TEXT), '')::INTEGER;

ALTER TABLE announcements_competing_companies_master
  ALTER COLUMN announcement_id TYPE INTEGER USING NULLIF(TRIM(announcement_id::TEXT), '')::INTEGER;

ALTER TABLE announcements_competing_company_bids_master
  ALTER COLUMN announcement_id TYPE INTEGER USING NULLIF(TRIM(announcement_id::TEXT), '')::INTEGER;

ALTER TABLE bid_requirements
  ALTER COLUMN announcement_no TYPE INTEGER USING NULLIF(TRIM(announcement_no::TEXT), '')::INTEGER;

ALTER TABLE bid_announcements_dates
  ALTER COLUMN announcement_no TYPE INTEGER USING NULLIF(TRIM(announcement_no::TEXT), '')::INTEGER;

ALTER TABLE company_bid_judgement
  ALTER COLUMN announcement_no TYPE INTEGER USING NULLIF(TRIM(announcement_no::TEXT), '')::INTEGER;

ALTER TABLE sufficient_requirements
  ALTER COLUMN announcement_no TYPE INTEGER USING NULLIF(TRIM(announcement_no::TEXT), '')::INTEGER;

ALTER TABLE insufficient_requirements
  ALTER COLUMN announcement_no TYPE INTEGER USING NULLIF(TRIM(announcement_no::TEXT), '')::INTEGER;

-- migrate:down

ALTER TABLE bid_announcements
  ALTER COLUMN announcement_no TYPE TEXT USING announcement_no::TEXT;

ALTER TABLE announcements_documents_master
  ALTER COLUMN announcement_no TYPE TEXT USING announcement_no::TEXT,
  ALTER COLUMN announcement_id TYPE TEXT USING announcement_id::TEXT;

ALTER TABLE announcements_estimated_amounts
  ALTER COLUMN announcement_no TYPE TEXT USING announcement_no::TEXT;

ALTER TABLE announcements_competing_companies_master
  ALTER COLUMN announcement_id TYPE TEXT USING announcement_id::TEXT;

ALTER TABLE announcements_competing_company_bids_master
  ALTER COLUMN announcement_id TYPE TEXT USING announcement_id::TEXT;

ALTER TABLE bid_requirements
  ALTER COLUMN announcement_no TYPE TEXT USING announcement_no::TEXT;

ALTER TABLE bid_announcements_dates
  ALTER COLUMN announcement_no TYPE TEXT USING announcement_no::TEXT;

ALTER TABLE company_bid_judgement
  ALTER COLUMN announcement_no TYPE TEXT USING announcement_no::TEXT;

ALTER TABLE sufficient_requirements
  ALTER COLUMN announcement_no TYPE TEXT USING announcement_no::TEXT;

ALTER TABLE insufficient_requirements
  ALTER COLUMN announcement_no TYPE TEXT USING announcement_no::TEXT;
