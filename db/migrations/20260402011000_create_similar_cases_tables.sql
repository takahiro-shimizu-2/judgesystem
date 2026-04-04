-- migrate:up

-- Use INTEGER for announcement_id to match the type enforced by
-- 20260402010000_enforce_numeric_announcement_ids on related tables.
CREATE TABLE IF NOT EXISTS similar_cases_master (
  announcement_id INTEGER NOT NULL,
  similar_case_announcement_id INTEGER NOT NULL,
  case_name TEXT,
  winning_company TEXT,
  winning_amount BIGINT
);

CREATE INDEX IF NOT EXISTS idx_similar_cases_master_announcement
  ON similar_cases_master (announcement_id);

CREATE TABLE IF NOT EXISTS similar_cases_competitors (
  similar_case_announcement_id INTEGER NOT NULL,
  competitor_name TEXT
);

CREATE INDEX IF NOT EXISTS idx_similar_cases_competitors_case
  ON similar_cases_competitors (similar_case_announcement_id);

-- migrate:down

DROP INDEX IF EXISTS idx_similar_cases_competitors_case;
DROP TABLE IF EXISTS similar_cases_competitors;

DROP INDEX IF EXISTS idx_similar_cases_master_announcement;
DROP TABLE IF EXISTS similar_cases_master;
