-- migrate:up

CREATE INDEX IF NOT EXISTS idx_evaluation_statuses_evaluation_no
  ON backend_evaluation_statuses ("evaluationNo");

CREATE INDEX IF NOT EXISTS idx_evaluation_statuses_work_status
  ON backend_evaluation_statuses ("workStatus");

CREATE INDEX IF NOT EXISTS idx_evaluation_assignees_evaluation_no
  ON evaluation_assignees (evaluation_no);

CREATE INDEX IF NOT EXISTS idx_evaluation_orderer_workflow_evaluation_no
  ON evaluation_orderer_workflow_states (evaluation_no);

CREATE INDEX IF NOT EXISTS idx_bid_announcements_category
  ON bid_announcements (category);

CREATE INDEX IF NOT EXISTS idx_bid_announcements_bid_type
  ON bid_announcements ("bidType");

CREATE INDEX IF NOT EXISTS idx_company_master_company_no
  ON company_master (company_no);

CREATE INDEX IF NOT EXISTS idx_office_master_company_no
  ON office_master (company_no);

CREATE INDEX IF NOT EXISTS idx_workflow_contacts_name
  ON workflow_contacts (name);

CREATE INDEX IF NOT EXISTS idx_partners_master_company_name
  ON partners_master (name);

-- migrate:down

DROP INDEX IF EXISTS idx_partners_master_company_name;
DROP INDEX IF EXISTS idx_workflow_contacts_name;
DROP INDEX IF EXISTS idx_office_master_company_no;
DROP INDEX IF EXISTS idx_company_master_company_no;
DROP INDEX IF EXISTS idx_bid_announcements_bid_type;
DROP INDEX IF EXISTS idx_bid_announcements_category;
DROP INDEX IF EXISTS idx_evaluation_orderer_workflow_evaluation_no;
DROP INDEX IF EXISTS idx_evaluation_assignees_evaluation_no;
DROP INDEX IF EXISTS idx_evaluation_statuses_work_status;
DROP INDEX IF EXISTS idx_evaluation_statuses_evaluation_no;
