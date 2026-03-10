# 公告判定システム アーキテクチャ改善提案書

## 1. 前提条件

### データボリューム

| 項目 | 月間 | 年間 |
|---|---|---|
| 公告件数 | 1,000,000 | 12,000,000 |
| 要件レコード (公告×16要件) | 16,000,000 | 192,000,000 |
| 判定レコード (公告×1,000企業) | 1,000,000,000 | 12,000,000,000 |
| 要件別判定レコード (判定×16要件) | 16,000,000,000 | 192,000,000,000 |

### 処理時間帯

- 公告は夜間に発生しない
- 稼働時間: 12時間/日 × 30日 = 360時間/月

### 処理スループット要件

| 処理 | 必要スループット |
|---|---|
| 公告取り込み | ~2,800件/時 |
| 判定処理 (公告×企業) | ~2,800,000件/時 (~780件/秒) |
| 要件チェック (判定×要件) | ~44,000,000件/時 (~12,000件/秒) |

---

## 2. 現状の課題

### 2-1. Web配信にBigQueryを直接使用している

BigQueryはOLAP（分析ワークロード）向けであり、Webアプリのバックエンドとして以下の問題がある。

| 観点 | BigQuery | RDB (PostgreSQL等) |
|---|---|---|
| レイテンシ | 最速でも数百ms、コールドスタート数秒 | ms単位 |
| 同時接続 | デフォルト100クエリ制限 | 数百接続可能 |
| コスト | スキャン量課金（小クエリでも最低10MB分） | 固定費ベース |
| JOIN | 苦手（分散処理前提） | 得意 |
| 用途 | TB〜PB級の分析・バッチ処理 | トランザクション処理・Web配信 |

### 2-2. SELECT * による全カラム取得

現在の本番バックエンド（app_v3）は全エンドポイントで `SELECT *` を使用。

```sql
-- 現状（5エンドポイント全てこのパターン）
select * from backend_announcements
select * from backend_evaluations
select * from backend_companies
select * from backend_orderers
select * from backend_partners
```

問題点:
- BigQueryのスキャン量課金が不必要に膨らむ（カラムナーストレージのため、カラム数が直接コストに比例）
- フロントで使わないカラム（created_at, updated_at等の内部情報）がAPIレスポンスに露出
- DBスキーマ変更時に意図しないカラムがフロントに漏れるリスク

---

## 3. 提案アーキテクチャ

### 全体構成図

```
┌──────────────────────────────────────────────────────────┐
│                    データ取り込み層                          │
│  公告PDF → Cloud Run Jobs (OCR/Gemini)                    │
│  → 要件抽出 → Pub/Sub へ発行                               │
└────────────────────┬─────────────────────────────────────┘
                     ▼
┌──────────────────────────────────────────────────────────┐
│                    判定処理層 (バッチ)                       │
│  Pub/Sub → Cloud Run Jobs (並列ワーカー)                   │
│                                                            │
│  ルールベース判定:                                          │
│    等級要件 / 所在地要件 / 欠格要件 → SQLバッチで即判定       │
│  LLM判定:                                                  │
│    実績要件 / 技術者要件 → 曖昧な要件のみGeminiに投げる      │
│                                                            │
│  → 結果をBigQueryに書き込み                                 │
└────────────────────┬─────────────────────────────────────┘
                     ▼
┌──────────────────────────────────────────────────────────┐
│                    ストレージ層 (CQRS構成)                   │
│                                                            │
│  ┌──────────────┐     定期同期      ┌────────────────┐   │
│  │  BigQuery     │ ──────────────→  │  Cloud SQL      │   │
│  │  (書き込み用)  │   日次 or        │  (PostgreSQL)    │   │
│  │               │   判定完了時       │  (読み取り用)     │   │
│  │  全量保存      │                  │  直近1-3ヶ月分    │   │
│  │  分析・バッチ用 │                  │  インデックス最適化│   │
│  │  192B行/年     │                  │  月別パーティション │   │
│  └──────────────┘                  └───────┬────────┘   │
│                                             │              │
│                                     ┌───────┴────────┐   │
│                                     │  Redis          │   │
│                                     │  ダッシュボード集計 │   │
│                                     │  ホットデータ     │   │
│                                     │  ページネーション  │   │
│                                     └────────────────┘   │
└──────────────────────────────────────────────────────────┘
                     ▼
┌──────────────────────────────────────────────────────────┐
│                    API / Web配信層                          │
│  Cloud Run (Express/TypeScript)                            │
│  → PostgreSQL から読み取り (ms単位で応答)                    │
│  → 各エンドポイントで必要カラムだけSELECT                    │
└──────────────────────────────────────────────────────────┘
```

### 3-1. 判定処理層: BigQuery維持

月10億件の判定レコード書き込み・分析はBigQueryの得意領域であり、維持が妥当。

- ルールベース判定（等級/所在地/欠格）はSQLバッチで全企業×全公告を一括処理可能
- LLM判定が必要な要件（実績/技術者）のみGeminiに投げることでコストを制御
- 全量データの分析・集計クエリはBigQueryの本領

### 3-2. Web配信層: PostgreSQL (Cloud SQL) を追加

フロントエンドへのデータ配信にはOLTPデータベースを使用する。

**導入理由:**
- ms単位のレスポンス（BigQueryの数百ms〜数秒と比較）
- インデックスによる高速な検索・フィルタリング
- 同時接続数の制約が緩い

**データ管理方針:**
- BigQueryから直近1〜3ヶ月分のデータを同期
- 月別パーティショニングで古いデータを自動アーカイブ
- 同期タイミング: 日次バッチ or 判定完了トリガー

### 3-3. キャッシュ層: Redis

- ダッシュボードの集計値（判定ステータス別件数等）をキャッシュ
- 公告一覧のページネーション結果をキャッシュ
- TTL設定で自動的に新鮮なデータに更新

---

## 4. APIレスポンス設計

### 方針

- 各エンドポイントはフロントの画面で表示するカラムだけを返す
- `SELECT *` は禁止、必要カラムを明示的に指定する
- バックエンドで行→ネスト構造への変換を行う

### 4-1. GET /api/announcements

フロントで使用するフィールド:

```sql
SELECT
  id,
  no,
  ordererId,
  title,
  category,
  organization,
  workLocation,
  department_postalcode,
  department_address,
  department_name,
  department_contactPerson,
  department_phone,
  department_fax,
  department_email,
  publishDate,
  explanationStartDate,
  explanationEndDate,
  applicationStartDate,
  applicationEndDate,
  bidStartDate,
  bidEndDate,
  deadline,
  estimatedAmountMin,
  estimatedAmountMax,
  status,
  actualAmount,
  winningCompanyId,
  winningCompanyName
FROM backend_announcements
```

レスポンス構造:
```json
{
  "id": "ann-1",
  "no": 1,
  "ordererId": 1,
  "title": "...",
  "category": "土木工事",
  "organization": "...",
  "workLocation": "...",
  "department": {
    "postalCode": "...",
    "address": "...",
    "name": "...",
    "contactPerson": "...",
    "phone": "...",
    "fax": "...",
    "email": "..."
  },
  "publishDate": "...",
  "explanationStartDate": "...",
  "explanationEndDate": "...",
  "applicationStartDate": "...",
  "applicationEndDate": "...",
  "bidStartDate": "...",
  "bidEndDate": "...",
  "deadline": "...",
  "estimatedAmountMin": 10000,
  "estimatedAmountMax": 20000,
  "status": "closed",
  "actualAmount": 15000,
  "winningCompanyId": 1,
  "winningCompanyName": "..."
}
```

### 4-2. GET /api/evaluations

フロントで使用するフィールド:

```sql
SELECT
  id,
  evaluationNo,
  announcement_id,
  announcement_ordererId,
  announcement_title,
  announcement_category,
  announcement_organization,
  announcement_workLocation,
  announcement_department,
  announcement_publishDate,
  announcement_explanationStartDate,
  announcement_explanationEndDate,
  announcement_applicationStartDate,
  announcement_applicationEndDate,
  announcement_bidStartDate,
  announcement_bidEndDate,
  announcement_deadline,
  announcement_estimatedAmountMin,
  announcement_estimatedAmountMax,
  announcement_pdfUrl,
  company_id,
  company_name,
  company_address,
  company_grade,
  company_priority,
  branch_id,
  branch_name,
  branch_address,
  requirements_id,
  requirements_category,
  requirements_name,
  requirements_isMet,
  requirements_reason,
  requirements_evidence,
  status,
  workStatus,
  currentStep,
  evaluatedAt
FROM backend_evaluations
```

レスポンス構造:
```json
{
  "id": "1",
  "evaluationNo": "00000001",
  "announcement": {
    "id": "ann-1",
    "title": "...",
    "category": "...",
    "organization": "...",
    "workLocation": "...",
    "department": "...",
    "publishDate": "...",
    "explanationStartDate": "...",
    "explanationEndDate": "...",
    "applicationStartDate": "...",
    "applicationEndDate": "...",
    "bidStartDate": "...",
    "bidEndDate": "...",
    "deadline": "...",
    "estimatedAmountMin": 10000,
    "estimatedAmountMax": 20000,
    "pdfUrl": "..."
  },
  "company": {
    "id": "com-1",
    "name": "...",
    "address": "...",
    "grade": "A",
    "priority": 1
  },
  "branch": {
    "id": "brn-1",
    "name": "...",
    "address": "..."
  },
  "requirements": [
    {
      "id": "req-1",
      "category": "...",
      "name": "...",
      "isMet": true,
      "reason": "...",
      "evidence": "..."
    }
  ],
  "status": "all_met",
  "workStatus": "not_started",
  "currentStep": "judgement",
  "evaluatedAt": "..."
}
```

### 4-3. GET /api/companies

フロントで使用するフィールド:

```sql
SELECT
  id,
  no,
  name,
  address,
  grade,
  priority,
  phone,
  email,
  representative,
  established,
  capital,
  employeeCount,
  branches_name,
  branches_address,
  certifications
FROM backend_companies
```

レスポンス構造:
```json
{
  "id": "com-1",
  "no": 1,
  "name": "...",
  "address": "...",
  "grade": "A",
  "priority": 1,
  "phone": "...",
  "email": "...",
  "representative": "...",
  "established": "...",
  "capital": 100000000,
  "employeeCount": 100,
  "branches": [
    { "name": "...", "address": "..." }
  ],
  "certifications": ["..."]
}
```

### 4-4. GET /api/orderers

フロントで使用するフィールド:

```sql
SELECT
  id,
  no,
  name,
  category,
  address,
  phone,
  fax,
  email,
  departments,
  announcementCount,
  awardCount,
  averageAmount,
  lastAnnouncementDate
FROM backend_orderers
```

レスポンス構造:
```json
{
  "id": "ord-1",
  "no": 1,
  "name": "...",
  "category": "national",
  "address": "...",
  "phone": "...",
  "fax": "...",
  "email": "...",
  "departments": ["..."],
  "announcementCount": 10,
  "awardCount": 5,
  "averageAmount": 100000000,
  "lastAnnouncementDate": "..."
}
```

### 4-5. GET /api/partners

フロントで使用するフィールド:

```sql
SELECT
  id,
  no,
  name,
  postalCode,
  address,
  phone,
  fax,
  email,
  url,
  surveyCount,
  rating,
  resultCount,
  categories,
  pastProjects_announcementId,
  pastProjects_announcementTitle,
  pastProjects_ordererName,
  pastProjects_status,
  pastProjects_date,
  representative,
  established,
  capital,
  employeeCount,
  branches_name,
  branches_address,
  qualifications_qualificationitem_category,
  qualifications_qualificationitem_grade,
  qualifications_qualificationitem_validUntil,
  qualifications_OrdererQualification_ordererName,
  qualifications_OrdererQualification_items_category,
  qualifications_OrdererQualification_items_grade,
  qualifications_OrdererQualification_items_validUntil
FROM backend_partners
```

レスポンス構造:
```json
{
  "id": "ptn-1",
  "no": 1,
  "name": "...",
  "postalCode": "...",
  "address": "...",
  "phone": "...",
  "fax": "...",
  "email": "...",
  "url": "...",
  "surveyCount": 10,
  "rating": 4,
  "resultCount": 5,
  "representative": "...",
  "established": "...",
  "capital": 100000000,
  "employeeCount": 50,
  "categories": ["..."],
  "pastProjects": [
    {
      "announcementId": 1,
      "announcementTitle": "...",
      "ordererName": "...",
      "status": "...",
      "date": "..."
    }
  ],
  "branches": [
    { "name": "...", "address": "..." }
  ],
  "qualifications": {
    "unified": [
      { "category": "...", "grade": "A", "validUntil": "..." }
    ],
    "orderers": [
      {
        "ordererName": "...",
        "items": [
          { "category": "...", "grade": "A", "validUntil": "..." }
        ]
      }
    ]
  }
}
```

---

## 5. 実施ステップ

### Phase 1: SELECT * の解消（即時対応可能）

- app_v3/index.ts の各エンドポイントで `SELECT *` を必要カラムだけの `SELECT` に変更
- テスト用バックエンド（app_backend_for_test）の定義に合わせたカラム指定
- ストリーミングレスポンスにおける行→ネスト構造変換の追加
- **影響範囲:** バックエンド1ファイルのみ
- **効果:** BigQueryスキャンコスト削減、不要データの露出防止

### Phase 2: PostgreSQL (Cloud SQL) の導入

- Cloud SQL for PostgreSQL インスタンスの構築
- Web配信用テーブル設計（月別パーティション）
- BigQuery → PostgreSQL の同期ジョブ作成
- バックエンドの接続先をBigQuery → PostgreSQLに変更
- **影響範囲:** インフラ追加、バックエンドのDB接続部分

### Phase 3: Redis キャッシュの導入

- Memorystore for Redis インスタンスの構築
- ダッシュボード集計値のキャッシュ実装
- ページネーション結果のキャッシュ実装
- **影響範囲:** バックエンドにキャッシュ層追加

### Phase 4: 判定処理のスケーリング

- Pub/Sub による公告取り込みのイベント駆動化
- Cloud Run Jobs による判定処理の並列化
- ルールベース判定とLLM判定の分離
- **影響範囲:** Python処理側の大幅リアーキテクチャ
