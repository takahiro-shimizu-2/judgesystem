-- migrate:up

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- bid_announcements (V2)
CREATE TABLE IF NOT EXISTS bid_announcements (
  announcement_no INTEGER PRIMARY KEY,
  "workName" TEXT,
  "userAnnNo" INTEGER,
  "topAgencyNo" INTEGER,
  "topAgencyName" TEXT,
  "subAgencyNo" INTEGER,
  "subAgencyName" TEXT,
  "workPlace" TEXT,
  zipcode TEXT,
  address TEXT,
  department TEXT,
  "assigneeName" TEXT,
  telephone TEXT,
  fax TEXT,
  mail TEXT,
  "publishDate" TEXT,
  "docDistStart" TEXT,
  "docDistEnd" TEXT,
  "submissionStart" TEXT,
  "submissionEnd" TEXT,
  "bidStartDate" TEXT,
  "bidEndDate" TEXT,
  "doneOCR" BOOLEAN,
  remarks TEXT,
  "createdDate" TEXT,
  "updatedDate" TEXT,
  orderer_id TEXT,
  category TEXT,
  "bidType" TEXT,
  is_ocr_failed BOOLEAN
);

-- bid_orderers
CREATE TABLE IF NOT EXISTS bid_orderers (
  orderer_id TEXT,
  "no" BIGINT,
  name TEXT,
  category TEXT,
  address TEXT,
  phone TEXT,
  fax TEXT,
  email TEXT,
  departments TEXT,
  announcementcount BIGINT,
  awardcount BIGINT,
  averageamount BIGINT,
  lastannouncementdate TEXT
);

-- bid_requirements
CREATE TABLE IF NOT EXISTS bid_requirements (
  document_id TEXT,
  announcement_no INTEGER,
  requirement_no INTEGER,
  requirement_type TEXT,
  requirement_text TEXT,
  done_judgement BOOLEAN,
  "createdDate" TEXT,
  "updatedDate" TEXT,
  is_ocr_failed BOOLEAN,
  UNIQUE(requirement_no)
);

-- announcements_documents_master
CREATE TABLE IF NOT EXISTS announcements_documents_master (
  announcement_no INTEGER,
  document_id TEXT PRIMARY KEY,
  type TEXT,
  document_name TEXT,
  "fileFormat" TEXT,
  "pageCount" INTEGER,
  "extractedAt" TEXT,
  document_url TEXT,
  ocr_text TEXT
);

-- announcements_estimated_amounts
CREATE TABLE IF NOT EXISTS announcements_estimated_amounts (
  announcement_no INTEGER,
  estimated_amount_min BIGINT,
  estimated_amount_max BIGINT
);

-- announcements_competing_companies_master
CREATE TABLE IF NOT EXISTS announcements_competing_companies_master (
  announcement_id TEXT,
  company_name TEXT,
  "isWinner" BOOLEAN
);

-- announcements_competing_company_bids_master
CREATE TABLE IF NOT EXISTS announcements_competing_company_bids_master (
  announcement_id TEXT,
  company_name TEXT,
  bid_amount BIGINT,
  bid_order INTEGER
);

-- company_bid_judgement
CREATE TABLE IF NOT EXISTS company_bid_judgement (
  evaluation_no TEXT,
  announcement_no INTEGER,
  company_no INTEGER,
  office_no INTEGER,
  requirement_ineligibility BOOLEAN,
  requirement_grade_item BOOLEAN,
  requirement_location BOOLEAN,
  requirement_experience BOOLEAN,
  requirement_technician BOOLEAN,
  requirement_other BOOLEAN,
  deficit_requirement_message TEXT,
  final_status BOOLEAN,
  message TEXT,
  remarks TEXT,
  "createdDate" TEXT,
  "updatedDate" TEXT,
  UNIQUE(evaluation_no, announcement_no, company_no, office_no)
);

-- sufficient_requirements
CREATE TABLE IF NOT EXISTS sufficient_requirements (
  sufficiency_detail_no TEXT,
  evaluation_no TEXT,
  announcement_no INTEGER,
  requirement_no INTEGER,
  company_no INTEGER,
  office_no INTEGER,
  requirement_type TEXT,
  requirement_description TEXT,
  "createdDate" TEXT,
  "updatedDate" TEXT
);

-- insufficient_requirements
CREATE TABLE IF NOT EXISTS insufficient_requirements (
  shortage_detail_no TEXT,
  evaluation_no TEXT,
  announcement_no INTEGER,
  requirement_no INTEGER,
  company_no INTEGER,
  office_no INTEGER,
  requirement_type TEXT,
  requirement_description TEXT,
  suggestions_for_improvement TEXT,
  final_comment TEXT,
  "createdDate" TEXT,
  "updatedDate" TEXT
);

-- company_master
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

-- office_master
CREATE TABLE IF NOT EXISTS office_master (
  office_no INTEGER,
  company_no INTEGER,
  office_name TEXT,
  office_type TEXT,
  office_address TEXT,
  office_telephone TEXT,
  office_postal_code TEXT,
  office_email TEXT,
  office_fax TEXT,
  "Located_Prefecture" TEXT,
  created_date TEXT,
  updated_date TEXT
);

-- office_work_achivements_master
CREATE TABLE IF NOT EXISTS office_work_achivements_master (
  office_experience_no TEXT PRIMARY KEY,
  office_no INTEGER,
  agency_no INTEGER,
  construction_no TEXT,
  project_name TEXT,
  contractor_layer TEXT,
  start_date TEXT,
  completion_date TEXT,
  final_score NUMERIC,
  total_amount BIGINT,
  is_jv_flag BOOLEAN,
  jv_ratio NUMERIC,
  remarks TEXT
);

-- partners_master
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
  "updatedDate" TEXT
);

-- partners_categories
CREATE TABLE IF NOT EXISTS partners_categories (
  partner_id TEXT,
  categories TEXT
);

-- partners_past_projects
CREATE TABLE IF NOT EXISTS partners_past_projects (
  partner_id TEXT,
  "evaluationId" TEXT,
  "announcementId" TEXT,
  "announcementNo" INTEGER,
  "announcementTitle" TEXT,
  "branchName" TEXT,
  "workStatus" TEXT,
  "evaluationStatus" TEXT,
  priority TEXT,
  "bidType" TEXT,
  category TEXT,
  prefecture TEXT,
  "publishDate" TEXT,
  deadline TEXT,
  "evaluatedAt" TEXT,
  organization TEXT
);

-- partners_branches
CREATE TABLE IF NOT EXISTS partners_branches (
  partner_id TEXT,
  name TEXT,
  address TEXT
);

-- partners_qualifications_unified
CREATE TABLE IF NOT EXISTS partners_qualifications_unified (
  partner_id TEXT,
  "mainCategory" TEXT,
  category TEXT,
  region TEXT,
  value TEXT,
  grade TEXT
);

-- partners_qualifications_orderers
CREATE TABLE IF NOT EXISTS partners_qualifications_orderers (
  partner_id TEXT,
  "ordererName" TEXT
);

-- partners_qualifications_orderer_items
CREATE TABLE IF NOT EXISTS partners_qualifications_orderer_items (
  partner_id TEXT,
  "ordererName" TEXT,
  category TEXT,
  region TEXT,
  value TEXT,
  grade TEXT,
  points INTEGER
);

-- agency_master
CREATE TABLE IF NOT EXISTS agency_master (
  agency_no INTEGER,
  agency_name TEXT,
  parent_agency_no TEXT,
  agency_level INTEGER,
  sort_order INTEGER,
  agency_area TEXT,
  official_url TEXT,
  remarks TEXT,
  created_at TEXT,
  updated_at TEXT
);

-- construction_master
CREATE TABLE IF NOT EXISTS construction_master (
  construction_no TEXT,
  construction_name TEXT,
  category_segment TEXT,
  official_code TEXT,
  parent_construction_no TEXT,
  construction_level INTEGER,
  sort_order INTEGER,
  remarks TEXT,
  created_at TEXT,
  updated_at TEXT
);

-- technician_qualification_master
CREATE TABLE IF NOT EXISTS technician_qualification_master (
  qualification_no TEXT,
  qualification_name TEXT,
  qualification_type TEXT,
  qualification_category TEXT,
  issuing_organization TEXT,
  parent_qualification_id TEXT,
  qualification_level TEXT,
  sort_order TEXT,
  remarks TEXT,
  created_at TEXT,
  updated_at TEXT
);

-- office_registration_authorization_master
CREATE TABLE IF NOT EXISTS office_registration_authorization_master (
  office_no INTEGER,
  office_registration_no INTEGER,
  agency_no INTEGER,
  construction_no INTEGER,
  license_grade TEXT,
  license_score INTEGER,
  status TEXT,
  registered_date TEXT,
  expiration_date TEXT,
  is_suspended TEXT,
  remarks TEXT,
  created_at TEXT,
  updated_at TEXT
);

-- workflow_contacts
CREATE TABLE IF NOT EXISTS workflow_contacts (
  contact_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT,
  role TEXT,
  department TEXT,
  email TEXT,
  phone TEXT,
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- evaluation_assignees
CREATE TABLE IF NOT EXISTS evaluation_assignees (
  evaluation_no TEXT NOT NULL,
  step_id TEXT NOT NULL,
  contact_id UUID NOT NULL,
  assigned_role TEXT,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  assigned_by TEXT,
  PRIMARY KEY (evaluation_no, step_id),
  FOREIGN KEY (contact_id) REFERENCES workflow_contacts(contact_id)
);

-- backend_evaluation_statuses
CREATE TABLE IF NOT EXISTS backend_evaluation_statuses (
  "evaluationNo" TEXT PRIMARY KEY,
  "workStatus" TEXT NOT NULL DEFAULT 'not_started',
  "currentStep" TEXT NOT NULL DEFAULT 'judgment',
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- evaluation_orderer_workflow_states
CREATE TABLE IF NOT EXISTS evaluation_orderer_workflow_states (
  evaluation_no TEXT PRIMARY KEY,
  state JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- migrate:down

DROP TABLE IF EXISTS evaluation_assignees;
DROP TABLE IF EXISTS evaluation_orderer_workflow_states;
DROP TABLE IF EXISTS backend_evaluation_statuses;
DROP TABLE IF EXISTS workflow_contacts;
DROP TABLE IF EXISTS insufficient_requirements;
DROP TABLE IF EXISTS sufficient_requirements;
DROP TABLE IF EXISTS company_bid_judgement;
DROP TABLE IF EXISTS announcements_competing_company_bids_master;
DROP TABLE IF EXISTS announcements_competing_companies_master;
DROP TABLE IF EXISTS announcements_estimated_amounts;
DROP TABLE IF EXISTS announcements_documents_master;
DROP TABLE IF EXISTS bid_requirements;
DROP TABLE IF EXISTS bid_orderers;
DROP TABLE IF EXISTS bid_announcements;
DROP TABLE IF EXISTS office_registration_authorization_master;
DROP TABLE IF EXISTS technician_qualification_master;
DROP TABLE IF EXISTS construction_master;
DROP TABLE IF EXISTS agency_master;
DROP TABLE IF EXISTS partners_qualifications_orderer_items;
DROP TABLE IF EXISTS partners_qualifications_orderers;
DROP TABLE IF EXISTS partners_qualifications_unified;
DROP TABLE IF EXISTS partners_branches;
DROP TABLE IF EXISTS partners_past_projects;
DROP TABLE IF EXISTS partners_categories;
DROP TABLE IF EXISTS partners_master;
DROP TABLE IF EXISTS office_work_achivements_master;
DROP TABLE IF EXISTS office_master;
DROP TABLE IF EXISTS company_master;
DROP EXTENSION IF EXISTS "pgcrypto";
