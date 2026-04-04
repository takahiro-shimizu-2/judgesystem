-- migrate:up

-- Back up the original DOUBLE PRECISION values before type conversion
-- so that rollback can restore them without data loss.
CREATE TABLE IF NOT EXISTS _backup_office_master_dates AS
  SELECT office_no, company_no, created_date, updated_date
  FROM office_master;

ALTER TABLE office_master
  ALTER COLUMN created_date TYPE TEXT USING created_date::TEXT,
  ALTER COLUMN updated_date TYPE TEXT USING updated_date::TEXT;

-- migrate:down

-- Restore original numeric values from the backup table where possible,
-- falling back to CASE conversion only for rows that have no backup.
UPDATE office_master AS om
  SET created_date = b.created_date::TEXT,
      updated_date = b.updated_date::TEXT
  FROM _backup_office_master_dates AS b
  WHERE om.office_no IS NOT DISTINCT FROM b.office_no
    AND om.company_no IS NOT DISTINCT FROM b.company_no;

ALTER TABLE office_master
  ALTER COLUMN created_date TYPE DOUBLE PRECISION USING
    CASE
      WHEN created_date IS NOT NULL AND trim(created_date) ~ '^[0-9]+(\\.[0-9]+)?$'
        THEN created_date::DOUBLE PRECISION
      ELSE NULL
    END,
  ALTER COLUMN updated_date TYPE DOUBLE PRECISION USING
    CASE
      WHEN updated_date IS NOT NULL AND trim(updated_date) ~ '^[0-9]+(\\.[0-9]+)?$'
        THEN updated_date::DOUBLE PRECISION
      ELSE NULL
    END;

DROP TABLE IF EXISTS _backup_office_master_dates;
