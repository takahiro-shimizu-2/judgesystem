-- migrate:up
--
-- Issue #121: Validate the NOT VALID foreign keys added in
-- 20260404000000_add_missing_foreign_keys.sql.
--
-- VALIDATE CONSTRAINT scans existing rows and promotes the constraint
-- to "valid".  This requires a SHARE UPDATE EXCLUSIVE lock (not
-- ACCESS EXCLUSIVE), so reads and writes can continue.
--
-- If any row violates a constraint, this migration will fail.
-- Fix the data first, then re-run.
--

ALTER TABLE bid_requirements
  VALIDATE CONSTRAINT fk_bid_requirements_announcement;

ALTER TABLE announcements_documents_master
  VALIDATE CONSTRAINT fk_announcements_documents_announcement;

ALTER TABLE announcements_estimated_amounts
  VALIDATE CONSTRAINT fk_announcements_estimated_amounts_announcement;

ALTER TABLE company_bid_judgement
  VALIDATE CONSTRAINT fk_company_bid_judgement_announcement;

ALTER TABLE company_bid_judgement
  VALIDATE CONSTRAINT fk_company_bid_judgement_company;

ALTER TABLE company_bid_judgement
  VALIDATE CONSTRAINT fk_company_bid_judgement_office;

ALTER TABLE sufficient_requirements
  VALIDATE CONSTRAINT fk_sufficient_requirements_announcement;

ALTER TABLE sufficient_requirements
  VALIDATE CONSTRAINT fk_sufficient_requirements_company;

ALTER TABLE insufficient_requirements
  VALIDATE CONSTRAINT fk_insufficient_requirements_announcement;

ALTER TABLE insufficient_requirements
  VALIDATE CONSTRAINT fk_insufficient_requirements_company;

ALTER TABLE office_master
  VALIDATE CONSTRAINT fk_office_master_company;

ALTER TABLE office_work_achivements_master
  VALIDATE CONSTRAINT fk_office_work_achivements_office;

ALTER TABLE partners_categories
  VALIDATE CONSTRAINT fk_partners_categories_partner;

ALTER TABLE partners_past_projects
  VALIDATE CONSTRAINT fk_partners_past_projects_partner;

ALTER TABLE partners_branches
  VALIDATE CONSTRAINT fk_partners_branches_partner;

ALTER TABLE partners_qualifications_unified
  VALIDATE CONSTRAINT fk_partners_qualifications_unified_partner;

ALTER TABLE partners_qualifications_orderers
  VALIDATE CONSTRAINT fk_partners_qualifications_orderers_partner;

ALTER TABLE partners_qualifications_orderer_items
  VALIDATE CONSTRAINT fk_partners_qualifications_orderer_items_partner;

ALTER TABLE evaluation_partner_candidates
  VALIDATE CONSTRAINT fk_evaluation_partner_candidates_partner;

ALTER TABLE similar_cases_master
  VALIDATE CONSTRAINT fk_similar_cases_master_announcement;

-- migrate:down
--
-- There is no "un-validate" operation in PostgreSQL.
-- Rolling back simply re-creates the constraints as NOT VALID.
-- The actual constraints are dropped by the down migration in
-- 20260404000000_add_missing_foreign_keys.sql.
--
-- This is intentionally a no-op.
