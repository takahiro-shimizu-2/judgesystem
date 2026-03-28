-- migrate:up

ALTER TABLE announcements_documents_master
  ADD COLUMN IF NOT EXISTS announcement_id INTEGER,
  ADD COLUMN IF NOT EXISTS document_name TEXT,
  ADD COLUMN IF NOT EXISTS document_url TEXT,
  ADD COLUMN IF NOT EXISTS markdown_path TEXT,
  ADD COLUMN IF NOT EXISTS ocr_json_path TEXT,
  ADD COLUMN IF NOT EXISTS file_404_flag BOOLEAN;

UPDATE announcements_documents_master
  SET announcement_id = announcement_no
  WHERE announcement_id IS NULL OR announcement_id = 0;

CREATE INDEX IF NOT EXISTS idx_announcements_documents_master_announcement_id
  ON announcements_documents_master (announcement_id);

-- migrate:down

DROP INDEX IF EXISTS idx_announcements_documents_master_announcement_id;
ALTER TABLE announcements_documents_master
  DROP COLUMN IF EXISTS file_404_flag,
  DROP COLUMN IF EXISTS ocr_json_path,
  DROP COLUMN IF EXISTS markdown_path,
  DROP COLUMN IF EXISTS document_url,
  DROP COLUMN IF EXISTS document_name,
  DROP COLUMN IF EXISTS announcement_id;
