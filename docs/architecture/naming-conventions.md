# DB Naming Conventions - Current State and Improvement Plan

Issue: #121

## 1. Current Naming Patterns

### Table Names

All table names use `snake_case`. This is consistent across the entire schema.

```
bid_announcements, bid_orderers, bid_requirements,
company_master, office_master, partners_master, ...
```

### Column Names

Three naming conventions are mixed within the same schema:

| Pattern | Example | Tables |
|---------|---------|--------|
| `snake_case` | `announcement_no`, `company_no`, `created_date` | Most tables |
| `"camelCase"` (quoted) | `"workName"`, `"publishDate"`, `"createdDate"` | bid_announcements, bid_requirements, partners_master, backend_evaluation_statuses, etc. |
| `"PascalCase"` (quoted) | `"Corporate_Reorganization_Flag"`, `"Anti_Social_Forces_Flag"` | company_master |

### Detailed Breakdown by Table

#### Tables using only snake_case (clean)
- `agency_master`
- `construction_master`
- `technician_qualification_master`
- `office_registration_authorization_master`
- `workflow_contacts`
- `evaluation_assignees`
- `evaluation_orderer_workflow_states`
- `source_pages`
- `similar_cases_master`
- `similar_cases_competitors`
- `evaluation_partner_candidates`
- `evaluation_partner_workflow_states`
- `evaluation_partner_files`
- `announcements_estimated_amounts`
- `bid_announcements_dates` (except `"createdDate"`, `"updatedDate"`)

#### Tables with mixed naming (problematic)

**bid_announcements**
- snake_case: `announcement_no`, `zipcode`, `address`, `department`, `telephone`, `fax`, `mail`, `remarks`, `orderer_id`, `category`, `is_ocr_failed`
- camelCase: `"workName"`, `"userAnnNo"`, `"topAgencyNo"`, `"topAgencyName"`, `"subAgencyNo"`, `"subAgencyName"`, `"workPlace"`, `"assigneeName"`, `"publishDate"`, `"docDistStart"`, `"docDistEnd"`, `"submissionStart"`, `"submissionEnd"`, `"bidStartDate"`, `"bidEndDate"`, `"doneOCR"`, `"createdDate"`, `"updatedDate"`, `"bidType"`

**company_master**
- snake_case: `company_no`, `company_name`, `company_name_kana`, `corporate_number`, `establishment_date`, `company_address`, `postal_code`, `email`, `fax`, `capital`, `main_business`, `telephone`, `name_of_representative`, `is_active`, `article_70_flag`, `article_71_flag`, `bankruptcy_flag`, `remarks`, `created_date`, `updated_date`
- PascalCase: `"Corporate_Reorganization_Flag"`, `"Corporate_Reorganization_start_date"`, `"Post_Reorganization_Reacquisition_Date"`, `"Anti_Social_Forces_Flag"`, `"Adult_Ward_Flag"`, `"Foreign_Legal_Restriction_Flag"`, `"Subversive_Organization_Flag"`, `"No_Social_Insurance_Arrears_Flag"`, `"Information_Security_Framework_Flag"`, `"BOJ_Transaction_Suspension_flag"`

**office_master**
- snake_case: `office_no`, `company_no`, `office_name`, `office_type`, `office_address`, `office_telephone`, `office_postal_code`, `office_email`, `office_fax`, `created_date`, `updated_date`
- PascalCase: `"Located_Prefecture"`

**partners_master**
- snake_case: `partner_id`, `name`, `company_name`, `address`, `phone`, `fax`, `email`, `url`, `rating`, `representative`, `establishment_date`, `capital`, `is_active`, `detail_url`, `region`
- camelCase: `"postalCode"`, `"surveyCount"`, `"resultCount"`, `"employeeCount"`, `"createdDate"`, `"updatedDate"`

**backend_evaluation_statuses**
- All camelCase: `"evaluationNo"`, `"workStatus"`, `"currentStep"`, `"createdAt"`, `"updatedAt"`

**partners_past_projects**
- snake_case: `partner_id`, `priority`, `category`, `prefecture`, `deadline`, `organization`
- camelCase: `"evaluationId"`, `"announcementId"`, `"announcementNo"`, `"announcementTitle"`, `"branchName"`, `"workStatus"`, `"evaluationStatus"`, `"bidType"`, `"publishDate"`, `"evaluatedAt"`

**partners_qualifications_unified / partners_qualifications_orderer_items**
- snake_case: `partner_id`, `category`, `region`, `value`, `grade`
- camelCase: `"mainCategory"` / `"ordererName"`

**announcements_competing_companies_master / announcements_competing_company_bids_master**
- snake_case: `announcement_id`, `company_name`, `bid_amount`, `bid_order`
- camelCase: `"isWinner"`

### Timestamp Column Naming

Four different conventions exist for timestamp columns:

| Pattern | Tables |
|---------|--------|
| `"createdDate"` / `"updatedDate"` | bid_announcements, bid_requirements, company_bid_judgement, sufficient_requirements, insufficient_requirements, partners_master, bid_announcements_dates |
| `created_date` / `updated_date` | company_master, office_master |
| `created_at` / `updated_at` | agency_master, construction_master, technician_qualification_master, office_registration_authorization_master, workflow_contacts, evaluation_orderer_workflow_states, evaluation_partner_candidates, evaluation_partner_workflow_states, evaluation_partner_files |
| `"createdAt"` / `"updatedAt"` | backend_evaluation_statuses |

## 2. Foreign Key Constraints - Current State

### Existing Foreign Keys (before this fix)

| Table | Column | References | Added In |
|-------|--------|------------|----------|
| `evaluation_assignees` | `contact_id` | `workflow_contacts(contact_id)` | baseline |
| `bid_announcements_dates` | `announcement_no` | `bid_announcements(announcement_no)` | 20260330 migration |

### Missing Foreign Keys (added in migration 20260404000000)

| # | Table | Column | References |
|---|-------|--------|------------|
| 1 | `bid_requirements` | `announcement_no` | `bid_announcements(announcement_no)` |
| 2 | `announcements_documents_master` | `announcement_no` | `bid_announcements(announcement_no)` |
| 3 | `announcements_estimated_amounts` | `announcement_no` | `bid_announcements(announcement_no)` |
| 4 | `company_bid_judgement` | `announcement_no` | `bid_announcements(announcement_no)` |
| 5 | `company_bid_judgement` | `company_no` | `company_master(company_no)` |
| 6 | `company_bid_judgement` | `office_no` | `office_master(office_no)` |
| 7 | `sufficient_requirements` | `announcement_no` | `bid_announcements(announcement_no)` |
| 8 | `sufficient_requirements` | `company_no` | `company_master(company_no)` |
| 9 | `insufficient_requirements` | `announcement_no` | `bid_announcements(announcement_no)` |
| 10 | `insufficient_requirements` | `company_no` | `company_master(company_no)` |
| 11 | `office_master` | `company_no` | `company_master(company_no)` |
| 12 | `office_work_achivements_master` | `office_no` | `office_master(office_no)` |
| 13 | `partners_categories` | `partner_id` | `partners_master(partner_id)` |
| 14 | `partners_past_projects` | `partner_id` | `partners_master(partner_id)` |
| 15 | `partners_branches` | `partner_id` | `partners_master(partner_id)` |
| 16 | `partners_qualifications_unified` | `partner_id` | `partners_master(partner_id)` |
| 17 | `partners_qualifications_orderers` | `partner_id` | `partners_master(partner_id)` |
| 18 | `partners_qualifications_orderer_items` | `partner_id` | `partners_master(partner_id)` |
| 19 | `evaluation_partner_candidates` | `partner_id` | `partners_master(partner_id)` |
| 20 | `similar_cases_master` | `announcement_id` | `bid_announcements(announcement_no)` |

### Deferred (not added - requires data migration first)

| Table | Column | Issue |
|-------|--------|-------|
| `announcements_competing_companies_master` | `announcement_id` | Was TEXT, converted to INTEGER but no PK match guarantee |
| `announcements_competing_company_bids_master` | `announcement_id` | Same as above |
| `sufficient_requirements` | `office_no` | `office_no` may contain values not in `office_master` |
| `insufficient_requirements` | `office_no` | Same as above |
| `office_work_achivements_master` | `agency_no` | `agency_master.agency_no` lacks UNIQUE constraint |

### Prerequisites Added

- `office_master.office_no` received a UNIQUE constraint (`uq_office_master_office_no`) to make it referenceable as an FK target.

## 3. Improvement Plan

### Phase 1: Foreign Key Constraints (This PR)

- Add 20 missing FK constraints using `NOT VALID` (non-blocking)
- Validate constraints in a separate migration step
- Add UNIQUE constraint on `office_master.office_no`

### Phase 2: Primary Key Gaps (Future)

The following tables lack primary keys:

| Table | Candidate PK |
|-------|-------------|
| `bid_orderers` | `orderer_id` (needs UNIQUE + NOT NULL) |
| `office_master` | `office_no` (has UNIQUE now, needs NOT NULL + PK promotion) |
| `announcements_estimated_amounts` | `announcement_no` (if 1:1) or add surrogate |
| `announcements_competing_companies_master` | `(announcement_id, company_name)` composite |
| `announcements_competing_company_bids_master` | `(announcement_id, company_name, bid_order)` composite |
| `agency_master` | `agency_no` |
| `partners_branches` | Add surrogate `id` |

### Phase 3: Naming Convention Unification (Future - Breaking Change)

**Target convention**: `snake_case` for all column names (PostgreSQL standard).

This is a breaking change that requires:

1. Backend code changes (all SQL queries referencing quoted camelCase columns)
2. Engine code changes (Python SQLAlchemy models and raw queries)
3. Frontend may be indirectly affected through API response shapes
4. A coordinated migration with application-level changes

**Recommended approach**:
1. Add new `snake_case` columns alongside existing ones
2. Backfill data
3. Update application code to use new columns
4. Drop old columns

**Priority order for renaming** (by impact and frequency):

| Priority | Column Group | Affected Tables |
|----------|-------------|-----------------|
| High | `"createdDate"`/`"updatedDate"` -> `created_at`/`updated_at` | 7 tables |
| High | `"workName"`, `"bidType"`, etc. -> `work_name`, `bid_type` | bid_announcements |
| Medium | `"evaluationNo"`, `"workStatus"`, etc. | backend_evaluation_statuses |
| Medium | Partner-related camelCase columns | partners_master, partners_past_projects |
| Low | PascalCase flags in company_master | company_master |

### Phase 4: Timestamp Standardization (Future)

Unify all timestamp columns to:
- Name: `created_at` / `updated_at`
- Type: `TIMESTAMPTZ NOT NULL DEFAULT NOW()`

This affects 20+ tables and should be coordinated with Phase 3.

## 4. Migration Safety Notes

- All FK constraints in this PR use `NOT VALID` to avoid full table scans on large tables
- `VALIDATE CONSTRAINT` is in a separate migration so it can be run independently
- The `migrate:down` sections properly reverse all changes
- No existing column names are renamed (non-breaking)
