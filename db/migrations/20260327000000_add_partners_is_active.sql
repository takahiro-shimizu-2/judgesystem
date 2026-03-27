-- migrate:up

-- partners_master テーブルに is_active カラムを追加
-- 本番DBからリストアした古いテーブル構造に対応するため
ALTER TABLE partners_master ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;

-- migrate:down

ALTER TABLE partners_master DROP COLUMN IF EXISTS is_active;
