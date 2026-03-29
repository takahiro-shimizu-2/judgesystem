-- migrate:up

ALTER TABLE workflow_contacts
  ADD COLUMN IF NOT EXISTS company_name TEXT;

UPDATE workflow_contacts
SET company_name = COALESCE(company_name, '');

-- migrate:down

ALTER TABLE workflow_contacts
  DROP COLUMN IF EXISTS company_name;
