-- migrate:up

ALTER TABLE announcements_documents_master
  ADD COLUMN IF NOT EXISTS announcement_id INTEGER;

UPDATE announcements_documents_master
  SET announcement_id = announcement_no
  WHERE announcement_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_announcements_documents_master_announcement_id
  ON announcements_documents_master (announcement_id);

-- migrate:down

DROP INDEX IF EXISTS idx_announcements_documents_master_announcement_id;
ALTER TABLE announcements_documents_master
  DROP COLUMN IF EXISTS announcement_id;
