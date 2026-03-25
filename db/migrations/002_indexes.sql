-- Index strategy for bid eligibility judgment system
-- Apply these indexes to improve query performance

-- Evaluation list filtering (most common query pattern)
CREATE INDEX IF NOT EXISTS idx_evaluation_statuses_evaluation_no
  ON backend_evaluation_statuses ("evaluationNo");

CREATE INDEX IF NOT EXISTS idx_evaluation_statuses_work_status
  ON backend_evaluation_statuses ("workStatus");

-- Evaluation assignees lookup
CREATE INDEX IF NOT EXISTS idx_evaluation_assignees_evaluation_no
  ON evaluation_assignees (evaluation_no);

-- Orderer workflow states lookup
CREATE INDEX IF NOT EXISTS idx_evaluation_orderer_workflow_evaluation_no
  ON evaluation_orderer_workflow_states (evaluation_no);

-- Announcement filtering
CREATE INDEX IF NOT EXISTS idx_bid_announcements_category
  ON bid_announcements (category);

CREATE INDEX IF NOT EXISTS idx_bid_announcements_bid_type
  ON bid_announcements ("bidType");

-- Company master lookup
CREATE INDEX IF NOT EXISTS idx_company_master_company_no
  ON company_master (company_no);

-- Office master lookup (for branch joins)
CREATE INDEX IF NOT EXISTS idx_office_master_company_no
  ON office_master (company_no);

-- Contact search
CREATE INDEX IF NOT EXISTS idx_workflow_contacts_name
  ON workflow_contacts (name);

-- Partner search
CREATE INDEX IF NOT EXISTS idx_partners_master_company_name
  ON partners_master (name);
