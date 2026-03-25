# 入札可否判定システム UI

入札公告に対する企業の参加資格を判定・管理し、入札業務のワークフローを効率化するWebアプリケーションです。

## 機能概要

### サイドバーナビゲーション
- **入札管理**: サイドバーから各機能にアクセス
- **開閉可能**: サイドバーは折りたたみ可能
- **統一されたUI**: 全ページで共通のレイアウト

### 一覧画面（5種類）

| 画面 | 説明 |
|------|------|
| 判定結果 | 入札可否判定結果の一覧・フィルタリング |
| 入札案件 | 入札案件情報の一覧 |
| 会社情報 | 会社情報の一覧・管理（協力会社＋企業情報を統合） |
| 発注者 | 発注機関の一覧・管理 |
| 分析 | 分析ダッシュボード |

### 共通機能
- **カード形式レイアウト**: 一覧ページはカード形式で表示、右パネルで詳細表示
- **DataGrid表示**: MUI DataGridによる高機能な一覧表示
- **カスタムページネーション**: 日本語対応のページネーション
- **検索機能**: 各ページで検索可能
- **統一されたスタイル**: 全ページで共通のデザイン（borderRadius: 4px統一）

### 詳細画面（3カラムレイアウト）
- **左サイドバー**: 入札情報（資料リンク、概要、スケジュール、開札情報）
- **中央**: ワークフロー（判定結果、発注者、協力会社、依頼、落札情報）
- **右サイドバー**: 発注者情報、企業情報

### 判定結果ステータス
| ステータス | 色 | 条件 |
|----------|-----|------|
| 参加可能 | 緑 | すべての要件を満たしている |
| 特殊条件 | オレンジ | 一部の特殊要件のみ未達 |
| 参加不可 | 赤 | 必須要件が未達 |

### 作業ステータス
| ステータス | 色 | 説明 |
|----------|-----|------|
| 未着手 | グレー | 作業開始前 |
| 着手中 | 青 | 作業進行中 |
| 完了 | 緑 | 作業完了 |

## 技術スタック

| カテゴリ | 技術 |
|---------|------|
| フレームワーク | React 19 + TypeScript |
| ビルドツール | Vite 7 |
| UIライブラリ | Material-UI (MUI) v7 |
| DataGrid | MUI X DataGrid v8 |
| ルーティング | React Router v7 |
| コンテナ | Docker + Nginx |

## セットアップ

> **Note**: このプロジェクトはDocker環境で開発・実行することを前提としています。

### Docker環境（推奨）

```bash
# 本番ビルド＆起動（http://localhost:8080）
docker compose up -d --build

# 停止
docker compose down
```

### Docker開発環境（ホットリロード対応）

```bash
# 開発サーバー起動（http://localhost:5173）
docker compose --profile dev up dev

# バックグラウンドで起動
docker compose --profile dev up -d dev

# 停止
docker compose --profile dev down
```

### ローカル開発（Docker未使用）

Docker環境を使用できない場合のみ：

```bash
# 依存関係のインストール
npm install

# 開発サーバー起動
npm run dev

# ビルド
npm run build
```

## ディレクトリ構造

```
src/
├── components/              # UIコンポーネント
│   ├── common/             # 共通コンポーネント
│   │   ├── ContactInfo.tsx         # 連絡先情報（電話・メール・FAX）
│   │   ├── DetailComponents.tsx    # 詳細ページ共通コンポーネント
│   │   ├── CollapsibleSection.tsx  # 開閉可能セクション
│   │   ├── CollapsiblePanel.tsx    # 開閉可能パネル
│   │   ├── IconText.tsx            # アイコン付きテキスト
│   │   ├── InfoRow.tsx             # ラベル+値の行
│   │   ├── AddressText.tsx         # 住所表示
│   │   ├── ConfigChip.tsx          # 設定チップ
│   │   ├── StatusChips.tsx         # ステータスチップ
│   │   ├── EstimateDisplay.tsx     # 見積額表示
│   │   └── FloatingButtons.tsx     # フローティングボタン
│   ├── templates/          # ページテンプレート
│   │   └── ListPageTemplate.tsx    # 一覧ページ共通テンプレート
│   ├── bid/                # 入札関連コンポーネント
│   │   ├── BidListHeader.tsx       # 一覧ヘッダー
│   │   ├── DetailHeader.tsx        # 詳細画面ヘッダー
│   │   ├── FilterModal.tsx         # フィルターモーダル
│   │   ├── DisplayConditionsPanel.tsx # 表示条件パネル（右サイドパネル）
│   │   ├── StatusCell.tsx          # 判定結果ステータスセル
│   │   ├── WorkStatusCell.tsx      # 作業ステータスセル
│   │   ├── PriorityCell.tsx        # 優先順位セル
│   │   ├── RequirementCard.tsx     # 要件表示カード
│   │   └── CustomPagination.tsx    # カスタムページネーション
│   ├── layout/             # レイアウトコンポーネント
│   │   ├── MainLayout.tsx          # メインレイアウト
│   │   └── Sidebar.tsx             # サイドバー
│   ├── announcement/       # 入札案件関連
│   ├── orderer/            # 発注者関連
│   ├── partner/            # 会社情報関連
│   └── workflow/           # ワークフロー関連
│       ├── WorkflowStepper.tsx     # ワークフローステッパー
│       ├── WorkflowSection.tsx     # ワークフローセクション
│       └── sections/               # 各ステップのコンテンツ
│           ├── JudgmentSection.tsx     # 判定結果
│           ├── OrdererSection.tsx      # 発注者タブ
│           ├── OrdererWorkflowSection.tsx # 発注者ワークフロー
│           ├── PartnerSection.tsx      # 協力会社タブ
│           ├── RequestSection.tsx      # 依頼タブ
│           ├── AwardSection.tsx        # 落札情報
│           ├── BidInfoSection.tsx      # 入札情報
│           ├── OrdererInfoSection.tsx  # 発注者情報
│           ├── CompanyInfoSection.tsx  # 企業情報
│           └── ClientSection.tsx       # クライアント情報
├── pages/                  # ページコンポーネント
│   ├── BidListPage.tsx             # 判定結果一覧
│   ├── BidDetailPage.tsx           # 判定結果詳細（ワークフロー）
│   ├── AnnouncementListPage.tsx    # 入札案件一覧
│   ├── AnnouncementDetailPage.tsx  # 入札案件詳細
│   ├── PartnerListPage.tsx         # 会社情報一覧（協力会社＋企業情報統合）
│   ├── PartnerDetailPage.tsx       # 会社情報詳細
│   ├── OrdererListPage.tsx         # 発注者一覧
│   ├── OrdererDetailPage.tsx       # 発注者詳細
│   └── AnalyticsPage.tsx           # 分析ダッシュボード
├── contexts/               # Reactコンテキスト
│   └── SidebarContext.tsx          # サイドバー状態管理
├── hooks/                  # カスタムフック
│   ├── useBidListState.ts          # 判定結果一覧の状態管理
│   └── useListPageState.ts         # 各一覧ページ共通の状態管理
├── constants/              # 定数定義（ラベル・色・設定値）
│   ├── styles.ts                   # 共通スタイル・カラー定数
│   ├── detailPageStyles.ts         # 詳細ページスタイル
│   ├── icons.ts                    # アイコン定義・使用ルール
│   ├── status.ts                   # 判定結果ステータス設定
│   ├── workStatus.ts               # 作業ステータス設定
│   ├── priority.ts                 # 優先順位設定
│   ├── workflow.ts                 # ワークフロー設定
│   ├── partnerStatus.ts            # 協力会社ステータス設定
│   ├── announcementStatus.ts       # 入札案件ステータス設定
│   ├── bidType.ts                  # 入札方式設定
│   ├── documentType.ts             # ドキュメント種別設定
│   ├── categories.ts               # 工事カテゴリ
│   ├── prefectures.ts              # 都道府県
│   ├── organizations.ts            # 発注機関
│   ├── emailTemplates.ts           # メールテンプレート
│   ├── memoTags.ts                 # メモタグ設定
│   ├── locales.ts                  # 日本語化設定
│   └── datagrid.ts                 # DataGrid設定
├── utils/                  # ユーティリティ関数
│   ├── search.ts                   # 日本語検索
│   ├── deadline.ts                 # 締切計算
│   └── status.ts                   # ステータス処理
├── types/                  # 型定義（純粋な型のみ）
│   ├── index.ts                    # 共通型 + 全型のre-export
│   ├── workflow.ts                 # ワークフロー型定義
│   ├── partner.ts                  # 会社情報型（PartnerListItem）
│   ├── orderer.ts                  # 発注者型定義
│   └── announcement.ts             # 入札案件型定義
└── data/                   # モックデータ
    ├── evaluations.ts              # 判定結果データ
    ├── announcements.ts            # 入札案件データ
    ├── partners.ts                 # 会社データ（協力会社＋企業情報統合）
    ├── companies.ts                # 企業参照用マスター
    └── orderers.ts                 # 発注者データ
```

## 設計原則

- **SOLID原則**: 単一責任、オープン/クローズド原則を適用
- **DRY**: 共通コンポーネント・スタイルによる重複排除
- **Atomic Design風**: common（原子）→ bid/workflow（分子）→ pages（ページ）
- **責務分離**: 表示・ロジック・定数を分離
- **共通スタイル**: `src/constants/styles.ts`で一元管理
- **統一borderRadius**: 全コンポーネントで`borderRadius.xs`(4px)を使用

## ドキュメント

| ドキュメント | 説明 |
|-------------|------|
| [要件定義書](docs/REQUIREMENTS.md) | 機能要件・非機能要件 |
| [アーキテクチャ](docs/ARCHITECTURE.md) | システム構成・コンポーネント設計 |
| [開発ガイド](docs/DEVELOPMENT.md) | 開発環境・コーディング規約 |
| [開発フェーズ](docs/DEVELOPMENT_PHASES.md) | 各フェーズでのタスク一覧 |
| [スタイルガイド](docs/STYLES.md) | カラーパレット・アイコン・スタイルルール |
| [コンポーネント](docs/COMPONENTS.md) | 共通コンポーネントの使用方法 |
| [デザインシステム](docs/DESIGN_SYSTEM.md) | 高級感モダンデザイン指針 |

## 画面一覧

| 画面 | URL | 説明 |
|------|-----|------|
| 判定結果一覧 | `/` | 入札判定結果の一覧表示・検索 |
| 判定結果詳細 | `/detail/:id` | 判定結果の詳細・ワークフロー |
| 入札案件一覧 | `/announcements` | 入札案件情報の一覧 |
| 入札案件詳細 | `/announcements/:id` | 入札案件の詳細情報 |
| 会社情報一覧 | `/partners` | 会社情報の一覧（協力会社＋企業情報統合） |
| 会社情報詳細 | `/partners/:id` | 会社の詳細情報 |
| 発注者一覧 | `/orderers` | 発注機関の一覧 |
| 発注者詳細 | `/orderers/:id` | 発注機関の詳細情報 |
| 分析 | `/analytics` | 分析ダッシュボード |

## ライセンス

プライベートプロジェクト
