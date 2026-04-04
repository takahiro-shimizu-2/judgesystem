-- migrate:up
--
-- Issue #121: Add missing foreign key constraints.
--
-- Strategy:
--   - Use ADD CONSTRAINT ... FOREIGN KEY ... NOT VALID to avoid locking
--     existing rows for validation.  Run VALIDATE CONSTRAINT separately
--     after verifying data integrity.
--   - Only target columns whose types already match the referenced PK.
--   - office_master lacks a PK/UNIQUE on office_no, so we add one first
--     (required for it to be a FK target).  A UNIQUE constraint is used
--     instead of a PK because the column is nullable in the current schema.
--   - Tables whose announcement identifier is TEXT (announcement_id) while
--     bid_announcements PK is INTEGER are skipped; they need a data
--     migration first (announcements_competing_companies_master,
--     announcements_competing_company_bids_master).
--

-- ============================================================
-- 0. Prerequisites: make office_master.office_no referenceable
-- ============================================================
-- office_master has no PK; add UNIQUE so it can be an FK target.
ALTER TABLE office_master
  ADD CONSTRAINT uq_office_master_office_no UNIQUE (office_no);

-- ============================================================
-- 1. bid_requirements.announcement_no -> bid_announcements
-- ============================================================
ALTER TABLE bid_requirements
  ADD CONSTRAINT fk_bid_requirements_announcement
  FOREIGN KEY (announcement_no) REFERENCES bid_announcements(announcement_no)
  NOT VALID;

-- ============================================================
-- 2. announcements_documents_master.announcement_no -> bid_announcements
-- ============================================================
ALTER TABLE announcements_documents_master
  ADD CONSTRAINT fk_announcements_documents_announcement
  FOREIGN KEY (announcement_no) REFERENCES bid_announcements(announcement_no)
  NOT VALID;

-- ============================================================
-- 3. announcements_estimated_amounts.announcement_no -> bid_announcements
-- ============================================================
ALTER TABLE announcements_estimated_amounts
  ADD CONSTRAINT fk_announcements_estimated_amounts_announcement
  FOREIGN KEY (announcement_no) REFERENCES bid_announcements(announcement_no)
  NOT VALID;

-- ============================================================
-- 4. company_bid_judgement -> bid_announcements, company_master, office_master
-- ============================================================
ALTER TABLE company_bid_judgement
  ADD CONSTRAINT fk_company_bid_judgement_announcement
  FOREIGN KEY (announcement_no) REFERENCES bid_announcements(announcement_no)
  NOT VALID;

ALTER TABLE company_bid_judgement
  ADD CONSTRAINT fk_company_bid_judgement_company
  FOREIGN KEY (company_no) REFERENCES company_master(company_no)
  NOT VALID;

ALTER TABLE company_bid_judgement
  ADD CONSTRAINT fk_company_bid_judgement_office
  FOREIGN KEY (office_no) REFERENCES office_master(office_no)
  NOT VALID;

-- ============================================================
-- 5. sufficient_requirements -> bid_announcements, company_master
-- ============================================================
ALTER TABLE sufficient_requirements
  ADD CONSTRAINT fk_sufficient_requirements_announcement
  FOREIGN KEY (announcement_no) REFERENCES bid_announcements(announcement_no)
  NOT VALID;

ALTER TABLE sufficient_requirements
  ADD CONSTRAINT fk_sufficient_requirements_company
  FOREIGN KEY (company_no) REFERENCES company_master(company_no)
  NOT VALID;

-- ============================================================
-- 6. insufficient_requirements -> bid_announcements, company_master
-- ============================================================
ALTER TABLE insufficient_requirements
  ADD CONSTRAINT fk_insufficient_requirements_announcement
  FOREIGN KEY (announcement_no) REFERENCES bid_announcements(announcement_no)
  NOT VALID;

ALTER TABLE insufficient_requirements
  ADD CONSTRAINT fk_insufficient_requirements_company
  FOREIGN KEY (company_no) REFERENCES company_master(company_no)
  NOT VALID;

-- ============================================================
-- 7. office_master.company_no -> company_master
-- ============================================================
ALTER TABLE office_master
  ADD CONSTRAINT fk_office_master_company
  FOREIGN KEY (company_no) REFERENCES company_master(company_no)
  NOT VALID;

-- ============================================================
-- 8. office_work_achivements_master.office_no -> office_master
-- ============================================================
ALTER TABLE office_work_achivements_master
  ADD CONSTRAINT fk_office_work_achivements_office
  FOREIGN KEY (office_no) REFERENCES office_master(office_no)
  NOT VALID;

-- ============================================================
-- 9. partners_categories.partner_id -> partners_master
-- ============================================================
ALTER TABLE partners_categories
  ADD CONSTRAINT fk_partners_categories_partner
  FOREIGN KEY (partner_id) REFERENCES partners_master(partner_id)
  NOT VALID;

-- ============================================================
-- 10. partners_past_projects.partner_id -> partners_master
-- ============================================================
ALTER TABLE partners_past_projects
  ADD CONSTRAINT fk_partners_past_projects_partner
  FOREIGN KEY (partner_id) REFERENCES partners_master(partner_id)
  NOT VALID;

-- ============================================================
-- 11. partners_branches.partner_id -> partners_master
-- ============================================================
ALTER TABLE partners_branches
  ADD CONSTRAINT fk_partners_branches_partner
  FOREIGN KEY (partner_id) REFERENCES partners_master(partner_id)
  NOT VALID;

-- ============================================================
-- 12. partners_qualifications_unified.partner_id -> partners_master
-- ============================================================
ALTER TABLE partners_qualifications_unified
  ADD CONSTRAINT fk_partners_qualifications_unified_partner
  FOREIGN KEY (partner_id) REFERENCES partners_master(partner_id)
  NOT VALID;

-- ============================================================
-- 13. partners_qualifications_orderers.partner_id -> partners_master
-- ============================================================
ALTER TABLE partners_qualifications_orderers
  ADD CONSTRAINT fk_partners_qualifications_orderers_partner
  FOREIGN KEY (partner_id) REFERENCES partners_master(partner_id)
  NOT VALID;

-- ============================================================
-- 14. partners_qualifications_orderer_items.partner_id -> partners_master
-- ============================================================
ALTER TABLE partners_qualifications_orderer_items
  ADD CONSTRAINT fk_partners_qualifications_orderer_items_partner
  FOREIGN KEY (partner_id) REFERENCES partners_master(partner_id)
  NOT VALID;

-- ============================================================
-- 15. evaluation_partner_candidates.partner_id -> partners_master
-- ============================================================
ALTER TABLE evaluation_partner_candidates
  ADD CONSTRAINT fk_evaluation_partner_candidates_partner
  FOREIGN KEY (partner_id) REFERENCES partners_master(partner_id)
  NOT VALID;

-- ============================================================
-- 16. similar_cases_master.announcement_id -> bid_announcements
--     (announcement_id INTEGER matches bid_announcements.announcement_no INTEGER)
-- ============================================================
ALTER TABLE similar_cases_master
  ADD CONSTRAINT fk_similar_cases_master_announcement
  FOREIGN KEY (announcement_id) REFERENCES bid_announcements(announcement_no)
  NOT VALID;

-- ============================================================
-- 17. bid_announcements_dates already has FK (from the create migration),
--     but it was created WITHOUT NOT VALID.  No action needed.
-- ============================================================

-- migrate:down

ALTER TABLE similar_cases_master
  DROP CONSTRAINT IF EXISTS fk_similar_cases_master_announcement;

ALTER TABLE evaluation_partner_candidates
  DROP CONSTRAINT IF EXISTS fk_evaluation_partner_candidates_partner;

ALTER TABLE partners_qualifications_orderer_items
  DROP CONSTRAINT IF EXISTS fk_partners_qualifications_orderer_items_partner;

ALTER TABLE partners_qualifications_orderers
  DROP CONSTRAINT IF EXISTS fk_partners_qualifications_orderers_partner;

ALTER TABLE partners_qualifications_unified
  DROP CONSTRAINT IF EXISTS fk_partners_qualifications_unified_partner;

ALTER TABLE partners_branches
  DROP CONSTRAINT IF EXISTS fk_partners_branches_partner;

ALTER TABLE partners_past_projects
  DROP CONSTRAINT IF EXISTS fk_partners_past_projects_partner;

ALTER TABLE partners_categories
  DROP CONSTRAINT IF EXISTS fk_partners_categories_partner;

ALTER TABLE office_work_achivements_master
  DROP CONSTRAINT IF EXISTS fk_office_work_achivements_office;

ALTER TABLE office_master
  DROP CONSTRAINT IF EXISTS fk_office_master_company;

ALTER TABLE insufficient_requirements
  DROP CONSTRAINT IF EXISTS fk_insufficient_requirements_company;

ALTER TABLE insufficient_requirements
  DROP CONSTRAINT IF EXISTS fk_insufficient_requirements_announcement;

ALTER TABLE sufficient_requirements
  DROP CONSTRAINT IF EXISTS fk_sufficient_requirements_company;

ALTER TABLE sufficient_requirements
  DROP CONSTRAINT IF EXISTS fk_sufficient_requirements_announcement;

ALTER TABLE company_bid_judgement
  DROP CONSTRAINT IF EXISTS fk_company_bid_judgement_office;

ALTER TABLE company_bid_judgement
  DROP CONSTRAINT IF EXISTS fk_company_bid_judgement_company;

ALTER TABLE company_bid_judgement
  DROP CONSTRAINT IF EXISTS fk_company_bid_judgement_announcement;

ALTER TABLE announcements_estimated_amounts
  DROP CONSTRAINT IF EXISTS fk_announcements_estimated_amounts_announcement;

ALTER TABLE announcements_documents_master
  DROP CONSTRAINT IF EXISTS fk_announcements_documents_announcement;

ALTER TABLE bid_requirements
  DROP CONSTRAINT IF EXISTS fk_bid_requirements_announcement;

ALTER TABLE office_master
  DROP CONSTRAINT IF EXISTS uq_office_master_office_no;
