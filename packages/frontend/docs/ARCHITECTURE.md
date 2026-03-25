# アーキテクチャ設計書

## 1. システム概要

入札可否判定システムUIは、入札公告に対する企業の参加資格判定結果を表示・管理するSPA（Single Page Application）です。サイドバーナビゲーションを備え、複数の一覧画面と詳細画面を提供します。

## PlantUML 図

詳細な図は `docs/diagrams/` ディレクトリにPlantUMLファイルとして配置されています。

| 図 | ファイル | 説明 |
|----|---------|------|
| アーキテクチャ図 | [architecture.puml](diagrams/architecture.puml) | システム全体構成 |
| コンポーネント図 | [component.puml](diagrams/component.puml) | コンポーネント依存関係 |
| クラス図 | [class.puml](diagrams/class.puml) | 型定義の構造 |
| シーケンス図 | [sequence.puml](diagrams/sequence.puml) | データフロー |
| 一覧ページレイアウト | [page-layout.puml](diagrams/page-layout.puml) | カード形式レイアウト |
| 詳細ページレイアウト | [detail-layout.puml](diagrams/detail-layout.puml) | 3カラムレイアウト |
| 状態管理フロー | [state-flow.puml](diagrams/state-flow.puml) | 状態管理の流れ |

PlantUMLの表示方法:
- VSCode: PlantUML拡張機能をインストール
- オンライン: [PlantUML Server](http://www.plantuml.com/plantuml/uml/)

## 2. システム構成図

```
┌─────────────────────────────────────────────────────────────────┐
│                        Browser                                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                    React Application                      │    │
│  │  ┌─────────────────────────────────────────────────────┐ │    │
│  │  │                     App.tsx                          │ │    │
│  │  │     (React Router + SidebarProvider)                 │ │    │
│  │  └────────────────────┬────────────────────────────────┘ │    │
│  │                       │                                   │    │
│  │  ┌────────────────────┴────────────────────────────────┐ │    │
│  │  │                  MainLayout                          │ │    │
│  │  │  ┌──────────┐  ┌──────────────────────────────────┐ │ │    │
│  │  │  │ Sidebar  │  │         Page Content              │ │ │    │
│  │  │  │          │  │  ┌────────────────────────────┐  │ │ │    │
│  │  │  │ - 判定結果│  │  │ BidListPage (/)            │  │ │ │    │
│  │  │  │ - 入札案件│  │  │ BidDetailPage (/detail/:id)│  │ │ │    │
│  │  │  │ - 会社情報│  │  │ AnnouncementListPage       │  │ │ │    │
│  │  │  │ - 発注者 │  │  │ PartnerListPage            │  │ │ │    │
│  │  │  │ - 分析   │  │  │ OrdererListPage            │  │ │ │    │
│  │  │  └──────────┘  │  │ AnalyticsPage              │  │ │ │    │
│  │  │                 │  └────────────────────────────┘  │ │ │    │
│  │  │                 └──────────────────────────────────┘ │ │    │
│  │  └──────────────────────────────────────────────────────┘ │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                         Nginx                                    │
│                    (Static Server)                               │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                         Docker                                   │
│                    (Container Runtime)                           │
└─────────────────────────────────────────────────────────────────┘
```

---

## 3. ディレクトリ構造

```
src/
├── components/                 # UIコンポーネント
│   ├── common/                # 共通コンポーネント（原子レベル）
│   │   ├── ContactInfo.tsx          # 連絡先情報（電話・メール・FAX）
│   │   ├── DetailComponents.tsx     # 詳細ページ共通コンポーネント
│   │   ├── CollapsibleSection.tsx   # 開閉可能セクション
│   │   ├── CollapsiblePanel.tsx     # 開閉可能パネル（サイドバー用）
│   │   ├── IconText.tsx             # アイコン付きテキスト
│   │   ├── InfoRow.tsx              # ラベル+値の行
│   │   ├── AddressText.tsx          # 住所表示
│   │   ├── ConfigChip.tsx           # 設定チップ
│   │   ├── StatusChips.tsx          # ステータスチップ
│   │   ├── EstimateDisplay.tsx      # 見積額表示
│   │   ├── FilterOptionButton.tsx   # フィルターボタン
│   │   ├── SelectAllButton.tsx      # 全選択ボタン
│   │   ├── FloatingButtons.tsx      # フローティングボタン
│   │   └── index.ts
│   │
│   ├── templates/             # ページテンプレート
│   │   ├── ListPageTemplate.tsx     # 一覧ページ共通テンプレート
│   │   └── index.ts
│   │
│   ├── bid/                   # 入札関連コンポーネント（分子レベル）
│   │   ├── BidListHeader.tsx        # 一覧ヘッダー
│   │   ├── DetailHeader.tsx         # 詳細画面ヘッダー
│   │   ├── FilterModal.tsx          # フィルターモーダル
│   │   ├── DisplayConditionsPanel.tsx # 表示条件パネル（右サイドパネル）
│   │   ├── StatusCell.tsx           # 判定結果ステータスセル
│   │   ├── WorkStatusCell.tsx       # 作業ステータスセル
│   │   ├── PriorityCell.tsx         # 優先順位セル
│   │   ├── CustomPagination.tsx     # ページネーション
│   │   ├── RequirementCard.tsx      # 要件カード
│   │   └── index.ts
│   │
│   ├── layout/                # レイアウトコンポーネント
│   │   ├── MainLayout.tsx           # メインレイアウト（サイドバー+コンテンツ）
│   │   ├── Sidebar.tsx              # サイドバーナビゲーション
│   │   └── index.ts
│   │
│   ├── announcement/          # 入札案件関連コンポーネント
│   ├── orderer/               # 発注者関連コンポーネント
│   ├── partner/               # 会社情報関連コンポーネント
│   │
│   └── workflow/              # ワークフロー関連（分子レベル）
│       ├── WorkflowStepper.tsx      # ステッパー
│       ├── WorkflowSection.tsx      # ワークフローセクション
│       └── sections/                # 各ステップのコンテンツ
│           ├── BidInfoSection.tsx       # 入札情報（左サイドバー）
│           ├── OrdererInfoSection.tsx   # 発注者情報（右サイドバー）
│           ├── CompanyInfoSection.tsx   # 企業情報（右サイドバー）
│           ├── JudgmentSection.tsx      # 判定結果タブ
│           ├── OrdererSection.tsx       # 発注者タブ
│           ├── OrdererWorkflowSection.tsx # 発注者ワークフロー
│           ├── PartnerSection.tsx       # 協力会社タブ
│           ├── RequestSection.tsx       # 依頼タブ
│           ├── AwardSection.tsx         # 落札情報タブ
│           ├── ClientSection.tsx        # クライアント情報
│           └── index.ts
│
├── pages/                     # ページコンポーネント（テンプレートレベル）
│   ├── BidListPage.tsx            # 判定結果一覧ページ
│   ├── BidDetailPage.tsx          # 判定結果詳細ページ（ワークフロー）
│   ├── AnnouncementListPage.tsx   # 入札案件一覧ページ
│   ├── AnnouncementDetailPage.tsx # 入札案件詳細ページ
│   ├── PartnerListPage.tsx        # 会社情報一覧ページ（協力会社＋企業情報を統合）
│   ├── PartnerDetailPage.tsx      # 会社情報詳細ページ
│   ├── OrdererListPage.tsx        # 発注者一覧ページ
│   ├── OrdererDetailPage.tsx      # 発注者詳細ページ
│   └── AnalyticsPage.tsx          # 分析ダッシュボード
│
├── contexts/                  # Reactコンテキスト
│   └── SidebarContext.tsx         # サイドバー開閉状態管理
│
├── hooks/                     # カスタムフック
│   ├── useBidListState.ts         # 判定結果一覧の状態管理
│   ├── useListPageState.ts        # 各一覧ページ共通の状態管理
│   └── index.ts
│
├── constants/                 # 定数定義（ラベル・色・設定値）
│   ├── styles.ts                  # 共通スタイル・カラー定数（colors, pageStyles, borderRadius等）
│   ├── detailPageStyles.ts        # 詳細ページスタイル
│   ├── icons.ts                   # アイコン定義・使用ルール
│   ├── status.ts                  # 判定結果ステータス設定
│   ├── priority.ts                # 優先順位設定
│   ├── workStatus.ts              # 作業ステータス設定
│   ├── workflow.ts                # ワークフロー設定
│   ├── partnerStatus.ts           # 協力会社ステータス（ラベル・色・優先度）
│   ├── announcementStatus.ts      # 入札案件ステータス設定
│   ├── bidType.ts                 # 入札方式設定
│   ├── documentType.ts            # ドキュメント種別設定
│   ├── categories.ts              # カテゴリ一覧
│   ├── prefectures.ts             # 都道府県一覧
│   ├── organizations.ts           # 発注機関一覧
│   ├── emailTemplates.ts          # メールテンプレート
│   ├── memoTags.ts                # メモタグ設定
│   ├── locales.ts                 # 日本語化設定
│   ├── datagrid.ts                # DataGrid設定
│   └── index.ts                   # まとめてexport
│
├── utils/                     # ユーティリティ関数
│   ├── search.ts                  # 検索ユーティリティ
│   ├── deadline.ts                # 締切計算ユーティリティ
│   └── status.ts                  # ステータスユーティリティ
│
├── types/                     # 型定義（純粋な型のみ、定数は含めない）
│   ├── index.ts                   # 共通型（EvaluationStatus, WorkStatus, Company等）+ 全型のre-export
│   ├── workflow.ts                # ワークフロー型（Partner, PartnerStatus, Document, CheckItem, CallLog等）
│   ├── partner.ts                 # 会社情報型（PartnerListItem, PastProject, Qualifications等）
│   ├── orderer.ts                 # 発注者型（Orderer, OrdererCategory）
│   └── announcement.ts            # 入札案件型（AnnouncementStatus, AnnouncementWithStatus）
│
├── data/                      # データ層（本番想定のデータ量）
│   ├── index.ts                   # データのre-export
│   ├── evaluations.ts             # 判定結果データ（3000件）
│   ├── announcements.ts           # 入札案件データ（500件）
│   ├── partners.ts                # 会社マスター（250件）※協力会社＋企業情報を統合
│   ├── companies.ts               # 企業参照用マスター（115件）
│   └── orderers.ts                # 発注者マスター（65件）
│
├── App.tsx                    # アプリケーションルート
├── main.tsx                   # エントリーポイント
└── index.css                  # グローバルスタイル
```

---

## 4. コンポーネント階層図

```
App (SidebarProvider)
└── MainLayout
    ├── Sidebar
    │   └── メニューアイテム（判定結果、入札案件、会社情報、発注者、分析）
    │
    └── Routes
        ├── BidListPage (/)
        │   ├── BidListHeader
        │   │   ├── FilterOptionButton (複数)
        │   │   └── SelectAllButton
        │   ├── カード形式レイアウト
        │   │   ├── DataGrid
        │   │   │   ├── WorkStatusCell
        │   │   │   ├── StatusCell
        │   │   │   └── PriorityCell
        │   │   └── 右パネル（詳細プレビュー）
        │   ├── CustomPagination
        │   └── FilterModal / DisplayConditionsPanel
        │
        ├── BidDetailPage (/detail/:id)
        │   ├── DetailHeader
        │   ├── StepperBar
        │   │   └── WorkflowStepper
        │   ├── Left Sidebar (BidInfoSection)
        │   ├── Center Content (WorkflowSection複数)
        │   │   ├── JudgmentSection
        │   │   ├── OrdererWorkflowSection
        │   │   ├── PartnerSection
        │   │   ├── RequestSection
        │   │   └── AwardSection
        │   ├── Right Sidebar
        │   │   ├── OrdererInfoSection
        │   │   └── CompanyInfoSection
        │   └── FloatingButtons
        │
        ├── AnnouncementListPage (/announcements)
        │   ├── ヘッダー（タイトル + 検索）
        │   ├── カード形式レイアウト + 右パネル
        │   └── CustomPagination
        │
        ├── AnnouncementDetailPage (/announcements/:id)
        │
        ├── PartnerListPage (/partners)
        │   ├── カード形式レイアウト + 右パネル
        │   └── CategoriesCell（種別チップ表示）
        │
        ├── PartnerDetailPage (/partners/:id)
        │   ├── DetailPageHeader
        │   ├── SectionCard
        │   └── DetailInfoRow
        │
        ├── OrdererListPage (/orderers)
        │   ├── カード形式レイアウト + 右パネル
        │   └── CustomPagination
        │
        ├── OrdererDetailPage (/orderers/:id)
        │
        └── AnalyticsPage (/analytics)
            ├── タイトル
            ├── StatCard (複数)
            └── ChartCard (複数)
```

---

## 5. データフロー

```
┌──────────────────────────────────────────────────────────────────┐
│                        データソース                               │
│  evaluations.ts, announcements.ts, partners.ts, orderers.ts etc. │
└──────────────────────┬───────────────────────────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────────────────────────┐
│                     SidebarContext                                │
│              (サイドバー開閉状態の共有)                            │
└──────────────────────┬───────────────────────────────────────────┘
                       │
       ┌───────────────┼───────────────┐
       ▼               ▼               ▼
┌────────────┐  ┌────────────┐  ┌────────────┐
│ BidListPage│  │PartnerList │  │ 他のページ │
│            │  │    Page    │  │            │
└─────┬──────┘  └─────┬──────┘  └─────┬──────┘
      │               │               │
      ▼               ▼               ▼
┌─────────────────────────────────────────────────────────────────┐
│                      共通スタイル適用                             │
│   pageStyles, listDataGridStyles, borderRadius.xs (styles.ts)   │
└─────────────────────────────────────────────────────────────────┘
```

---

## 6. 状態管理

### 6.1 状態の種類

| 種類 | 管理方法 | 用途 |
|------|---------|------|
| サイドバー状態 | SidebarContext | サイドバーの開閉状態（全ページ共有） |
| ローカルUI状態 | useState | 開閉状態、選択状態、検索クエリ |
| ページネーション | useState | ページ番号、表示件数 |
| 派生データ | useMemo | フィルター結果、計算値 |
| イベントハンドラ | useCallback | クリックハンドラ等 |
| 永続化データ | localStorage | フィルター設定（BidListPageのみ） |

### 6.2 SidebarContext

```typescript
interface SidebarContextType {
  isOpen: boolean;   // サイドバーの開閉状態
  toggle: () => void; // 開閉トグル
}

// 使用例
const { isOpen, toggle } = useSidebar();

// DataGridの列幅再計算用
useEffect(() => {
  const timer = setTimeout(() => {
    setGridKey((prev) => prev + 1);
  }, 220);
  return () => clearTimeout(timer);
}, [isOpen]);
```

### 6.3 一覧ページの状態パターン

```typescript
// 全一覧ページで共通のパターン
const [searchQuery, setSearchQuery] = useState('');
const [paginationModel, setPaginationModel] = useState<GridPaginationModel>({
  page: 0,
  pageSize: 25
});
const { isOpen } = useSidebar();
const [gridKey, setGridKey] = useState(0);

// フィルタリング
const rows = useMemo(() => {
  return data.filter(item => /* 検索条件 */);
}, [searchQuery]);
```

---

## 7. 共通スタイルシステム

### 7.1 pageStyles (src/constants/styles.ts)

全一覧ページで使用する共通スタイル。

```typescript
export const pageStyles = {
  // ページコンテナ
  container: {
    height: '100vh',
    display: 'flex',
    flexDirection: 'column',
    bgcolor: colors.page.background, // #e2e8f0
  },
  // コンテンツエリア
  contentArea: {
    flex: 1,
    p: 3,
    minHeight: 0,
  },
  // メインカード
  mainCard: {
    height: '100%',
    borderRadius: borderRadius.xs, // '4px' - 統一
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
  },
  // カード内ヘッダー
  cardHeader: {
    px: 2.5,
    pt: 2.5,
    pb: 2,
    borderBottom: '1px solid #e2e8f0',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  // ページタイトル
  pageTitle: {
    fontWeight: 700,
    color: '#1e293b',
  },
  // 検索フィールド
  searchField: { /* ... */ },
};
```

### 7.2 DataGridスタイル

```typescript
// 詳細画面遷移可能なDataGrid用
export const dataGridStyles = {
  border: 'none',
  flex: 1,
  '& .MuiDataGrid-row': {
    cursor: 'pointer',
    '&:hover': { backgroundColor: colors.background.hover },
  },
  // ...
};

// 一覧表示のみのDataGrid用（cursor: pointerなし）
export const listDataGridStyles = {
  // ...
};
```

### 7.3 borderRadius（統一: 4px）

```typescript
export const borderRadius = {
  xs: '4px',   // 統一使用
  sm: '6px',
  md: '8px',
  lg: '12px',
  xl: '16px',
  full: '9999px',
};
```

---

## 8. 設計原則

### 8.1 SOLID原則の適用

| 原則 | 適用例 |
|------|--------|
| **S**ingle Responsibility | 各ページは単一の責務（一覧表示のみ） |
| **O**pen/Closed | pageStylesによる拡張可能なスタイル設計 |
| **I**nterface Segregation | 必要なpropsのみを受け取る小さなインターフェース |
| **D**ependency Inversion | コンポーネントはデータ構造に依存せず、propsで受け取る |

### 8.2 DRY原則

- **共通スタイル**: `pageStyles`, `listDataGridStyles`で重複排除
- **共通コンポーネント**: `CustomPagination`を全ページで再利用
- **共通レイアウト**: `MainLayout`でサイドバー+コンテンツ構造を統一
- **統一borderRadius**: `borderRadius.xs`(4px)を全コンポーネントで使用

### 8.3 コンポーネント設計パターン

- **Atomic Design風**: common（原子）→ bid/workflow（分子/組織）→ pages（テンプレート/ページ）
- **責務分離**: 表示・ロジック・定数を分離
- **コンテキスト**: グローバル状態（サイドバー）はContextで管理

---

## 9. 技術スタック

| カテゴリ | 技術 | バージョン |
|---------|------|-----------|
| フレームワーク | React | 19.x |
| 言語 | TypeScript | 5.x |
| ビルドツール | Vite | 7.x |
| UIライブラリ | Material-UI (MUI) | 7.x |
| データグリッド | MUI X DataGrid | 8.x |
| ルーティング | React Router | 7.x |
| コンテナ | Docker | - |
| Webサーバー | Nginx | Alpine |

---

## 10. ルーティング構成

| パス | ページ | 説明 |
|------|--------|------|
| `/` | BidListPage | 判定結果一覧 |
| `/detail/:id` | BidDetailPage | 判定結果詳細（ワークフロー） |
| `/announcements` | AnnouncementListPage | 入札案件一覧 |
| `/announcements/:id` | AnnouncementDetailPage | 入札案件詳細 |
| `/partners` | PartnerListPage | 会社情報一覧（協力会社＋企業情報を統合） |
| `/partners/:id` | PartnerDetailPage | 会社情報詳細 |
| `/orderers` | OrdererListPage | 発注者一覧 |
| `/orderers/:id` | OrdererDetailPage | 発注者詳細 |
| `/analytics` | AnalyticsPage | 分析ダッシュボード |

---

## 11. 改訂履歴

| バージョン | 日付 | 変更内容 |
|-----------|------|---------|
| 1.0.0 | 2024-12 | 初版作成 |
| 1.1.0 | 2024-12 | ワークフローコンポーネント追加 |
| 2.0.0 | 2024-12 | 共通コンポーネント抽出、リファクタリング |
| 3.0.0 | 2024-12 | 複数一覧ページ追加、サイドバーナビゲーション、共通スタイルシステム導入 |
| 3.1.0 | 2024-12 | 作業ステータス（WorkStatus）追加、判定結果とステータスの分離 |
| 3.2.0 | 2025-01 | 詳細ページの共通化（DetailHeader、detailPageStyles）、useListPageStateフック追加 |
| 3.3.0 | 2025-01 | レスポンシブ対応、モバイル/タブレット/デスクトップ対応 |
| 3.4.0 | 2025-01 | ContactInfo/ContactActions共通コンポーネント、ListPageTemplate、アイコンルール整備、カラー定数統一 |
| 3.5.0 | 2025-01 | 協力会社と企業情報を「会社情報」に統合、モックデータ拡充 |
| 3.6.0 | 2025-01 | 一覧ページをカード形式に統一、右パネル追加、borderRadiusをxs(4px)に統一 |
