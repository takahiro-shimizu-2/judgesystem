# コンポーネントリファレンス

このドキュメントでは、アプリケーションで使用可能な共通コンポーネントとその使用方法を説明します。

## 目次

1. [共通コンポーネント (common/)](#共通コンポーネント)
2. [テンプレート (templates/)](#テンプレート)
3. [入札関連 (bid/)](#入札関連)
4. [ワークフロー (workflow/)](#ワークフロー)
5. [レイアウト (layout/)](#レイアウト)

---

## 共通コンポーネント

### ContactInfo

連絡先情報（電話・メール・FAX・住所）を統一されたスタイルで表示します。

**ファイル**: `src/components/common/ContactInfo.tsx`

```tsx
import { ContactInfo, ContactActions, IconText } from '../components/common/ContactInfo';

// 基本的な使用
<ContactInfo
  phone="03-1234-5678"
  email="example@email.com"
  fax="03-1234-5679"
  address="東京都千代田区..."
  contactPerson="山田太郎"
  layout="row"  // "row" | "column"
/>

// 電話・メールボタン
<ContactActions
  phone="03-1234-5678"
  email="example@email.com"
  layout="row"  // "row" | "stacked"
  size="medium" // "small" | "medium"
/>

// アイコン付きテキスト（汎用）
<IconText
  icon={<PhoneIcon />}
  text="03-1234-5678"
  color={colors.text.muted}
  fontSize={fontSizes.sm}
  iconSize={16}
/>
```

**Props**:

| Prop | 型 | デフォルト | 説明 |
|------|-----|---------|------|
| phone | string | - | 電話番号 |
| email | string | - | メールアドレス |
| fax | string | - | FAX番号 |
| address | string | - | 住所 |
| contactPerson | string | - | 担当者名 |
| layout | 'row' \| 'column' | 'row' | レイアウト方向 |
| fontSize | string | fontSizes.sm | フォントサイズ |
| iconSize | number | 16 | アイコンサイズ |

---

### ConfigChip

設定可能な汎用チップコンポーネントです。

**ファイル**: `src/components/common/ConfigChip.tsx`

```tsx
import { ConfigChip } from '../components/common';

<ConfigChip
  config={{
    label: 'ラベル',
    color: '#3b82f6',
    bgColor: 'rgba(59, 130, 246, 0.1)',
    borderColor: '#3b82f6',
    gradient: 'linear-gradient(...)',
    icon: SomeIcon,
  }}
  variant="outlined"  // "filled" | "outlined"
  showIcon={true}
/>
```

**Props**:

| Prop | 型 | デフォルト | 説明 |
|------|-----|---------|------|
| config | ChipConfig | 必須 | チップの設定 |
| variant | 'filled' \| 'outlined' | 'outlined' | スタイルバリアント |
| showIcon | boolean | true | アイコン表示 |

---

### StatusChips

ステータス表示用のチップコンポーネント群です。

**ファイル**: `src/components/common/StatusChips.tsx`

```tsx
import { EvaluationStatusChip, WorkStatusChip, PriorityChip } from '../components/common';

// 判定結果（参加可能/特殊条件/参加不可）
<EvaluationStatusChip status="all_met" />

// 作業ステータス（未着手/着手中/完了）
<WorkStatusChip status="in_progress" />

// 優先度
<PriorityChip priority={1} />
```

**ステータス値**:

| コンポーネント | 値 | 表示 |
|--------------|-----|------|
| EvaluationStatusChip | 'all_met' | 参加可能（緑） |
| | 'other_only_unmet' | 特殊条件（オレンジ） |
| | 'unmet' | 参加不可（赤） |
| WorkStatusChip | 'not_started' | 未着手（グレー） |
| | 'in_progress' | 着手中（青） |
| | 'completed' | 完了（緑） |

---

### DetailComponents

詳細ページで使用する共通コンポーネント群です。

**ファイル**: `src/components/common/DetailComponents.tsx`

```tsx
import {
  DetailInfoRow,
  StatCard,
  ScheduleItem,
  NotFoundView,
  DetailPageHeader,
  SectionCard,
} from '../components/common';

// 情報行（アイコン + ラベル + 値）
<DetailInfoRow icon={<PhoneIcon />} label="電話" value="03-1234-5678" />

// 統計カード
<StatCard
  icon={<TrophyIcon />}
  label="落札件数"
  value={25}
  color={colors.accent.blue}
/>

// スケジュール項目
<ScheduleItem label="公告日" value="2024/01/15" />

// 404表示
<NotFoundView
  message="指定されたデータが見つかりません"
  onBack={() => navigate(-1)}
/>

// 詳細ページヘッダー
<DetailPageHeader
  title="タイトル"
  subtitle="サブタイトル"
  statusChip={<SomeChip />}
  gradient={colors.primary.gradient}
  onBack={() => navigate(-1)}
>
  {/* 追加コンテンツ */}
</DetailPageHeader>

// セクションカード
<SectionCard icon={<BusinessIcon />} title="セクションタイトル">
  {/* コンテンツ */}
</SectionCard>
```

---

### CollapsibleSection / CollapsiblePanel

開閉可能なセクション・パネルです。

**ファイル**: `src/components/common/CollapsibleSection.tsx`, `CollapsiblePanel.tsx`

```tsx
import { CollapsibleSection, CollapsiblePanel } from '../components/common';

// 開閉セクション
<CollapsibleSection
  title="セクションタイトル"
  icon={<SomeIcon />}
  defaultExpanded={true}
>
  {/* コンテンツ */}
</CollapsibleSection>

// 開閉パネル
<CollapsiblePanel
  title="パネルタイトル"
  defaultOpen={false}
  collapsible={true}
>
  {/* コンテンツ */}
</CollapsiblePanel>
```

---

### FloatingButtons

フローティングボタン群です。

**ファイル**: `src/components/common/FloatingButtons.tsx`

```tsx
import { FloatingBackButton, ScrollToTopButton, FloatingWorkflowMenu } from '../components/common';

// 戻るボタン
<FloatingBackButton onClick={() => navigate(-1)} />

// スクロールトップボタン
<ScrollToTopButton />

// ワークフローメニュー
<FloatingWorkflowMenu
  steps={workflowSteps}
  currentStep={currentStep}
  onStepClick={handleStepClick}
/>
```

---

### その他の共通コンポーネント

| コンポーネント | ファイル | 説明 |
|--------------|---------|------|
| IconText | IconText.tsx | アイコン付きテキスト |
| InfoRow | InfoRow.tsx | ラベル+値の行 |
| AddressText | AddressText.tsx | 住所表示（郵便番号対応） |
| EstimateDisplay | EstimateDisplay.tsx | 見積額表示 |
| FilterOptionButton | FilterOptionButton.tsx | フィルターオプションボタン |
| SelectAllButton | SelectAllButton.tsx | 全選択ボタン |

---

## テンプレート

### ListPageTemplate

一覧ページの共通テンプレートです。ヘッダー、検索、DataGrid、ページネーションを統合しています。

**ファイル**: `src/components/templates/ListPageTemplate.tsx`

```tsx
import { ListPageTemplate } from '../components/templates';

<ListPageTemplate
  title="一覧タイトル"
  searchPlaceholder="検索プレースホルダー..."
  searchQuery={searchQuery}
  onSearchChange={handleSearchChange}
  columns={columns}          // GridColDef[]
  rows={rows}                // T[]
  onRowClick={handleRowClick}
  paginationModel={paginationModel}
  onPaginationModelChange={handlePaginationModelChange}
  gridKey={gridKey}          // オプション: 再レンダリング用
  headerExtra={<Button />}   // オプション: ヘッダー追加要素
  dataGridSx={{}}            // オプション: DataGrid追加スタイル
  pageSizeOptions={[25, 50, 100]}
/>
```

**Props**:

| Prop | 型 | 必須 | 説明 |
|------|-----|-----|------|
| title | string | ○ | ページタイトル |
| searchPlaceholder | string | ○ | 検索プレースホルダー |
| searchQuery | string | ○ | 検索クエリ |
| onSearchChange | (e) => void | ○ | 検索変更ハンドラ |
| columns | GridColDef[] | ○ | DataGrid列定義 |
| rows | T[] | ○ | 表示データ |
| onRowClick | (params) => void | - | 行クリックハンドラ |
| paginationModel | GridPaginationModel | ○ | ページネーション状態 |
| onPaginationModelChange | (model) => void | ○ | ページネーション変更 |

---

## 入札関連

### CustomPagination

日本語対応のカスタムページネーションです。

**ファイル**: `src/components/bid/CustomPagination.tsx`

```tsx
import { CustomPagination } from '../components/bid';

<CustomPagination
  page={0}
  pageSize={25}
  rowCount={100}
  onPageChange={(page) => setPage(page)}
  onPageSizeChange={(size) => setPageSize(size)}
/>
```

---

### FilterModal

フィルター条件入力モーダルです。

**ファイル**: `src/components/bid/FilterModal.tsx`

```tsx
import { FilterModal } from '../components/bid';

<FilterModal
  open={isOpen}
  onClose={() => setIsOpen(false)}
  filterState={filterState}
  onFilterChange={handleFilterChange}
/>
```

---

### DisplayConditionsPanel

表示条件パネル（右サイドパネル）です。検索・ソート・フィルター機能を集約しています。

**ファイル**: `src/components/bid/DisplayConditionsPanel.tsx`

```tsx
import { DisplayConditionsPanel } from '../components/bid';

<DisplayConditionsPanel
  searchQuery={searchQuery}
  onSearchChange={handleSearchChange}
  sortModel={sortModel}
  onSortModelChange={handleSortModelChange}
  filters={filters}
  onFilterChange={handleFilterChange}
  activeFilterCount={activeFilterCount}
  onClearFilters={handleClearFilters}
/>
```

---

### StatusCell / WorkStatusCell / PriorityCell

DataGrid用のセルコンポーネントです。

**ファイル**: `src/components/bid/StatusCell.tsx` など

```tsx
import { StatusCell, WorkStatusCell, PriorityCell } from '../components/bid';

// 列定義での使用
const columns: GridColDef[] = [
  {
    field: 'status',
    headerName: '判定結果',
    renderCell: (params) => <StatusCell status={params.value} />,
  },
  {
    field: 'workStatus',
    headerName: '作業状況',
    renderCell: (params) => <WorkStatusCell status={params.value} />,
  },
];
```

---

## ワークフロー

### WorkflowStepper

ワークフローの進捗ステッパーです。

**ファイル**: `src/components/workflow/WorkflowStepper.tsx`

```tsx
import { WorkflowStepper } from '../components/workflow';

<WorkflowStepper
  steps={WORKFLOW_STEP_CONFIG}
  currentStep={currentStep}
  workStatus={workStatus}
  onStepClick={handleStepClick}
/>
```

---

### ワークフローセクション

各ワークフローステップのコンテンツを表示します。

**ファイル**: `src/components/workflow/sections/`

| コンポーネント | 説明 |
|--------------|------|
| JudgmentSection | 判定結果セクション |
| OrdererSection | 発注者確認セクション |
| OrdererWorkflowSection | 発注者ワークフローセクション |
| PartnerSection | 協力会社セクション |
| RequestSection | 依頼セクション |
| AwardSection | 落札情報セクション |
| BidInfoSection | 入札情報セクション（左パネル） |
| CompanyInfoSection | 企業情報セクション（右パネル） |
| OrdererInfoSection | 発注者情報セクション（右パネル） |
| ClientSection | クライアント情報セクション |

---

## レイアウト

### MainLayout

メインレイアウト（サイドバー + コンテンツ）です。

**ファイル**: `src/components/layout/MainLayout.tsx`

```tsx
import { MainLayout } from '../components/layout';

<MainLayout>
  <Routes>
    {/* ルーティング */}
  </Routes>
</MainLayout>
```

---

### Sidebar

サイドバーナビゲーションです。

**ファイル**: `src/components/layout/Sidebar.tsx`

サイドバーの開閉状態は `SidebarContext` で管理されています。

```tsx
import { useSidebarContext } from '../contexts/SidebarContext';

const { isOpen, toggle } = useSidebarContext();
```

---

## コンポーネント階層

```
App
└── MainLayout
    ├── Sidebar
    └── Routes
        ├── BidListPage
        │   ├── BidListHeader
        │   │   ├── FilterOptionButton
        │   │   └── SelectAllButton
        │   ├── カード形式レイアウト
        │   │   ├── DataGrid
        │   │   └── 右パネル（詳細プレビュー）
        │   ├── CustomPagination
        │   └── FilterModal / DisplayConditionsPanel
        ├── BidDetailPage
        │   ├── DetailHeader
        │   ├── WorkflowStepper
        │   └── WorkflowSection
        │       ├── JudgmentSection
        │       ├── OrdererWorkflowSection
        │       │   └── ContactInfo
        │       ├── PartnerSection
        │       │   ├── ContactInfo
        │       │   └── ContactActions
        │       ├── RequestSection
        │       └── AwardSection
        ├── AnnouncementListPage / AnnouncementDetailPage
        ├── PartnerListPage（会社情報一覧）
        │   ├── カード形式レイアウト
        │   │   ├── DataGrid
        │   │   └── 右パネル
        │   └── CustomPagination
        ├── PartnerDetailPage（会社情報詳細）
        │   ├── DetailPageHeader
        │   ├── SectionCard
        │   └── DetailInfoRow
        ├── OrdererListPage / OrdererDetailPage
        └── AnalyticsPage
```
