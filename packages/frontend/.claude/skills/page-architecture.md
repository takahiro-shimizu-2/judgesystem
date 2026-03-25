# Page Architecture

ページ構造のパターンと設計原則。

## 1. ページの基本構造

### 共通レイアウト

```tsx
<MainLayout>           {/* サイドバー + メインエリア */}
  <PageComponent />    {/* 各ページ */}
</MainLayout>
```

### ページコンテナ

```tsx
<Box sx={{
  minHeight: '100vh',
  backgroundColor: colors.page.background,  // 統一された背景色
  display: 'flex',
  flexDirection: 'column',
}}>
  {/* ページコンテンツ */}
</Box>
```

## 2. 一覧ページパターン

### パターンA: テーブル形式（DataGrid）

シンプルなデータ表示向け。

```tsx
function ListPage() {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [paginationModel, setPaginationModel] = useState({ page: 0, pageSize: 25 });

  const filteredRows = useMemo(() => {
    return data.filter(item => matchesSearch(item, searchQuery));
  }, [data, searchQuery]);

  return (
    <Box sx={{ height: '100vh', display: 'flex', flexDirection: 'column', bgcolor: colors.page.background }}>
      <Box sx={{ flex: 1, p: { xs: 1.5, sm: 2, md: 3 }, minHeight: 0 }}>
        <Paper sx={{ height: '100%', display: 'flex', flexDirection: 'column', borderRadius: borderRadius.xs }}>
          {/* ヘッダー */}
          <Box sx={{ px: 3, py: 2, borderBottom: `1px solid ${colors.border.main}` }}>
            <Typography variant="h5" sx={{ fontWeight: 700 }}>ページタイトル</Typography>
            <TextField placeholder="検索..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
          </Box>

          {/* DataGrid */}
          <DataGrid
            rows={filteredRows}
            columns={columns}
            paginationModel={paginationModel}
            onPaginationModelChange={setPaginationModel}
            onRowClick={params => navigate(`/detail/${params.row.id}`)}
            sx={dataGridStyles}
          />

          {/* ページネーション */}
          <CustomPagination {...paginationProps} />
        </Paper>
      </Box>
    </Box>
  );
}
```

### パターンB: カード形式 + サイドパネル

リッチな情報表示向け。

```tsx
function ListPage() {
  const navigate = useNavigate();
  const { rightPanelOpen, toggleRightPanel } = useSidebar();
  const listContainerRef = useRef<HTMLDivElement>(null);

  // 状態管理
  const [searchQuery, setSearchQuery] = useState('');
  const [sortModel, setSortModel] = useState([]);
  const [filters, setFilters] = useState(initialFilters);
  const [paginationModel, setPaginationModel] = useState({ page: 0, pageSize: 25 });

  // データ処理
  const filteredData = useMemo(() => applyFilters(data, filters, searchQuery), [data, filters, searchQuery]);
  const sortedData = useMemo(() => applySort(filteredData, sortModel), [filteredData, sortModel]);
  const paginatedData = useMemo(() => paginate(sortedData, paginationModel), [sortedData, paginationModel]);

  // ページ変更時スクロールリセット
  useEffect(() => {
    listContainerRef.current?.scrollTo(0, 0);
  }, [paginationModel.page]);

  return (
    <Box sx={{ display: 'flex', height: '100%', bgcolor: colors.page.background }}>
      {/* メインエリア */}
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', p: { xs: 1.5, md: 3 } }}>
        <Paper sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* ヘッダー + アクティブフィルター */}
          <Box sx={{ px: 3, py: 2.5, borderBottom: `2px solid ${colors.border.dark}` }}>
            <Typography variant="h5" sx={{ fontWeight: 700 }}>ページタイトル</Typography>
            {hasActiveFilters && <FilterChips filters={filters} onClear={handleClear} />}
          </Box>

          {/* カードリスト */}
          <Box ref={listContainerRef} sx={{ flex: 1, overflow: 'auto', py: 2, bgcolor: colors.background.hover }}>
            {paginatedData.map(item => (
              <ItemCard key={item.id} item={item} onClick={() => navigate(`/detail/${item.id}`)} />
            ))}
            {paginatedData.length === 0 && <EmptyState message="該当するデータがありません" />}
          </Box>

          {/* ページネーション */}
          <CustomPagination {...paginationProps} />
        </Paper>
      </Box>

      {/* 右サイドパネル（フィルター・ソート） */}
      <RightSidePanel open={rightPanelOpen} onToggle={toggleRightPanel}>
        <FilterPanel
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          sortModel={sortModel}
          onSortChange={setSortModel}
          filters={filters}
          onFilterChange={setFilters}
        />
      </RightSidePanel>
    </Box>
  );
}
```

## 3. 詳細ページパターン

### パターンA: タブ付き詳細ページ

複数のコンテンツセクションを持つ場合。

```tsx
function DetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState(0);

  const item = findById(id);

  if (!item) {
    return <NotFoundView message="データが見つかりません" onBack={() => navigate('/list')} />;
  }

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: colors.page.background, display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ p: { xs: 1.5, md: 3 }, flex: 1, display: 'flex', flexDirection: 'column' }}>
        {/* ヘッダー */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
          <Box sx={{ pl: 2, borderLeft: '4px solid', borderColor: colors.accent.blue }}>
            <BackButton onClick={() => navigate('/list')} />
            <Typography sx={{ fontWeight: 700, fontSize: '1.5rem' }}>{item.title}</Typography>
          </Box>
          <Box sx={{ textAlign: 'right' }}>
            <Typography sx={{ color: colors.text.light }}>No. {item.no}</Typography>
            <Typography sx={{ fontWeight: 700, color: colors.accent.blue }}>{item.count}件</Typography>
          </Box>
        </Box>

        {/* メインカード */}
        <Paper sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* タブ */}
          <Tabs value={activeTab} onChange={(_, v) => setActiveTab(v)}>
            <Tab label="基本情報" />
            <Tab label={`関連データ (${item.related.length})`} />
          </Tabs>

          {/* タブコンテンツ */}
          <Box sx={{ flex: 1, overflow: 'auto', bgcolor: colors.background.hover }}>
            {activeTab === 0 && <BasicInfoTab item={item} />}
            {activeTab === 1 && <RelatedDataTab items={item.related} />}
          </Box>
        </Paper>
      </Box>

      <FloatingBackButton onClick={() => navigate('/list')} />
      <ScrollToTopButton />
    </Box>
  );
}
```

### パターンB: 2カラムレイアウト

情報を左右に分割して表示。

```tsx
function DetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  const item = findById(id);

  if (!item) {
    return <NotFoundView message="データが見つかりません" onBack={() => navigate('/list')} />;
  }

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: colors.page.background }}>
      {/* ヘッダー */}
      <Box sx={{ px: 3, py: 2 }}>
        <BackButton onClick={() => navigate('/list')} />
        <Typography variant="h6" sx={{ fontWeight: 700 }}>{item.title}</Typography>
      </Box>

      {/* コンテンツ（2カラム） */}
      <Box sx={{ px: 3, pb: 3 }}>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1.6fr 1fr' }, gap: 3 }}>
          {/* 左カラム */}
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <SectionCard title="基本情報">
              <InfoRow label="名前" value={item.name} />
              <InfoRow label="住所" value={item.address} />
            </SectionCard>

            <SectionCard title="詳細">
              {/* 詳細コンテンツ */}
            </SectionCard>
          </Box>

          {/* 右カラム */}
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <SectionCard title="ステータス">
              {/* ステータス情報 */}
            </SectionCard>

            <SectionCard title="スケジュール">
              <ScheduleItem label="開始日" date={item.startDate} />
              <ScheduleItem label="終了日" date={item.endDate} />
            </SectionCard>
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
```

## 4. 状態管理パターン

### 一覧ページの状態

```tsx
// 基本状態
const [searchQuery, setSearchQuery] = useState('');
const [paginationModel, setPaginationModel] = useState({ page: 0, pageSize: 25 });

// ソート・フィルター（必要に応じて）
const [sortModel, setSortModel] = useState<SortModel>([]);
const [filters, setFilters] = useState<FilterState>(initialFilters);

// 派生データ（useMemoで計算）
const filteredData = useMemo(() => ..., [data, filters, searchQuery]);
const sortedData = useMemo(() => ..., [filteredData, sortModel]);
const paginatedData = useMemo(() => ..., [sortedData, paginationModel]);
```

### フィルター状態の設計

```tsx
interface FilterState {
  // 複数選択
  categories: string[];
  statuses: string[];

  // 単一選択（'all' | 'yes' | 'no'）
  hasQualification: 'all' | 'yes' | 'no';

  // 範囲
  dateRange?: { start: string; end: string };
}

const initialFilters: FilterState = {
  categories: [],
  statuses: [],
  hasQualification: 'all',
};
```

### アクティブフィルター数の計算

```tsx
const activeFilterCount = useMemo(() => {
  return (
    filters.categories.length +
    filters.statuses.length +
    (filters.hasQualification !== 'all' ? 1 : 0) +
    (filters.dateRange ? 1 : 0)
  );
}, [filters]);
```

## 5. 検索・フィルタリング

### 日本語対応検索

```tsx
function matchesSearch(item: Item, query: string): boolean {
  if (!query.trim()) return true;
  const q = query.trim().toLowerCase();
  return (
    item.name.toLowerCase().includes(q) ||
    item.address.toLowerCase().includes(q) ||
    item.categories.some(c => c.toLowerCase().includes(q))
  );
}
```

### フィルタークリア

```tsx
const handleClearAll = useCallback(() => {
  setSearchQuery('');
  setSortModel([]);
  setFilters(initialFilters);
}, []);
```

## 6. ページネーション

### ページ変更時のスクロールリセット

```tsx
const listContainerRef = useRef<HTMLDivElement>(null);

useEffect(() => {
  if (listContainerRef.current) {
    listContainerRef.current.scrollTop = 0;
  }
}, [paginationModel.page]);
```

### ページネーションコンポーネント

```tsx
interface PaginationProps {
  page: number;
  pageSize: number;
  rowCount: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  pageSizeOptions?: number[];
}
```

## 7. DataGrid連携

### サイドバートグル時の再レンダリング

DataGridはコンテナサイズ変更時に再計算が必要。

```tsx
const { isOpen: sidebarOpen } = useSidebar();
const [gridKey, setGridKey] = useState(0);

useEffect(() => {
  // サイドバーアニメーション完了後に再レンダリング
  const timer = setTimeout(() => setGridKey(prev => prev + 1), 220);
  return () => clearTimeout(timer);
}, [sidebarOpen]);

<DataGrid key={gridKey} ... />
```

## 8. ルーティング構造

### 典型的なルート設計

```tsx
const routes = [
  { path: '/', element: <ListPage /> },
  { path: '/:id', element: <DetailPage /> },

  // ネストしたルート
  { path: '/items', element: <ItemListPage /> },
  { path: '/items/:id', element: <ItemDetailPage /> },

  // 機能別ルート
  { path: '/analytics', element: <AnalyticsPage /> },
  { path: '/settings', element: <SettingsPage /> },
];
```

### ナビゲーション

```tsx
// 詳細へ遷移
navigate(`/items/${id}`);

// 一覧へ戻る
navigate('/items');

// 相対パス
navigate('..');
```

## 9. ページコンポーネントのテンプレート

### 一覧ページテンプレート

```tsx
// templates/ListPageTemplate.tsx
interface ListPageTemplateProps<T> {
  title: string;
  searchPlaceholder: string;
  searchQuery: string;
  onSearchChange: (e: ChangeEvent<HTMLInputElement>) => void;
  columns: GridColDef[];
  rows: T[];
  onRowClick?: (params: GridRowParams<T>) => void;
  paginationModel: GridPaginationModel;
  onPaginationModelChange: (model: GridPaginationModel) => void;
  headerExtra?: ReactNode;
}

function ListPageTemplate<T extends { id: string | number }>({
  title,
  searchPlaceholder,
  ...props
}: ListPageTemplateProps<T>) {
  return (
    <Box sx={pageStyles.container}>
      <Box sx={pageStyles.contentArea}>
        <Paper sx={pageStyles.mainCard}>
          <Header title={title} searchPlaceholder={searchPlaceholder} {...props} />
          <DataGrid {...props} />
          <Pagination {...props} />
        </Paper>
      </Box>
    </Box>
  );
}
```

### カスタムフック

```tsx
// hooks/useListPageState.ts
function useListPageState<T>(data: T[], filterFn: (item: T, query: string) => boolean) {
  const { isOpen: sidebarOpen } = useSidebar();
  const [searchQuery, setSearchQuery] = useState('');
  const [paginationModel, setPaginationModel] = useState({ page: 0, pageSize: 25 });
  const [gridKey, setGridKey] = useState(0);

  // サイドバートグル対応
  useEffect(() => {
    const timer = setTimeout(() => setGridKey(prev => prev + 1), 220);
    return () => clearTimeout(timer);
  }, [sidebarOpen]);

  // フィルタリング
  const filteredRows = useMemo(() => {
    if (!searchQuery.trim()) return data;
    return data.filter(item => filterFn(item, searchQuery));
  }, [data, searchQuery, filterFn]);

  return {
    searchQuery,
    setSearchQuery,
    handleSearchChange: (e) => setSearchQuery(e.target.value),
    rows: filteredRows,
    paginationModel,
    handlePaginationChange: setPaginationModel,
    gridKey,
  };
}
```
