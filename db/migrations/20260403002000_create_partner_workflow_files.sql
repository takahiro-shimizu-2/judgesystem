-- migrate:up

CREATE TABLE IF NOT EXISTS evaluation_partner_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  evaluation_no TEXT NOT NULL,
  partner_id TEXT,
  flow_type TEXT NOT NULL CHECK (flow_type IN ('sent', 'received')),
  name TEXT NOT NULL,
  content_type TEXT,
  size BIGINT NOT NULL,
  data BYTEA NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_partner_files_evaluation_no
  ON evaluation_partner_files (evaluation_no);

CREATE INDEX IF NOT EXISTS idx_partner_files_partner
  ON evaluation_partner_files (partner_id);

-- migrate:down

DROP TABLE IF EXISTS evaluation_partner_files;
