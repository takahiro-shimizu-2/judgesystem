-- migrate:up

CREATE TABLE IF NOT EXISTS evaluation_partner_candidates (
  id BIGSERIAL PRIMARY KEY,
  evaluation_no TEXT NOT NULL,
  partner_id TEXT NOT NULL,
  partner_name TEXT NOT NULL,
  contact_person TEXT,
  phone TEXT,
  email TEXT,
  fax TEXT,
  status TEXT NOT NULL DEFAULT 'not_called',
  survey_approved BOOLEAN NOT NULL DEFAULT FALSE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (evaluation_no, partner_id)
);

CREATE INDEX IF NOT EXISTS idx_evaluation_partner_candidates_eval_no
  ON evaluation_partner_candidates (evaluation_no);

-- migrate:down

DROP TABLE IF EXISTS evaluation_partner_candidates;
