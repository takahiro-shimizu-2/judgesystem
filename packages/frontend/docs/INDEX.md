# プロジェクト情報インデックス

入札可否判定システム UI

---

## 開発環境

```bash
docker compose --profile dev up dev    # 開発: http://localhost:5173
docker compose up -d --build           # 本番: http://localhost:8080
```

---

## ドキュメント

| ドキュメント | 内容 |
|-------------|------|
| [ARCHITECTURE.md](./ARCHITECTURE.md) | アーキテクチャ・設計 |
| [COMPONENTS.md](./COMPONENTS.md) | コンポーネント一覧 |
| [DESIGN_SYSTEM.md](./DESIGN_SYSTEM.md) | デザインシステム |
| [STYLES.md](./STYLES.md) | スタイルガイド |
| [DEVELOPMENT.md](./DEVELOPMENT.md) | 開発ガイド |
| [DEVELOPMENT_PHASES.md](./DEVELOPMENT_PHASES.md) | 開発フェーズ |
| [REQUIREMENTS.md](./REQUIREMENTS.md) | 要件定義 |

---

## ソースコード

| ディレクトリ | 内容 |
|-------------|------|
| `src/types/` | 型定義 |
| `src/constants/` | 定数（色、ステータス、設定値） |
| `src/components/` | コンポーネント |
| `src/pages/` | ページ |
| `src/hooks/` | カスタムフック |
| `src/contexts/` | Context |
| `src/data/` | モックデータ |

---

## 主要ファイル

### 型定義 (`src/types/`)

| ファイル | 内容 |
|---------|------|
| `index.ts` | 共通型 + re-export |
| `workflow.ts` | ワークフロー関連 |
| `partner.ts` | 会社情報 |
| `orderer.ts` | 発注者 |
| `announcement.ts` | 入札案件 |

### 定数 (`src/constants/`)

| ファイル | 内容 |
|---------|------|
| `styles.ts` | カラー、スタイル |
| `status.ts` | EvaluationStatus設定 |
| `workStatus.ts` | WorkStatus設定 |
| `priority.ts` | CompanyPriority設定 |
| `icons.ts` | MUIアイコン |

---

## ルーティング

| Route | Page | 説明 |
|-------|------|------|
| `/` | BidListPage | 判定結果一覧 |
| `/detail/:id` | BidDetailPage | ワークフロー詳細 |
| `/announcements` | AnnouncementListPage | 入札案件一覧 |
| `/announcements/:id` | AnnouncementDetailPage | 入札案件詳細 |
| `/partners` | PartnerListPage | 会社情報一覧 |
| `/partners/:id` | PartnerDetailPage | 会社情報詳細 |
| `/orderers` | OrdererListPage | 発注者一覧 |
| `/orderers/:id` | OrdererDetailPage | 発注者詳細 |
| `/analytics` | AnalyticsPage | 分析ダッシュボード |

---

## 開発フェーズ

**現在: UIプロトタイプ段階**

- モックデータ直接import
- Service層・API未実装
- ローディング/エラー状態未実装

詳細は [DEVELOPMENT_PHASES.md](./DEVELOPMENT_PHASES.md) 参照
