-- migrate:up

-- =============================================================================
-- Issue #191: パフォーマンスインデックス追加 + 入札要件テキスト全文検索
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. company_bid_judgement — 判定結果テーブル
--    JOINで (announcement_no, company_no, office_no) が頻繁に使われる
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_cbj_announcement_company_office
  ON company_bid_judgement (announcement_no, company_no, office_no);

CREATE INDEX IF NOT EXISTS idx_cbj_announcement_no
  ON company_bid_judgement (announcement_no);

-- -----------------------------------------------------------------------------
-- 2. office_master — office_no でのJOIN用
--    既存: idx_office_master_company_no (company_no)
--    不足: office_no 単体のインデックス
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_office_master_office_no
  ON office_master (office_no);

-- -----------------------------------------------------------------------------
-- 3. bid_requirements — announcement_no でのフィルタ用
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_bid_requirements_announcement_no
  ON bid_requirements (announcement_no);

-- -----------------------------------------------------------------------------
-- 4. bid_requirements — requirement_text 全文検索 (pg_bigm)
--    pg_bigm: Cloud SQL 公式対応、日本語 2-gram インデックス
-- -----------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pg_bigm;

CREATE INDEX IF NOT EXISTS idx_bid_requirements_text_bigm
  ON bid_requirements USING gin (requirement_text gin_bigm_ops);

-- -----------------------------------------------------------------------------
-- 5. sufficient_requirements / insufficient_requirements — ルックアップ高速化
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_sufficient_req_eval_ann
  ON sufficient_requirements (evaluation_no, announcement_no);

CREATE INDEX IF NOT EXISTS idx_sufficient_req_company_office
  ON sufficient_requirements (company_no, office_no);

CREATE INDEX IF NOT EXISTS idx_insufficient_req_eval_ann
  ON insufficient_requirements (evaluation_no, announcement_no);

CREATE INDEX IF NOT EXISTS idx_insufficient_req_company_office
  ON insufficient_requirements (company_no, office_no);

-- -----------------------------------------------------------------------------
-- 6. announcements_documents_master — announcement_no でのJOIN用
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_docs_master_announcement_no
  ON announcements_documents_master (announcement_no);

-- =============================================================================
-- migrate:down
-- =============================================================================

DROP INDEX IF EXISTS idx_docs_master_announcement_no;
DROP INDEX IF EXISTS idx_insufficient_req_company_office;
DROP INDEX IF EXISTS idx_insufficient_req_eval_ann;
DROP INDEX IF EXISTS idx_sufficient_req_company_office;
DROP INDEX IF EXISTS idx_sufficient_req_eval_ann;
DROP INDEX IF EXISTS idx_bid_requirements_text_bigm;
DROP EXTENSION IF EXISTS pg_bigm;
DROP INDEX IF EXISTS idx_bid_requirements_announcement_no;
DROP INDEX IF EXISTS idx_office_master_office_no;
DROP INDEX IF EXISTS idx_cbj_announcement_no;
DROP INDEX IF EXISTS idx_cbj_announcement_company_office;
