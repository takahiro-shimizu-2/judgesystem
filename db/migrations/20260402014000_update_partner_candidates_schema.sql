-- migrate:up

ALTER TABLE evaluation_partner_candidates
  ADD COLUMN IF NOT EXISTS partner_id TEXT;

UPDATE evaluation_partner_candidates
SET partner_id = COALESCE(partner_id, partner_company_id, partner_office_id, partner_name)
WHERE partner_id IS NULL;

ALTER TABLE evaluation_partner_candidates
  ALTER COLUMN partner_id SET NOT NULL;

ALTER TABLE evaluation_partner_candidates
  DROP CONSTRAINT IF EXISTS evaluation_partner_candidates_evaluation_no_partner_company_id_partner_office_id_key;

ALTER TABLE evaluation_partner_candidates
  ADD CONSTRAINT evaluation_partner_candidates_unique_eval_partner UNIQUE (evaluation_no, partner_id);

ALTER TABLE evaluation_partner_candidates
  DROP COLUMN IF EXISTS partner_company_id,
  DROP COLUMN IF EXISTS partner_office_id;

-- migrate:down

ALTER TABLE evaluation_partner_candidates
  ADD COLUMN IF NOT EXISTS partner_company_id TEXT,
  ADD COLUMN IF NOT EXISTS partner_office_id TEXT;

ALTER TABLE evaluation_partner_candidates
  DROP CONSTRAINT IF EXISTS evaluation_partner_candidates_unique_eval_partner;

ALTER TABLE evaluation_partner_candidates
  ADD CONSTRAINT evaluation_partner_candidates_evaluation_no_partner_company_id_partner_office_id_key
  UNIQUE (evaluation_no, partner_company_id, partner_office_id);

UPDATE evaluation_partner_candidates
SET partner_company_id = partner_id
WHERE partner_company_id IS NULL;

ALTER TABLE evaluation_partner_candidates
  DROP COLUMN IF EXISTS partner_id;
