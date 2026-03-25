-- ============================================================
-- Migration: Add CRUD support columns
-- Issue #40: 全マスターデータのCRUD機能完備
-- ============================================================

-- agency_master: phone, fax, email, is_active 列追加
ALTER TABLE agency_master ADD COLUMN IF NOT EXISTS phone TEXT DEFAULT '';
ALTER TABLE agency_master ADD COLUMN IF NOT EXISTS fax TEXT DEFAULT '';
ALTER TABLE agency_master ADD COLUMN IF NOT EXISTS email TEXT DEFAULT '';
ALTER TABLE agency_master ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;

-- partners_master: is_active 列追加
ALTER TABLE partners_master ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;

-- company_master: is_active 列追加
ALTER TABLE company_master ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;
