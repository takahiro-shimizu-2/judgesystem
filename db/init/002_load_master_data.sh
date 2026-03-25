#!/bin/bash
set -e

MASTER_DIR="/master-data"

if [ ! -d "$MASTER_DIR" ]; then
  echo "Master data directory not found, skipping data load."
  exit 0
fi

echo "Loading master data from TSV files..."

load_tsv() {
  local file="$1"
  local table="$2"
  local basename=$(basename "$file")

  if [ ! -f "$file" ]; then
    return
  fi

  local lines=$(wc -l < "$file")
  if [ "$lines" -le 1 ]; then
    echo "  SKIP $basename (empty)"
    return
  fi

  echo "  LOAD $basename -> $table ($((lines - 1)) rows)"
  # Use COPY with CSV format, tab delimiter, skip header
  psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "\COPY $table FROM '$file' WITH (FORMAT csv, DELIMITER E'\t', HEADER true, NULL '')"
}

load_tsv "$MASTER_DIR/company_master.txt"                          "company_master(company_no, company_name, company_name_kana, corporate_number, establishment_date, company_address, postal_code, email, fax, capital, main_business, telephone, name_of_representative, article_70_flag, article_71_flag, bankruptcy_flag, \"Corporate_Reorganization_Flag\", \"Corporate_Reorganization_start_date\", \"Post_Reorganization_Reacquisition_Date\", \"Anti_Social_Forces_Flag\", \"Adult_Ward_Flag\", \"Foreign_Legal_Restriction_Flag\", \"Subversive_Organization_Flag\", \"No_Social_Insurance_Arrears_Flag\", \"Information_Security_Framework_Flag\", \"BOJ_Transaction_Suspension_flag\", remarks, created_date, updated_date)"

load_tsv "$MASTER_DIR/office_master.txt"                           "office_master(office_no, company_no, office_name, office_type, office_address, office_telephone, office_postal_code, office_email, office_fax, \"Located_Prefecture\", created_date, updated_date)"

load_tsv "$MASTER_DIR/partners_master.txt"                         "partners_master(partner_id, \"no\", name, \"postalCode\", address, phone, email, fax, url, \"surveyCount\", rating, \"resultCount\", representative, establishment_date, capital, \"employeeCount\")"

load_tsv "$MASTER_DIR/partners_categories.txt"                     "partners_categories(partner_id, categories)"

load_tsv "$MASTER_DIR/partners_branches.txt"                       "partners_branches(partner_id, name, address)"

load_tsv "$MASTER_DIR/partners_qualifications_unified.txt"         "partners_qualifications_unified(partner_id, \"mainCategory\", category, region, value, grade)"

load_tsv "$MASTER_DIR/partners_qualifications_orderers.txt"        "partners_qualifications_orderers(partner_id, \"ordererName\")"

load_tsv "$MASTER_DIR/partners_qualifications_orderer_items.txt"   "partners_qualifications_orderer_items(partner_id, \"ordererName\", category, region, value, grade)"

load_tsv "$MASTER_DIR/partners_past_projects.txt"                  "partners_past_projects(partner_id, \"evaluationId\", \"announcementId\", \"announcementNo\", \"announcementTitle\", \"branchName\", \"workStatus\", \"evaluationStatus\", priority, \"bidType\", category, prefecture, \"publishDate\", deadline, \"evaluatedAt\", organization)"

load_tsv "$MASTER_DIR/announcements_documents_master.txt"          "announcements_documents_master(announcement_no, document_id, type, document_name, \"fileFormat\", \"pageCount\", \"extractedAt\", document_url, ocr_text)"

load_tsv "$MASTER_DIR/announcements_competing_companies_master.txt" "announcements_competing_companies_master(announcement_id, company_name, \"isWinner\")"

load_tsv "$MASTER_DIR/announcements_competing_company_bids_master.txt" "announcements_competing_company_bids_master(announcement_id, company_name, bid_order, bid_amount)"

load_tsv "$MASTER_DIR/agency_master.txt"                           "agency_master(agency_no, agency_name, parent_agency_no, agency_level, sort_order, agency_area, official_url, remarks, created_at, updated_at)"

load_tsv "$MASTER_DIR/construction_master.txt"                     "construction_master(construction_no, construction_name, category_segment, official_code, parent_construction_no, construction_level, sort_order, remarks, created_at, updated_at)"

load_tsv "$MASTER_DIR/technician_qualification_master.txt"         "technician_qualification_master(qualification_no, qualification_name, qualification_type, qualification_category, issuing_organization, parent_qualification_id, qualification_level, sort_order, remarks, created_at, updated_at)"

load_tsv "$MASTER_DIR/office_registration_authorization_master.txt" "office_registration_authorization_master(office_no, office_registration_no, agency_no, construction_no, license_grade, license_score, status, registered_date, expiration_date, is_suspended, remarks, created_at, updated_at)"

echo "Master data load complete."
