-- migrate:up

-- =============================================================================
-- 企業マスタ統合: company_master + partners_master → companies
-- See: #186, #187
-- =============================================================================

-- Prerequisites: uuid-ossp extension for uuid_generate_v5 (deterministic UUID)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Step 1: Create unified companies table
CREATE TABLE IF NOT EXISTS companies (
  id TEXT PRIMARY KEY,
  "no" SERIAL,
  company_no INTEGER UNIQUE,
  name TEXT NOT NULL,
  name_kana TEXT,
  corporate_number TEXT,
  postal_code TEXT,
  address TEXT,
  phone TEXT,
  fax TEXT,
  email TEXT,
  url TEXT,
  representative TEXT,
  establishment_date TEXT,
  capital TEXT,
  employee_count INTEGER DEFAULT 0,
  main_business TEXT,
  region TEXT,
  detail_url TEXT,
  is_customer BOOLEAN DEFAULT FALSE,
  is_partner BOOLEAN DEFAULT TRUE,
  is_active BOOLEAN DEFAULT TRUE,
  survey_count INTEGER DEFAULT 0,
  rating NUMERIC,
  result_count INTEGER DEFAULT 0,
  remarks TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Step 2: Create company_disqualifications table (separated from company_master)
CREATE TABLE IF NOT EXISTS company_disqualifications (
  company_id TEXT PRIMARY KEY REFERENCES companies(id),
  article_70_flag TEXT,
  article_71_flag TEXT,
  bankruptcy_flag TEXT,
  corporate_reorganization_flag TEXT,
  corporate_reorganization_start_date TEXT,
  post_reorganization_reacquisition_date TEXT,
  anti_social_forces_flag TEXT,
  adult_ward_flag TEXT,
  foreign_legal_restriction_flag TEXT,
  subversive_organization_flag TEXT,
  no_social_insurance_arrears_flag TEXT,
  information_security_framework_flag TEXT,
  boj_transaction_suspension_flag TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Step 3: Migrate partners_master → companies
INSERT INTO companies (
  id, name, postal_code, address, phone, fax, email, url,
  representative, establishment_date, capital, employee_count,
  region, detail_url, is_customer, is_partner, is_active,
  survey_count, rating, result_count, created_at, updated_at
)
SELECT
  partner_id,
  COALESCE(name, company_name),
  "postalCode",
  address,
  phone,
  fax,
  email,
  url,
  representative,
  establishment_date,
  capital,
  COALESCE("employeeCount", 0),
  region,
  detail_url,
  FALSE,
  TRUE,
  COALESCE(is_active, TRUE),
  COALESCE("surveyCount", 0),
  rating,
  COALESCE("resultCount", 0),
  NOW(),
  NOW()
FROM partners_master
ON CONFLICT (id) DO NOTHING;

-- Step 4: Migrate company_master → companies (upsert: mark as customer)
-- Generate deterministic UUID from company_name + address (same logic as fetch_partners_from_sheets.py)
INSERT INTO companies (
  id, company_no, name, name_kana, corporate_number,
  postal_code, address, phone, fax, email,
  representative, establishment_date, capital, main_business,
  is_customer, is_partner, is_active, remarks, created_at, updated_at
)
SELECT
  uuid_generate_v5('6ba7b811-9dad-11d1-80b4-00c04fd430c8'::uuid, company_name || '::' || COALESCE(company_address, '')),
  company_no,
  company_name,
  company_name_kana,
  corporate_number,
  postal_code,
  company_address,
  telephone,
  fax,
  email,
  name_of_representative,
  establishment_date,
  capital,
  main_business,
  TRUE,
  FALSE,
  COALESCE(is_active, TRUE),
  remarks,
  NOW(),
  NOW()
FROM company_master
ON CONFLICT (id) DO UPDATE SET
  company_no = EXCLUDED.company_no,
  name_kana = EXCLUDED.name_kana,
  corporate_number = EXCLUDED.corporate_number,
  main_business = EXCLUDED.main_business,
  is_customer = TRUE,
  remarks = EXCLUDED.remarks,
  updated_at = NOW();

-- Step 5: Migrate disqualification flags to company_disqualifications
INSERT INTO company_disqualifications (
  company_id,
  article_70_flag, article_71_flag, bankruptcy_flag,
  corporate_reorganization_flag, corporate_reorganization_start_date,
  post_reorganization_reacquisition_date, anti_social_forces_flag,
  adult_ward_flag, foreign_legal_restriction_flag,
  subversive_organization_flag, no_social_insurance_arrears_flag,
  information_security_framework_flag, boj_transaction_suspension_flag
)
SELECT
  c.id,
  cm.article_70_flag, cm.article_71_flag, cm.bankruptcy_flag,
  cm."Corporate_Reorganization_Flag", cm."Corporate_Reorganization_start_date",
  cm."Post_Reorganization_Reacquisition_Date", cm."Anti_Social_Forces_Flag",
  cm."Adult_Ward_Flag", cm."Foreign_Legal_Restriction_Flag",
  cm."Subversive_Organization_Flag", cm."No_Social_Insurance_Arrears_Flag",
  cm."Information_Security_Framework_Flag", cm."BOJ_Transaction_Suspension_flag"
FROM company_master cm
JOIN companies c ON c.company_no = cm.company_no
ON CONFLICT (company_id) DO NOTHING;

-- Step 6: Rename partner-related tables to company-related
ALTER TABLE partners_categories RENAME TO companies_categories;
ALTER TABLE partners_branches RENAME TO companies_branches;
ALTER TABLE partners_past_projects RENAME TO companies_past_projects;
ALTER TABLE partners_qualifications_unified RENAME TO companies_qualifications_unified;
ALTER TABLE partners_qualifications_orderers RENAME TO companies_qualifications_orderers;
ALTER TABLE partners_qualifications_orderer_items RENAME TO companies_qualifications_orderer_items;

-- Rename partner_id column in renamed tables to company_id
ALTER TABLE companies_categories RENAME COLUMN partner_id TO company_id;
ALTER TABLE companies_branches RENAME COLUMN partner_id TO company_id;
ALTER TABLE companies_past_projects RENAME COLUMN partner_id TO company_id;
ALTER TABLE companies_qualifications_unified RENAME COLUMN partner_id TO company_id;
ALTER TABLE companies_qualifications_orderers RENAME COLUMN partner_id TO company_id;
ALTER TABLE companies_qualifications_orderer_items RENAME COLUMN partner_id TO company_id;

-- Step 7: Add indexes
CREATE INDEX IF NOT EXISTS idx_companies_is_customer ON companies (is_customer) WHERE is_customer = TRUE;
CREATE INDEX IF NOT EXISTS idx_companies_is_partner ON companies (is_partner) WHERE is_partner = TRUE;
CREATE INDEX IF NOT EXISTS idx_companies_company_no ON companies (company_no) WHERE company_no IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_companies_name ON companies (name);
CREATE INDEX IF NOT EXISTS idx_companies_region ON companies (region);
CREATE INDEX IF NOT EXISTS idx_companies_corporate_number ON companies (corporate_number) WHERE corporate_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_companies_categories_company_id ON companies_categories (company_id);
CREATE INDEX IF NOT EXISTS idx_companies_branches_company_id ON companies_branches (company_id);
CREATE INDEX IF NOT EXISTS idx_companies_past_projects_company_id ON companies_past_projects (company_id);
CREATE INDEX IF NOT EXISTS idx_companies_qualifications_unified_company_id ON companies_qualifications_unified (company_id);
CREATE INDEX IF NOT EXISTS idx_companies_qualifications_orderers_company_id ON companies_qualifications_orderers (company_id);

-- Step 8: Drop old tables
DROP TABLE IF EXISTS partners_master CASCADE;
DROP TABLE IF EXISTS company_master CASCADE;

-- =============================================================================
-- migrate:down
-- =============================================================================

-- Restore old tables (structure only — data migration back is not automated)
CREATE TABLE IF NOT EXISTS company_master (
  company_no INTEGER PRIMARY KEY,
  company_name TEXT,
  company_name_kana TEXT,
  corporate_number TEXT,
  establishment_date TEXT,
  company_address TEXT,
  postal_code TEXT,
  email TEXT,
  fax TEXT,
  capital TEXT,
  main_business TEXT,
  telephone TEXT,
  name_of_representative TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  article_70_flag TEXT,
  article_71_flag TEXT,
  bankruptcy_flag TEXT,
  "Corporate_Reorganization_Flag" TEXT,
  "Corporate_Reorganization_start_date" TEXT,
  "Post_Reorganization_Reacquisition_Date" TEXT,
  "Anti_Social_Forces_Flag" TEXT,
  "Adult_Ward_Flag" TEXT,
  "Foreign_Legal_Restriction_Flag" TEXT,
  "Subversive_Organization_Flag" TEXT,
  "No_Social_Insurance_Arrears_Flag" TEXT,
  "Information_Security_Framework_Flag" TEXT,
  "BOJ_Transaction_Suspension_flag" TEXT,
  remarks TEXT,
  created_date TEXT,
  updated_date TEXT
);

CREATE TABLE IF NOT EXISTS partners_master (
  partner_id TEXT PRIMARY KEY,
  "no" SERIAL,
  name TEXT,
  company_name TEXT,
  "postalCode" TEXT,
  address TEXT,
  phone TEXT,
  fax TEXT,
  email TEXT,
  url TEXT,
  "surveyCount" INTEGER DEFAULT 0,
  rating NUMERIC,
  "resultCount" INTEGER DEFAULT 0,
  representative TEXT,
  establishment_date TEXT,
  capital TEXT,
  "employeeCount" INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  "createdDate" TEXT,
  "updatedDate" TEXT,
  detail_url TEXT,
  region TEXT
);

-- Rename tables back
ALTER TABLE companies_categories RENAME COLUMN company_id TO partner_id;
ALTER TABLE companies_branches RENAME COLUMN company_id TO partner_id;
ALTER TABLE companies_past_projects RENAME COLUMN company_id TO partner_id;
ALTER TABLE companies_qualifications_unified RENAME COLUMN company_id TO partner_id;
ALTER TABLE companies_qualifications_orderers RENAME COLUMN company_id TO partner_id;
ALTER TABLE companies_qualifications_orderer_items RENAME COLUMN company_id TO partner_id;

ALTER TABLE companies_categories RENAME TO partners_categories;
ALTER TABLE companies_branches RENAME TO partners_branches;
ALTER TABLE companies_past_projects RENAME TO partners_past_projects;
ALTER TABLE companies_qualifications_unified RENAME TO partners_qualifications_unified;
ALTER TABLE companies_qualifications_orderers RENAME TO partners_qualifications_orderers;
ALTER TABLE companies_qualifications_orderer_items RENAME TO partners_qualifications_orderer_items;

-- Drop new tables
DROP TABLE IF EXISTS company_disqualifications CASCADE;
DROP TABLE IF EXISTS companies CASCADE;
