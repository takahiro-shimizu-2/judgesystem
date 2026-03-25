-- migrate:up
ALTER TABLE partners_categories ADD COLUMN category_group TEXT;

-- Add unique constraint to prevent duplicates
ALTER TABLE partners_categories ADD CONSTRAINT uq_partner_category
  UNIQUE (partner_id, category_group, categories);

-- migrate:down
ALTER TABLE partners_categories DROP CONSTRAINT IF EXISTS uq_partner_category;
ALTER TABLE partners_categories DROP COLUMN IF EXISTS category_group;
