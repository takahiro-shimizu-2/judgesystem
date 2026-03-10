# workStatus の DB 永続化 — 現状分析と修正計画

## 1. 現状分析

### 1.1 概要

公告判定システムは、企業×公告(広告)×営業所の単位で判定を行い、結果を `company_bid_judgement` テーブルに保存している。
しかし **「着手しているかどうか (workStatus)」がDBに保存されておらず**、バックエンドAPIではハードコード、フロントエンドではメモリ上のみの管理となっている。

### 1.2 現状のデータフロー

```
[Python判定ツール (main.py)]
  ↓ INSERT/UPDATE
[DB: company_bid_judgement テーブル]  ← work_status カラムが存在しない
  ↓ SELECT
[バックエンド v3 (app_v3/index.ts)]  ← 'not_started' をハードコードで返却
  ↓ GET /api/evaluations
[フロントエンド (evaluations.ts)]     ← updateWorkStatus() はメモリ変更のみ
```

### 1.3 DBスキーマ — company_bid_judgement テーブルの現状

**BigQuery版** (`main.py` L1282-1301):
```sql
CREATE TABLE company_bid_judgement (
    evaluation_no STRING,
    announcement_no INT64,
    company_no INT64,
    office_no INT64,
    requirement_ineligibility BOOL,
    requirement_grade_item BOOL,
    requirement_location BOOL,
    requirement_experience BOOL,
    requirement_technician BOOL,
    requirement_other BOOL,
    deficit_requirement_message STRING,
    final_status BOOL,
    message STRING,
    remarks STRING,
    createdDate STRING,
    updatedDate STRING
    -- ★ work_status, current_step が存在しない
)
```

**SQLite版** (`main.py` L2658-2678): 同様の構造で `work_status` カラムなし。

### 1.4 バックエンドAPI — workStatus のハードコード

**v2** (`app_v2/index.ts` L260-261):
```sql
'not_started' AS workStatus,   -- ハードコード
'judgement' AS currentStep,    -- ハードコード
```

**v3** (`app_v3/index.ts` L119):
```typescript
const query = `select * from ${prefix}backend_evaluations`;
// backend_evaluations ビューの中で workStatus がどう定義されているかは
// BigQuery上のビュー定義に依存（コード内に定義なし）
```

**テスト用バックエンド** (`app_backend_for_test/app/index.ts` L226-227): 同様にハードコード。

### 1.5 フロントエンド — メモリ上のみの更新

`app_replacement_files_v3/evaluations.ts` L38-45:
```typescript
export const updateWorkStatus = (id: string, workStatus: WorkStatus): boolean => {
  const evaluation = mockBidEvaluations.find((e) => e.id === id);
  if (evaluation) {
    evaluation.workStatus = workStatus;  // メモリ変更のみ。リロードで失われる
    return true;
  }
  return false;
};
```

### 1.6 Python判定ツール — INSERT/UPDATE に work_status なし

- `preupdateCompanyBidJudgement()` (L2720): 企業×公告の全組み合わせを事前INSERTするが、work_status カラムなし
- `updateCompanyBidJudgement()` (L2790): 判定結果を反映するINSERT ... ON CONFLICTだが、work_status カラムなし

### 1.7 問題のまとめ

| 問題 | 影響 |
|------|------|
| DBに `work_status` カラムが存在しない | 着手状態を永続化できない |
| バックエンドが `'not_started'` をハードコード | 常に「未着手」と表示される |
| フロントエンドがメモリのみ更新 | リロードで着手状態が失われる |
| PUT/PATCHエンドポイントが未実装 | フロントからDB更新する手段がない |

---

## 2. 修正計画

### 2.1 workStatus の仕様

| 値 | 意味 |
|----|------|
| `not_started` | 未着手（デフォルト） |
| `in_progress` | 着手中 |
| `completed` | 完了 |

更新方法: **フロントエンドから手動更新** (ユーザー操作でAPIを呼び出してDBに保存)

### 2.2 修正対象ファイル一覧

| # | ファイル | 変更内容 |
|---|---------|---------|
| 1 | `source/bid_announcement_judgement_tools/main.py` (L1282) | BigQuery テーブルに `work_status`, `current_step` カラム追加 |
| 2 | `source/bid_announcement_judgement_tools/main.py` (L2658) | SQLite テーブルに `work_status`, `current_step` カラム追加 |
| 3 | `source/bid_announcement_judgement_tools/main.py` (L2720) | `preupdateCompanyBidJudgement()` にデフォルト値セット |
| 4 | `source/bid_announcement_judgement_tools/main.py` (L2790) | `updateCompanyBidJudgement()` に新カラム追加 |
| 5 | `source/bid_apps/app_backend/app_v3/index.ts` | PATCH エンドポイント追加 |
| 6 | `source/bid_apps/app_frontend/app_replacement_files_v3/evaluations.ts` | `updateWorkStatus()` でAPI呼び出し |
| 7 | BigQuery ビュー `backend_evaluations` | work_status カラムをビューに含める（BigQueryコンソールで手動） |

### 2.3 Step 1: DB スキーマ変更 (main.py)

**BigQuery版** (`createCompanyBidJudgements` L1282):

追加カラム:
```sql
work_status STRING,      -- 'not_started', 'in_progress', 'completed'
current_step STRING      -- 'judgement' など
```

**SQLite版** (`createCompanyBidJudgements` L2658):

追加カラム:
```sql
work_status string DEFAULT 'not_started',
current_step string DEFAULT 'judgement'
```

> **既存テーブルへの適用**: 既にデータが存在する場合は `ALTER TABLE company_bid_judgement ADD COLUMN work_status STRING DEFAULT 'not_started'` で対応

### 2.4 Step 2: INSERT/UPDATE SQL 更新 (main.py)

**`preupdateCompanyBidJudgement()` (L2720)**:
- INSERT カラムリストに `work_status`, `current_step` を追加
- SELECT で `'not_started'`, `'judgement'` をデフォルト値として挿入

変更前 (L2738付近):
```python
updatedDate
)
select
NULL,                    -- evaluation_no
a.announcement_no,
b.company_no,
b.office_no,
NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL
```

変更後:
```python
updatedDate,
work_status,
current_step
)
select
NULL,                    -- evaluation_no
a.announcement_no,
b.company_no,
b.office_no,
NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL,
'not_started',           -- work_status デフォルト
'judgement'              -- current_step デフォルト
```

**`updateCompanyBidJudgement()` (L2790)**:
- INSERT/SELECT に `work_status`, `current_step` を追加
- ※ 判定実行時に既存の work_status を上書きしないよう注意

### 2.5 Step 3: バックエンド v3 — PATCH エンドポイント追加

`app_v3/index.ts` に以下を追加:

```typescript
// JSON ボディパース用ミドルウェア（既存コードになければ追加）
app.use(express.json());

// workStatus 更新エンドポイント
app.patch("/api/evaluations/:id/work-status", async (req, res) => {
  const { id } = req.params;
  const { workStatus } = req.body;

  // バリデーション
  const validStatuses = ['not_started', 'in_progress', 'completed'];
  if (!validStatuses.includes(workStatus)) {
    return res.status(400).json({ error: "Invalid workStatus value" });
  }

  const prefix = "PROJECT_ID.DATASET_NAME.";
  const query = `
    UPDATE ${prefix}company_bid_judgement
    SET work_status = @workStatus,
        updatedDate = CURRENT_TIMESTAMP()
    WHERE evaluation_no = @id
  `;

  try {
    const options = {
      query,
      params: { workStatus, id },
    };
    await bigquery.query(options);
    res.json({ success: true, workStatus });
  } catch (err) {
    console.error("ERROR in PATCH /api/evaluations/:id/work-status:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});
```

### 2.6 Step 4: フロントエンド更新

`app_replacement_files_v3/evaluations.ts` の `updateWorkStatus()` を修正:

変更前:
```typescript
export const updateWorkStatus = (id: string, workStatus: WorkStatus): boolean => {
  const evaluation = mockBidEvaluations.find((e) => e.id === id);
  if (evaluation) {
    evaluation.workStatus = workStatus;
    return true;
  }
  return false;
};
```

変更後:
```typescript
export const updateWorkStatus = async (id: string, workStatus: WorkStatus): Promise<boolean> => {
  try {
    const res = await fetch(`/api/evaluations/${id}/work-status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workStatus })
    });
    if (res.ok) {
      // メモリ上のデータも同期
      const evaluation = mockBidEvaluations.find((e) => e.id === id);
      if (evaluation) evaluation.workStatus = workStatus;
      return true;
    }
    return false;
  } catch (err) {
    console.error("Failed to update work status:", err);
    return false;
  }
};
```

> **注意**: 戻り値が `boolean` → `Promise<boolean>` に変わるため、呼び出し側で `await` の追加が必要

### 2.7 Step 5: BigQuery ビュー更新

v3 バックエンドは `select * from ${prefix}backend_evaluations` を使用しており、ビュー定義はBigQuery上にある。

`company_bid_judgement` テーブルにカラム追加後、`backend_evaluations` ビューに `work_status` と `current_step` を含めるよう更新が必要。

```sql
-- BigQuery コンソールまたは bq コマンドで実行
CREATE OR REPLACE VIEW `PROJECT_ID.DATASET_NAME.backend_evaluations` AS
SELECT
  ...既存カラム...,
  COALESCE(cbj.work_status, 'not_started') AS workStatus,
  COALESCE(cbj.current_step, 'judgement') AS currentStep,
  ...
FROM ...
```

---

## 3. 修正後のデータフロー

```
[ユーザーが画面で「着手」ボタンを押す]
  ↓ PATCH /api/evaluations/:id/work-status
[バックエンド v3]
  ↓ UPDATE work_status
[DB: company_bid_judgement テーブル]  ← work_status が永続化される
  ↓ SELECT (via backend_evaluations ビュー)
[バックエンド v3 GET /api/evaluations]
  ↓ レスポンスに workStatus を含む
[フロントエンド]  ← リロードしても状態が維持される
```

---

## 4. 検証方法

1. **SQLite ローカルテスト**: main.py を実行し、`company_bid_judgement` テーブルに `work_status` カラムが存在することを確認
2. **API テスト**: `curl -X PATCH http://localhost:8080/api/evaluations/1/work-status -H 'Content-Type: application/json' -d '{"workStatus":"in_progress"}'` で 200 が返ることを確認
3. **読み込みテスト**: `curl http://localhost:8080/api/evaluations` で返却される workStatus が `in_progress` になっていることを確認
4. **フロントエンドテスト**: 画面上で着手ボタンを押し、ページリロード後も状態が維持されることを確認

---

## 5. 注意事項

- **既存データへの影響**: 既存レコードには `work_status` が NULL になるため、SELECT 時に `COALESCE(work_status, 'not_started')` でデフォルト値を適用する
- **判定ツールとの共存**: Python判定ツール (`main.py`) の `updateCompanyBidJudgement()` が work_status を上書きしないよう、INSERT ... ON CONFLICT で work_status を EXCLUDED から取らないよう設計する
- **BigQuery の UPDATE 制限**: BigQuery の DML (UPDATE) は1日あたりのクォータがあるため、大量更新時は注意
