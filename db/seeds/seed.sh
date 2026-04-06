#!/usr/bin/env bash
# =============================================================
# Idempotent Master Data Seeder
# =============================================================
# Loads TSV files into PostgreSQL using TRUNCATE + COPY
# within a single transaction (atomic, idempotent).
#
# Usage:
#   ./db/seeds/seed.sh [data_dir]
#
# Environment:
#   PGHOST, PGPORT, PGDATABASE, PGUSER, PGPASSWORD
#   MASTER_DATA_DIR (default: /master-data)
# =============================================================
set -euo pipefail

MASTER_DIR="${1:-${MASTER_DATA_DIR:-/master-data}}"

if [ ! -d "$MASTER_DIR" ]; then
  echo "Master data directory not found: $MASTER_DIR"
  echo "Skipping seed."
  exit 0
fi

echo "=== Master Data Seeder ==="
echo "Source: $MASTER_DIR"
echo ""

# Build psql script in a temp file
SCRIPT=$(mktemp /tmp/seed_XXXXXX)
trap "rm -f $SCRIPT" EXIT

echo "BEGIN;" > "$SCRIPT"

# Truncate all seeded tables atomically
cat >> "$SCRIPT" << 'SQL'
TRUNCATE
  companies,
  company_disqualifications,
  office_master,
  office_work_achivements_master,
  companies_categories,
  companies_branches,
  companies_qualifications_unified,
  companies_qualifications_orderers,
  companies_qualifications_orderer_items,
  companies_past_projects,
  announcements_competing_companies_master,
  announcements_competing_company_bids_master,
  announcements_estimated_amounts,
  agency_master,
  construction_master,
  technician_qualification_master,
  office_registration_authorization_master,
  similar_cases_master,
  similar_cases_competitors
CASCADE;
SQL

# Add \COPY command if data file has content
# Supports .txt/.tsv (tab-delimited) and .csv (comma-delimited)
load_data() {
  local file="$1"
  local table_spec="$2"
  local basename
  basename=$(basename "$file")

  if [ ! -f "$file" ]; then
    echo "  SKIP $basename (not found)"
    return
  fi

  local lines
  lines=$(wc -l < "$file")
  if [ "$lines" -le 1 ]; then
    echo "  SKIP $basename (empty)"
    return
  fi

  # Auto-detect delimiter from file extension
  local copy_opts
  case "$file" in
    *.csv) copy_opts="FORMAT csv, HEADER true, NULL ''" ;;
    *)     copy_opts="FORMAT csv, DELIMITER E'\\t', HEADER true, NULL ''" ;;
  esac

  local table_name="${table_spec%%(*}"
  echo "  LOAD $basename -> $table_name ($((lines - 1)) rows)"
  echo "\\COPY ${table_spec} FROM '${file}' WITH (${copy_opts})" >> "$SCRIPT"
}

# --- Master data tables ---

# --- company_master.txt -> companies + company_disqualifications ---
# Load into a temp table first, then split into the two normalised tables.
# The temp table mirrors the original company_master TSV columns.
_COMPANY_MASTER_FILE="$MASTER_DIR/company_master.txt"
if [ -f "$_COMPANY_MASTER_FILE" ] && [ "$(wc -l < "$_COMPANY_MASTER_FILE")" -gt 1 ]; then
  _CM_ROWS=$(( $(wc -l < "$_COMPANY_MASTER_FILE") - 1 ))
  echo "  LOAD company_master.txt -> companies + company_disqualifications ($_CM_ROWS rows)"

  cat >> "$SCRIPT" << 'SQL'
CREATE TEMP TABLE _tmp_company_master (
  company_no        INTEGER,
  company_name      TEXT,
  company_name_kana TEXT,
  corporate_number  TEXT,
  establishment_date TEXT,
  company_address   TEXT,
  postal_code       TEXT,
  email             TEXT,
  fax               TEXT,
  capital           TEXT,
  main_business     TEXT,
  telephone         TEXT,
  name_of_representative TEXT,
  article_70_flag   TEXT,
  article_71_flag   TEXT,
  bankruptcy_flag   TEXT,
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
  remarks           TEXT,
  created_date      TEXT,
  updated_date      TEXT
);
SQL

  echo "\\COPY _tmp_company_master FROM '${_COMPANY_MASTER_FILE}' WITH (FORMAT csv, DELIMITER E'\\t', HEADER true, NULL '')" >> "$SCRIPT"

  cat >> "$SCRIPT" << 'SQL'
INSERT INTO companies (
  id, company_no, name, name_kana, corporate_number, establishment_date,
  address, postal_code, email, fax, capital, main_business, phone,
  representative, remarks, is_customer, is_partner, is_active,
  created_at, updated_at
)
SELECT
  uuid_generate_v5(uuid_ns_url(), 'company_master::' || company_no::text),
  company_no, company_name, company_name_kana, corporate_number, establishment_date,
  company_address, postal_code, email, fax, capital, main_business, telephone,
  name_of_representative, remarks,
  TRUE,   -- is_customer (from company_master)
  FALSE,  -- is_partner
  TRUE,   -- is_active
  COALESCE(created_date::timestamptz, NOW()),
  COALESCE(updated_date::timestamptz, NOW())
FROM _tmp_company_master;

INSERT INTO company_disqualifications (
  company_id,
  article_70_flag, article_71_flag, bankruptcy_flag,
  corporate_reorganization_flag, corporate_reorganization_start_date,
  post_reorganization_reacquisition_date, anti_social_forces_flag,
  adult_ward_flag, foreign_legal_restriction_flag,
  subversive_organization_flag, no_social_insurance_arrears_flag,
  information_security_framework_flag, boj_transaction_suspension_flag,
  created_at, updated_at
)
SELECT
  uuid_generate_v5(uuid_ns_url(), 'company_master::' || company_no::text),
  article_70_flag, article_71_flag, bankruptcy_flag,
  "Corporate_Reorganization_Flag", "Corporate_Reorganization_start_date",
  "Post_Reorganization_Reacquisition_Date", "Anti_Social_Forces_Flag",
  "Adult_Ward_Flag", "Foreign_Legal_Restriction_Flag",
  "Subversive_Organization_Flag", "No_Social_Insurance_Arrears_Flag",
  "Information_Security_Framework_Flag", "BOJ_Transaction_Suspension_flag",
  COALESCE(created_date::timestamptz, NOW()),
  COALESCE(updated_date::timestamptz, NOW())
FROM _tmp_company_master;

DROP TABLE _tmp_company_master;
SQL

else
  echo "  SKIP company_master.txt (not found or empty)"
fi

load_data "$MASTER_DIR/office_master.txt" \
  'office_master(office_no, company_no, office_name, office_type, office_address, office_telephone, office_postal_code, office_email, office_fax, "Located_Prefecture", created_date, updated_date)'

# --- partners_master.csv -> companies (is_partner=TRUE) ---
# Uses a temp table to map partner_id -> companies.id via uuid_generate_v5.
_PARTNERS_MASTER_FILE="$MASTER_DIR/partners_master.csv"
if [ -f "$_PARTNERS_MASTER_FILE" ] && [ "$(wc -l < "$_PARTNERS_MASTER_FILE")" -gt 1 ]; then
  _PM_ROWS=$(( $(wc -l < "$_PARTNERS_MASTER_FILE") - 1 ))
  echo "  LOAD partners_master.csv -> companies ($_PM_ROWS rows)"

  cat >> "$SCRIPT" << 'SQL'
CREATE TEMP TABLE _tmp_partners_master (
  partner_id        TEXT,
  name              TEXT,
  "postalCode"      TEXT,
  address           TEXT,
  phone             TEXT,
  email             TEXT,
  fax               TEXT,
  url               TEXT,
  "surveyCount"     INTEGER,
  rating            NUMERIC,
  "resultCount"     INTEGER,
  representative    TEXT,
  establishment_date TEXT,
  capital           TEXT,
  "employeeCount"   INTEGER,
  detail_url        TEXT,
  region            TEXT
);
SQL

  echo "\\COPY _tmp_partners_master FROM '${_PARTNERS_MASTER_FILE}' WITH (FORMAT csv, HEADER true, NULL '')" >> "$SCRIPT"

  cat >> "$SCRIPT" << 'SQL'
INSERT INTO companies (
  id, name, postal_code, address, phone, email, fax, url,
  survey_count, rating, result_count, representative,
  establishment_date, capital, employee_count, detail_url, region,
  is_customer, is_partner, is_active,
  created_at, updated_at
)
SELECT
  partner_id,
  name, "postalCode", address, phone, email, fax, url,
  "surveyCount", rating, "resultCount", representative,
  establishment_date, capital, "employeeCount", detail_url, region,
  FALSE,  -- is_customer
  TRUE,   -- is_partner (from partners_master)
  TRUE,   -- is_active
  NOW(), NOW()
FROM _tmp_partners_master
ON CONFLICT (id) DO UPDATE SET
  is_partner = TRUE,
  name       = EXCLUDED.name,
  updated_at = NOW();

DROP TABLE _tmp_partners_master;
SQL

else
  echo "  SKIP partners_master.csv (not found or empty)"
fi

load_data "$MASTER_DIR/companies_categories.csv" \
  'companies_categories(company_id, category_group, categories)'

load_data "$MASTER_DIR/companies_branches.txt" \
  'companies_branches(company_id, name, address)'

load_data "$MASTER_DIR/companies_qualifications_unified.txt" \
  'companies_qualifications_unified(company_id, "mainCategory", category, region, value, grade)'

load_data "$MASTER_DIR/companies_qualifications_orderers.txt" \
  'companies_qualifications_orderers(company_id, "ordererName")'

load_data "$MASTER_DIR/companies_qualifications_orderer_items.txt" \
  'companies_qualifications_orderer_items(company_id, "ordererName", category, region, value, grade)'

load_data "$MASTER_DIR/companies_past_projects.txt" \
  'companies_past_projects(company_id, "evaluationId", "announcementId", "announcementNo", "announcementTitle", "branchName", "workStatus", "evaluationStatus", priority, "bidType", category, prefecture, "publishDate", deadline, "evaluatedAt", organization)'

load_data "$MASTER_DIR/announcements_competing_companies_master.txt" \
  'announcements_competing_companies_master(announcement_id, company_name, "isWinner")'

load_data "$MASTER_DIR/announcements_competing_company_bids_master.txt" \
  'announcements_competing_company_bids_master(announcement_id, company_name, bid_amount, bid_order)'

load_data "$MASTER_DIR/announcements_estimated_amounts.txt" \
  'announcements_estimated_amounts(announcement_no, estimated_amount_min, estimated_amount_max)'

load_data "$MASTER_DIR/agency_master.txt" \
  'agency_master(agency_no, agency_name, parent_agency_no, agency_level, sort_order, agency_area, official_url, remarks, created_at, updated_at)'

load_data "$MASTER_DIR/construction_master.txt" \
  'construction_master(construction_no, construction_name, category_segment, official_code, parent_construction_no, construction_level, sort_order, remarks, created_at, updated_at)'

load_data "$MASTER_DIR/technician_qualification_master.txt" \
  'technician_qualification_master(qualification_no, qualification_name, qualification_type, qualification_category, issuing_organization, parent_qualification_id, qualification_level, sort_order, remarks, created_at, updated_at)'

load_data "$MASTER_DIR/office_registration_authorization_master.txt" \
  'office_registration_authorization_master(office_no, office_registration_no, agency_no, construction_no, license_grade, license_score, status, registered_date, expiration_date, is_suspended, remarks, created_at, updated_at)'

load_data "$MASTER_DIR/office_work_achivements_master.txt" \
  'office_work_achivements_master(office_experience_no, office_no, agency_no, construction_no, project_name, contractor_layer, start_date, completion_date, final_score, total_amount, is_jv_flag, jv_ratio, remarks)'

load_data "$MASTER_DIR/similar_cases_master.txt" \
  'similar_cases_master(announcement_id, similar_case_announcement_id, case_name, winning_company, winning_amount)'

load_data "$MASTER_DIR/similar_cases_competitors.txt" \
  'similar_cases_competitors(similar_case_announcement_id, competitor_name)'

echo "COMMIT;" >> "$SCRIPT"

# Execute all commands in a single transaction
psql -v ON_ERROR_STOP=1 -f "$SCRIPT"

echo ""
echo "=== Seed complete ==="
