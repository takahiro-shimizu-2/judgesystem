-- migrate:up

-- =====================================================================
-- Issue #133: agency_master redesign
--
-- 1. agency_master: add is_procurement_framework flag
--    - Distinguishes procurement frameworks (e.g. "全省庁統一") from
--      actual government agencies.
--
-- 2. bid_announcements: add qualification_type column
--    - 'unified' | 'ministry_specific' | NULL
--    - Records whether a bid falls under the unified qualification
--      system or a ministry-specific one.
--
-- 3. bid_announcements: add agency_no column
--    - Integer reference to agency_master.agency_no
--    - Existing orderer_id (text) is preserved as-is.
--
-- All changes are ADD COLUMN only; no existing columns are modified
-- or dropped.
-- =====================================================================

-- 1. agency_master: procurement framework flag
ALTER TABLE agency_master
  ADD COLUMN IF NOT EXISTS is_procurement_framework BOOLEAN DEFAULT FALSE;

-- 2. bid_announcements: qualification type
ALTER TABLE bid_announcements
  ADD COLUMN IF NOT EXISTS qualification_type TEXT;

COMMENT ON COLUMN bid_announcements.qualification_type IS
  'Qualification type: unified | ministry_specific | NULL (unknown)';

-- 3. bid_announcements: agency reference
ALTER TABLE bid_announcements
  ADD COLUMN IF NOT EXISTS agency_no INTEGER;

COMMENT ON COLUMN bid_announcements.agency_no IS
  'Reference to agency_master.agency_no (populated by map_orderer_to_agency.py)';

-- Index for agency_no lookups
CREATE INDEX IF NOT EXISTS idx_bid_announcements_agency_no
  ON bid_announcements (agency_no)
  WHERE agency_no IS NOT NULL;

-- migrate:down

DROP INDEX IF EXISTS idx_bid_announcements_agency_no;

ALTER TABLE bid_announcements
  DROP COLUMN IF EXISTS agency_no;

ALTER TABLE bid_announcements
  DROP COLUMN IF EXISTS qualification_type;

ALTER TABLE agency_master
  DROP COLUMN IF EXISTS is_procurement_framework;
