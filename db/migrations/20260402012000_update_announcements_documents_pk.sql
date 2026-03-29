-- migrate:up

ALTER TABLE announcements_documents_master
  DROP CONSTRAINT IF EXISTS announcements_documents_master_pkey;

ALTER TABLE announcements_documents_master
  ADD COLUMN IF NOT EXISTS doc_entry_id BIGSERIAL PRIMARY KEY;

-- migrate:down

ALTER TABLE announcements_documents_master
  DROP COLUMN IF EXISTS doc_entry_id;

ALTER TABLE announcements_documents_master
  ADD CONSTRAINT announcements_documents_master_pkey PRIMARY KEY (document_id);
