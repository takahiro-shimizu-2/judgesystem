-- migrate:up

-- Back up existing PK mapping so rollback can restore the constraint safely
CREATE TABLE IF NOT EXISTS _backup_announcements_documents_pk AS
  SELECT document_id, COUNT(*) AS cnt
  FROM announcements_documents_master
  GROUP BY document_id;

ALTER TABLE announcements_documents_master
  DROP CONSTRAINT IF EXISTS announcements_documents_master_pkey;

ALTER TABLE announcements_documents_master
  ADD COLUMN IF NOT EXISTS doc_entry_id BIGSERIAL PRIMARY KEY;

-- migrate:down

-- Before restoring the old PK, deduplicate document_id so the UNIQUE
-- constraint will not fail.  Keep only the row with the lowest doc_entry_id
-- for each document_id.
DELETE FROM announcements_documents_master a
  USING announcements_documents_master b
  WHERE a.document_id = b.document_id
    AND a.doc_entry_id > b.doc_entry_id;

ALTER TABLE announcements_documents_master
  DROP COLUMN IF EXISTS doc_entry_id;

ALTER TABLE announcements_documents_master
  ADD CONSTRAINT announcements_documents_master_pkey PRIMARY KEY (document_id);

DROP TABLE IF EXISTS _backup_announcements_documents_pk;
