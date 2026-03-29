-- migrate:up

ALTER TABLE office_master
  ALTER COLUMN created_date TYPE TEXT USING created_date::TEXT,
  ALTER COLUMN updated_date TYPE TEXT USING updated_date::TEXT;

-- migrate:down

ALTER TABLE office_master
  ALTER COLUMN created_date TYPE DOUBLE PRECISION USING
    CASE
      WHEN trim(created_date) ~ '^[0-9]+(\\.[0-9]+)?$' THEN created_date::DOUBLE PRECISION
      ELSE NULL
    END,
  ALTER COLUMN updated_date TYPE DOUBLE PRECISION USING
    CASE
      WHEN trim(updated_date) ~ '^[0-9]+(\\.[0-9]+)?$' THEN updated_date::DOUBLE PRECISION
      ELSE NULL
    END;
