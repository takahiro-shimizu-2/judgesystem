-- migrate:up

CREATE TABLE IF NOT EXISTS evaluation_partner_workflow_states (
  evaluation_no TEXT PRIMARY KEY,
  state JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- migrate:down

DROP TABLE IF EXISTS evaluation_partner_workflow_states;
