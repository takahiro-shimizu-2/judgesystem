# DB Access Patterns: Engine vs Backend

Issue #120 対応 -- Engine (Python) と Backend (TypeScript/Express) が同一 PostgreSQL データベースを独立に直接操作している現状を整理し、競合リスクと改善方向を記す。

## 1. 概要

本システムでは **Engine** と **Backend** が同じ PostgreSQL インスタンスの同じスキーマに対して直接接続している。同期メカニズム（API 経由の呼び出し、メッセージキュー、イベント通知など）は存在しない。

- **Engine** (`packages/engine/repository/postgres.py`): psycopg2 + SQLAlchemy で直接接続。autocommit モード。
- **Backend** (`packages/backend/src/repositories/`): pg Pool で直接接続。

## 2. テーブルごとのアクセスマトリクス

凡例: **R** = READ, **W** = WRITE (INSERT/UPDATE), **C** = CREATE TABLE, **D** = DROP TABLE

### 2.1 共有テーブル（Engine/Backend 双方がアクセス）

| テーブル名 | Engine | Backend | 競合リスク |
|---|---|---|---|
| `bid_announcements` | R/W/C | R | **LOW** -- Engine が WRITE、Backend は READ のみ |
| `bid_requirements` | R/W/C | R | **LOW** -- Engine が WRITE、Backend は READ のみ |
| `bid_announcements_dates` | R/W/C | R | **LOW** -- Engine が WRITE、Backend は READ のみ |
| `company_bid_judgement` | R/W/C | R | **LOW** -- Engine が WRITE、Backend は READ のみ |
| `sufficient_requirements` | R/W/C | R | **LOW** -- Engine が WRITE、Backend は READ のみ |
| `insufficient_requirements` | R/W/C | R | **LOW** -- Engine が WRITE、Backend は READ のみ |
| `office_master` | W/C (replace) | R | **MEDIUM** -- Engine が `uploadDataToTable` で REPLACE するため、Backend 読み取り中にテーブルが一時的に消える可能性 |
| `company_master` | - | R/W/C | **LOW** -- Backend のみ WRITE |
| `announcements_documents_master` | W/C | R | **LOW** -- Engine が WRITE、Backend は READ のみ |
| `announcements_competing_companies_master` | - | R | **LOW** -- Backend は READ のみ |
| `announcements_competing_company_bids_master` | - | R | **LOW** -- Backend は READ のみ |
| `announcements_estimated_amounts` | - | R | **LOW** -- Backend は READ のみ |
| `source_pages` | R/W/C | - | **LOW** -- Engine のみ |

### 2.2 Backend 専用テーブル

| テーブル名 | Backend 操作 | 備考 |
|---|---|---|
| `agency_master` (orderers) | R/W | 発注者マスタ。Backend が CRUD 管理 |
| `workflow_contacts` | R/W/C | Engine が CREATE TABLE 定義を持つが、Backend が CRUD 管理 |
| `evaluation_assignees` | R/W/C | Engine が CREATE TABLE 定義を持つが、Backend が CRUD 管理 |
| `backend_evaluation_statuses` | R/W/C | Engine が CREATE TABLE 定義を持つが、Backend が UPSERT 管理 |
| `partners_master` | R/W | パートナーマスタ |
| `partners_categories` | R/W | パートナーカテゴリ |
| `partners_past_projects` | R | 過去実績 |
| `partners_branches` | R/W | パートナー拠点 |
| `partners_qualifications_unified` | R | 資格情報（統合） |
| `partners_qualifications_orderers` | R | 資格情報（発注者別） |
| `partners_qualifications_orderer_items` | R | 資格情報（発注者別明細） |
| `evaluation_partner_candidates` | R/W/D | 評価候補パートナー |
| `evaluation_partner_workflow_states` | R/W | パートナーワークフロー状態（JSONB） |
| `evaluation_orderer_workflow_states` | R/W | 発注者ワークフロー状態（JSONB） |
| `evaluation_partner_files` | R/W/D | パートナーファイル（バイナリ格納） |
| `similar_cases_master` | R | 類似案件 |
| `similar_cases_competitors` | R | 類似案件競合 |

### 2.3 Engine 専用テーブル

| テーブル名 | Engine 操作 | 備考 |
|---|---|---|
| `bid_announcements_pre` | R/W/C/D | OCR 前処理用の一時テーブル |
| `source_pages` | R/W/C | ページソース管理 |
| 各種 `tmp_*` テーブル | W/C/D | 処理中の一時テーブル（処理後 DROP） |

## 3. 競合リスクのあるテーブル

### 3.1 HIGH RISK: `office_master`

- **問題**: Engine の `uploadDataToTable` は `pandas.to_sql(if_exists="replace")` を使用しており、テーブルを DROP してから再作成する。この間、Backend からの READ クエリが失敗する。
- **影響**: `EvaluationRepository`, `CompanyRepository` が JOIN で参照しているため、評価一覧・企業詳細の取得が一時的にエラーになる。
- **緩和策**: Engine 側を `UPSERT` パターンに変更し、テーブル全体の REPLACE を避ける。

### 3.2 MEDIUM RISK: 判定結果テーブル群

対象: `company_bid_judgement`, `sufficient_requirements`, `insufficient_requirements`

- **問題**: Engine が判定結果を INSERT する際に `updatedDate` を Python 側の `datetime.now()` で設定しているが、Backend の `backend_evaluation_statuses` テーブルの `updatedAt` とは独立に管理されている。Backend はこれらのテーブルの `updatedDate` を `evaluatedAt` として表示に使用しているが、2つのタイムスタンプが同期していない。
- **影響**: ワークフロー状態の `updatedAt` と判定結果の `updatedDate` が不一致になり、UI 上でソート結果が直感に反する可能性がある。

### 3.3 LOW RISK: `bid_announcements` および関連テーブル

- **問題**: Engine のみが WRITE するため、直接的な書き込み競合は発生しない。しかし、Backend は `bid_announcements` を基にステータスを動的計算（`bidEndDate` からの CASE 式）しており、Engine が新しい公告を追加するとリアルタイムで Backend の一覧に反映される。
- **影響**: 軽微。ユーザーが一覧をリロードすれば新しいデータが見える。

## 4. タイムスタンプ管理の不統一

### 4.1 Engine 側の `updatedDate` / `createdDate`

Engine は `datetime.now().strftime('%Y-%m-%d %H:%M:%S')` で TEXT 型として設定している。タイムゾーン情報はない。

対象テーブル:
- `bid_announcements`: `createdDate`, `updatedDate` (TEXT)
- `bid_requirements`: `createdDate`, `updatedDate` (TEXT)
- `bid_announcements_dates`: `createdDate`, `updatedDate` (TEXT)
- `company_bid_judgement`: `createdDate`, `updatedDate` (TEXT)
- `sufficient_requirements`: `createdDate`, `updatedDate` (TEXT)
- `insufficient_requirements`: `createdDate`, `updatedDate` (TEXT)

### 4.2 Backend 側の `updated_at` / `created_at`

Backend は SQL の `NOW()` (TIMESTAMPTZ) を使用。

対象テーブル:
- `backend_evaluation_statuses`: `createdAt`, `updatedAt` (TIMESTAMPTZ)
- `workflow_contacts`: `created_at`, `updated_at` (TIMESTAMPTZ)
- `evaluation_assignees`: `assigned_at` (TIMESTAMPTZ)
- `agency_master`: `created_at`, `updated_at` (TIMESTAMPTZ)

### 4.3 Engine で CREATE だが Backend が WRITE するテーブル

Engine が DDL を持ちつつ Backend が CRUD するテーブルがあり、責任の所在が曖昧:
- `workflow_contacts`: Engine が `createWorkflowContacts` で DDL 定義、Backend が CRUD
- `evaluation_assignees`: Engine が `createEvaluationAssignees` で DDL 定義、Backend が CRUD
- `backend_evaluation_statuses`: Engine が `ensureBackendEvaluationStatusesTable` で DDL 定義、Backend が UPSERT

## 5. 推奨される改善方向

### 短期（即時対応可能）

1. **Engine の書き込み時に `updatedDate` を明示的に NOW() で設定する**
   - 現状: Python 側の `datetime.now()` で TEXT 文字列を生成しているため、Engine サーバーとDB サーバーの時計が異なる場合にずれが生じる。
   - 改善: `uploadDataToTable` での一括書き込み以外の INSERT/UPDATE SQL で、DB 側の `NOW()` を使用する。または、Python 側でも UTC のタイムスタンプを設定する。

2. **`office_master` の REPLACE パターンを UPSERT に変更する**
   - `uploadDataToTable(if_exists="replace")` はテーブル全体を DROP & CREATE するため危険。
   - 一時テーブル + `INSERT ... ON CONFLICT DO UPDATE` パターンに変更すべき。

### 中期（設計改善）

3. **DB スキーマの統一**
   - タイムスタンプカラムを全テーブルで `TIMESTAMPTZ` に統一。
   - `createdDate`/`updatedDate` (TEXT) を `created_at`/`updated_at` (TIMESTAMPTZ) に移行。
   - マイグレーションで段階的に実施。

4. **DDL の一元管理**
   - 現在は Engine (`createBidAnnouncements` 等) と DB マイグレーション (`db/migrations/`) の両方に DDL が散在。
   - 全テーブルの DDL を `db/migrations/` に集約し、Engine からは DDL を削除する。

### 長期（アーキテクチャ改善）

5. **API 経由でのアクセス統一**
   - Engine が直接 DB を操作するのではなく、Backend API 経由でデータを読み書きする。
   - これにより、バリデーション、認証、監査ログ、楽観的ロックなどを一元管理できる。
   - ただし、Engine のバッチ処理で大量データを扱う場合のパフォーマンス考慮が必要。

6. **イベント通知の導入**
   - Engine が判定結果を書き込んだ後に、Backend に通知する仕組み（PostgreSQL LISTEN/NOTIFY、メッセージキュー等）。
   - Backend はリアルタイムで UI に反映可能になる。

7. **書き込み責任の明確化**
   - 各テーブルに対して「オーナー」（書き込み責任者）を1つだけ定める。
   - オーナー以外は READ のみ許可する（DB レベルの権限設定で強制）。

## 6. 関連ファイル

- Engine DB 操作: `packages/engine/repository/postgres.py`
- Engine DB 基底: `packages/engine/repository/base.py`
- Engine 判定処理: `packages/engine/domain/judgement.py`
- Engine OCR 処理: `packages/engine/domain/ocr_processing.py`
- Engine ドキュメント処理: `packages/engine/domain/document_pipeline.py`
- Engine マスタ処理: `packages/engine/domain/master.py`
- Backend DB 設定: `packages/backend/src/config/database.ts`
- Backend リポジトリ: `packages/backend/src/repositories/`
- DB マイグレーション: `db/migrations/`
