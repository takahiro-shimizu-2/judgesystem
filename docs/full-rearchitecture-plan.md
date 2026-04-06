# judgesystem フルリアーキテクチャ計画

**作成日**: 2026-03-24
**ステータス**: 完了（2026-03-24実行）
**ブランチ**: `feat/judgesystem-cleanup`

---

## 背景

ディレクトリが7階層深く、開発者が構造を理解できない。DB変種削除後の`postgres/`残存、重複ファイル散在、型/定数未共有、Pythonエンジン孤立、God Object放置。

## 新ディレクトリ構成

```
judgesystem/
├── packages/
│   ├── shared/              ← NEW: 型・定数共有パッケージ
│   │   └── src/types/, constants/
│   ├── backend/             ← was: source/bid_apps/postgres/backend/app/
│   │   ├── Dockerfile
│   │   ├── index.ts
│   │   └── src/
│   ├── frontend/            ← was: source/bid_apps/postgres/frontend/app/
│   │   ├── Dockerfile
│   │   ├── nginx.conf
│   │   └── src/
│   └── engine/              ← was: source/bid_announcement_judgement_tools/
│       ├── Dockerfile       ← NEW
│       ├── requirements.txt
│       ├── domain/          ← bid_judgement.py → 5モジュールに分割
│       └── repository/      ← db_operator.py → 4ファイルに分割
├── data/master/             ← 変更なし（Pythonランタイムデータ）
├── db/                      ← NEW: マイグレーション
│   ├── migrations/
│   └── migrate.sh
├── deploy/                  ← docker-compose統合
│   └── docker-compose.yml
├── docs/
├── scripts/
├── .github/workflows/
└── package.json             ← npm workspaces root
```

**深さ比較:**

| 対象 | Before (階層) | After (階層) |
|------|:---:|:---:|
| Backend controller | 7 | 4 |
| Frontend component | 7 | 4 |
| Python domain | 3 | 3 |
| docker-compose | 3 | 1 |

---

## 実行フェーズ（7段階）

### Phase 1: ディレクトリ移動（git mv）

- `source/bid_apps/postgres/backend/app/*` → `packages/backend/`
- `source/bid_apps/postgres/frontend/app/*` → `packages/frontend/`
- `source/bid_announcement_judgement_tools/*` → `packages/engine/`
- `source/bid_apps/postgres/docker-compose.yml` → `deploy/`
- `source/check_html/` 削除（孤立実験コード）
- `Dockerfile_nginx`, `Dockerfile_vite_preview` 削除（重複・未使用）

### Phase 2: 参照パス修正

- Backend/Frontend Dockerfile: `COPY app/...` → `COPY ...`（app/層がなくなる）
- `deploy/docker-compose.yml`: build context更新
- `.github/workflows/ci.yml`: working-directory 8箇所更新
- Python: `PROJECT_ROOT`パス計算の検証・修正

### Phase 3: 共有パッケージ作成

- `packages/shared/` 新規作成
- Frontend `types/`（175+行）からドメイン型を抽出→shared
- Backend `types/`（33行）の`FilterParams`等→shared
- `TABLES`定数、ステータス文字列→shared
- UI専用定数（MUIアイコン、スタイル）はFrontendに残す
- root `package.json`をnpm workspaces化

### Phase 4: Pythonエンジン統合

- `packages/engine/Dockerfile` 新規作成（Python 3.12-slim）
- `data/master/`パスを設定可能に（`Master.__init__`に`data_dir`パラメータ）
- `deploy/docker-compose.yml`にengineサービス追加

### Phase 5: DBマイグレーション

- `db/migrations/001_initial_schema.sql` — `DBOperatorPOSTGRES`のCREATE TABLE抽出
- `db/migrations/002_indexes.sql` — 既存indexes.sql移動
- `db/migrate.sh` — 軽量マイグレーションランナー

### Phase 6: God Object分割

**bid_judgement.py (3,855行) → 5モジュール:**

| モジュール | 内容 | 推定行数 |
|-----------|------|:---:|
| `master.py` | Masterクラス（データローダー） | 150 |
| `document_pipeline.py` | step0: HTML取得・PDF・OCR | 1,200 |
| `gemini_client.py` | Gemini AI統合 | 500 |
| `data_transform.py` | JSON変換・日付パース | 300 |
| `judgment.py` | step3: 適格性判定コア | 200 |

**db_operator.py (2,838行) → 4ファイル:**

| ファイル | 内容 | 推定行数 |
|---------|------|:---:|
| `base.py` | 抽象基底クラス + TablenamesConfig | 360 |
| `bigquery.py` | DBOperatorGCPVM | 783 |
| `sqlite.py` | DBOperatorSQLITE3 | 792 |
| `postgres.py` | DBOperatorPOSTGRES | 859 |

後方互換: `__init__.py`で全シンボルをre-export

### Phase 7: クリーンアップ

- CLAUDE.md パス更新
- README.md アーキテクチャ記述更新
- 不要ファイル最終削除（gcloud_command_sample.sh等）
- CIで全体確認

---

## 削除対象ファイル

- `source/check_html/` (17ファイル) — 孤立実験コード
- `Dockerfile_nginx`, `Dockerfile_vite_preview` — 未使用
- `frontend/app/docker-compose.yml` — 内部重複
- `frontend/app/nginx.conf` — 外部と重複
- `source/bid_apps/DEPLOY.md` → `deploy/`に移動

## リスクと対策

| リスク | 対策 |
|--------|------|
| Pythonの`data/master/`相対パス破壊 | Phase 4で`data_dir`パラメータ化 + Dockerボリュームマウント |
| CI workflowパス切れ | Phase 2で8箇所一括更新 |
| npm workspace Docker解決 | 各Dockerfile内で個別`npm ci`、shared packageはCOPY |
| git履歴喪失 | `git mv`使用で保持、`git log --follow`で検証 |

## 検証方法

1. Backend: `cd packages/backend && npx tsc --noEmit`
2. Frontend: `cd packages/frontend && npx tsc --noEmit && npm run build`
3. Docker: `cd deploy && docker compose build`
4. CI: pushしてGitHub Actions確認
5. Python: `cd packages/engine && python -c "from domain.judgment import ..."`
