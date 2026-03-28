-- migrate:up

ALTER TABLE bid_announcements
  ADD COLUMN IF NOT EXISTS notice_category_name TEXT,
  ADD COLUMN IF NOT EXISTS notice_category_code TEXT,
  ADD COLUMN IF NOT EXISTS notice_procurement_method TEXT,
  ADD COLUMN IF NOT EXISTS category_segment TEXT,
  ADD COLUMN IF NOT EXISTS category_detail TEXT;

CREATE TABLE IF NOT EXISTS bid_announcements_dates (
  announcement_no INTEGER NOT NULL,
  document_id TEXT,
  submission_document_name TEXT,
  date_value DATE,
  date_raw TEXT,
  date_meaning TEXT,
  timepoint_type TEXT,
  "createdDate" TEXT,
  "updatedDate" TEXT,
  FOREIGN KEY (announcement_no) REFERENCES bid_announcements(announcement_no)
);

CREATE INDEX IF NOT EXISTS idx_bid_announcements_dates_announcement_no
  ON bid_announcements_dates (announcement_no);

-- migrate:down

DROP INDEX IF EXISTS idx_bid_announcements_dates_announcement_no;
DROP TABLE IF EXISTS bid_announcements_dates;

ALTER TABLE bid_announcements
  DROP COLUMN IF EXISTS category_detail,
  DROP COLUMN IF EXISTS category_segment,
  DROP COLUMN IF EXISTS notice_procurement_method,
  DROP COLUMN IF EXISTS notice_category_code,
  DROP COLUMN IF EXISTS notice_category_name;
