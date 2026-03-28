-- migrate:up

ALTER TABLE announcements_documents_master
  ADD COLUMN IF NOT EXISTS announcement_id INTEGER,
  ADD COLUMN IF NOT EXISTS document_name TEXT,
  ADD COLUMN IF NOT EXISTS document_url TEXT,
  ADD COLUMN IF NOT EXISTS title TEXT,
  ADD COLUMN IF NOT EXISTS url TEXT,
  ADD COLUMN IF NOT EXISTS markdown_path TEXT,
  ADD COLUMN IF NOT EXISTS ocr_json_path TEXT,
  ADD COLUMN IF NOT EXISTS file_404_flag BOOLEAN,
  ADD COLUMN IF NOT EXISTS adhoc_index TEXT,
  ADD COLUMN IF NOT EXISTS base_link_parent TEXT,
  ADD COLUMN IF NOT EXISTS base_link TEXT,
  ADD COLUMN IF NOT EXISTS dup BOOLEAN,
  ADD COLUMN IF NOT EXISTS save_path TEXT,
  ADD COLUMN IF NOT EXISTS pdf_is_saved BOOLEAN,
  ADD COLUMN IF NOT EXISTS pdf_is_saved_date TEXT,
  ADD COLUMN IF NOT EXISTS orderer_id TEXT,
  ADD COLUMN IF NOT EXISTS "topAgencyName" TEXT,
  ADD COLUMN IF NOT EXISTS done BOOLEAN,
  ADD COLUMN IF NOT EXISTS is_ocr_failed BOOLEAN;

UPDATE announcements_documents_master
  SET announcement_id = announcement_no
  WHERE announcement_id IS NULL OR announcement_id = 0;

CREATE INDEX IF NOT EXISTS idx_announcements_documents_master_announcement_id
  ON announcements_documents_master (announcement_id);

-- migrate:down

DROP INDEX IF EXISTS idx_announcements_documents_master_announcement_id;
ALTER TABLE announcements_documents_master
  DROP COLUMN IF EXISTS is_ocr_failed,
  DROP COLUMN IF EXISTS done,
  DROP COLUMN IF EXISTS "topAgencyName",
  DROP COLUMN IF EXISTS orderer_id,
  DROP COLUMN IF EXISTS pdf_is_saved_date,
  DROP COLUMN IF EXISTS pdf_is_saved,
  DROP COLUMN IF EXISTS save_path,
  DROP COLUMN IF EXISTS dup,
  DROP COLUMN IF EXISTS base_link,
  DROP COLUMN IF EXISTS base_link_parent,
  DROP COLUMN IF EXISTS adhoc_index,
  DROP COLUMN IF EXISTS file_404_flag,
  DROP COLUMN IF EXISTS ocr_json_path,
  DROP COLUMN IF EXISTS markdown_path,
  DROP COLUMN IF EXISTS url,
  DROP COLUMN IF EXISTS title,
  DROP COLUMN IF EXISTS document_url,
  DROP COLUMN IF EXISTS document_name,
  DROP COLUMN IF EXISTS announcement_id;
