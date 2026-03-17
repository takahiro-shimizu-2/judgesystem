/**
 * 入札案件一覧ページの状態管理フック（サーバーサイドページネーション対応）
 */
import { useState, useCallback, useEffect, useRef } from 'react';
import type { GridFilterModel, GridSortModel, GridPaginationModel } from '@mui/x-data-grid';
import type { AnnouncementFilterState } from '../components/announcement';

// ローカルストレージのキー
const STORAGE_KEYS = {
  FILTERS: 'announcementlist-filters',
  GRID_FILTER: 'announcementlist-grid-filter',
  SEARCH: 'announcementlist-search',
  SORT: 'announcementlist-sort',
  PAGE: 'announcementlist-page',
} as const;

// デフォルト値
const DEFAULT_FILTERS: AnnouncementFilterState = {
  statuses: [],
  bidTypes: [],
  categories: [],
  prefectures: [],
  organizations: [],
};

const DEFAULT_SORT: GridSortModel = [];
const DEFAULT_PAGINATION: GridPaginationModel = { pageSize: 25, page: 0 };

/**
 * localStorage から安全に値を読み込む
 */
function loadFromStorage<T>(key: string, defaultValue: T): T {
  try {
    const saved = localStorage.getItem(key);
    if (saved) return JSON.parse(saved);
  } catch {
    /* ignore */
  }
  return defaultValue;
}

/**
 * localStorage に値を保存
 */
function saveToStorage(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}

/**
 * API からデータを取得
 */
async function fetchAnnouncements(params: {
  page: number;
  pageSize: number;
  filters: AnnouncementFilterState;
  searchQuery: string;
  sortModel: GridSortModel;
}): Promise<{ data: any[]; total: number }> {
  const { page, pageSize, filters, searchQuery, sortModel } = params;

  // クエリパラメータを構築
  const queryParams = new URLSearchParams();
  queryParams.append('page', page.toString());
  queryParams.append('pageSize', pageSize.toString());

  // フィルター
  if (filters.statuses.length > 0) {
    queryParams.append('statuses', filters.statuses.join(','));
  }
  if (filters.bidTypes.length > 0) {
    queryParams.append('bidTypes', filters.bidTypes.join(','));
  }
  if (filters.categories.length > 0) {
    queryParams.append('categories', filters.categories.join(','));
  }
  if (filters.organizations.length > 0) {
    queryParams.append('organizations', filters.organizations.join(','));
  }
  if (filters.prefectures.length > 0) {
    queryParams.append('prefectures', filters.prefectures.join(','));
  }

  // 検索
  if (searchQuery.trim()) {
    queryParams.append('searchQuery', searchQuery.trim());
  }

  // ソート
  if (sortModel.length > 0) {
    const sort = sortModel[0];
    queryParams.append('sortField', sort.field);
    queryParams.append('sortOrder', sort.sort || 'asc');
  }

  const response = await fetch(`https://bidapp-backend-postgres-50843898931.asia-northeast1.run.app/api/announcements?${queryParams.toString()}`);
  if (!response.ok) {
    const errorText = await response.text();
    console.error('API Error:', response.status, errorText);
    throw new Error(`Failed to fetch announcements: ${response.status} - ${errorText}`);
  }

  const result = await response.json();
  console.log('Announcements API Response:', result);
  return result;
}

/**
 * 入札案件一覧の状態管理フック
 */
export function useAnnouncementListState() {
  // 検索クエリ
  const [searchQuery, setSearchQuery] = useState(() =>
    loadFromStorage(STORAGE_KEYS.SEARCH, '')
  );

  // カスタムフィルター
  const [filters, setFilters] = useState<AnnouncementFilterState>(() => {
    const saved = loadFromStorage<Partial<AnnouncementFilterState>>(STORAGE_KEYS.FILTERS, {});
    return { ...DEFAULT_FILTERS, ...saved };
  });

  // DataGridの列フィルター
  const [gridFilterModel, setGridFilterModel] = useState<GridFilterModel>(() =>
    loadFromStorage(STORAGE_KEYS.GRID_FILTER, { items: [] })
  );

  // ソートモデル
  const [sortModel, setSortModel] = useState<GridSortModel>(() =>
    loadFromStorage(STORAGE_KEYS.SORT, DEFAULT_SORT)
  );

  // ページネーションモデル
  const [paginationModel, setPaginationModel] = useState<GridPaginationModel>(() =>
    loadFromStorage(STORAGE_KEYS.PAGE, DEFAULT_PAGINATION)
  );

  // データ取得状態
  const [rows, setRows] = useState<any[]>([]);
  const [rowCount, setRowCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 前回の値を追跡（実際に値が変わった時のみページリセット）
  const prevSearchQuery = useRef(searchQuery);
  const prevFilters = useRef(filters);
  const isMounted = useRef(false);

  // データ取得
  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchAnnouncements({
        page: paginationModel.page,
        pageSize: paginationModel.pageSize,
        filters,
        searchQuery,
        sortModel,
      });
      setRows(result.data);
      setRowCount(result.total);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      setError(errorMessage);
      console.error('Failed to load announcements:', err);
    } finally {
      setLoading(false);
    }
  }, [paginationModel, filters, searchQuery, sortModel]);

  // 初回ロードとフィルター/ソート変更時にデータ取得
  useEffect(() => {
    loadData();
  }, [loadData]);

  // 初回マウント完了フラグをセット
  useEffect(() => {
    isMounted.current = true;
  }, []);

  // 検索クエリの永続化 & ページリセット
  useEffect(() => {
    saveToStorage(STORAGE_KEYS.SEARCH, searchQuery);
    // 初回マウント後、実際に値が変わった時のみページリセット
    if (isMounted.current && prevSearchQuery.current !== searchQuery) {
      prevSearchQuery.current = searchQuery;
      setPaginationModel(prev => prev.page !== 0 ? { ...prev, page: 0 } : prev);
    }
    prevSearchQuery.current = searchQuery;
  }, [searchQuery]);

  // フィルターの永続化 & ページリセット
  useEffect(() => {
    saveToStorage(STORAGE_KEYS.FILTERS, filters);
    // 初回マウント後、実際に値が変わった時のみページリセット
    if (isMounted.current && prevFilters.current !== filters) {
      prevFilters.current = filters;
      setPaginationModel(prev => prev.page !== 0 ? { ...prev, page: 0 } : prev);
    }
    prevFilters.current = filters;
  }, [filters]);

  // localStorage同期
  useEffect(() => {
    saveToStorage(STORAGE_KEYS.GRID_FILTER, gridFilterModel);
  }, [gridFilterModel]);

  useEffect(() => {
    saveToStorage(STORAGE_KEYS.SORT, sortModel);
  }, [sortModel]);

  useEffect(() => {
    saveToStorage(STORAGE_KEYS.PAGE, paginationModel);
  }, [paginationModel]);

  // フィルター適用
  const applyFilters = useCallback((newFilters: AnnouncementFilterState) => {
    setFilters(newFilters);
  }, []);

  // GridFilterModel適用
  const applyGridFilter = useCallback((model: GridFilterModel) => {
    setGridFilterModel(model);
  }, []);

  // 検索クエリ更新
  const updateSearchQuery = useCallback((query: string) => {
    setSearchQuery(query);
  }, []);

  // ソートモデル更新
  const updateSortModel = useCallback((model: GridSortModel) => {
    setSortModel(model);
  }, []);

  // ページネーションモデル更新
  const updatePaginationModel = useCallback((model: GridPaginationModel) => {
    setPaginationModel(model);
  }, []);

  // フィルタークリア
  const clearFilters = useCallback(() => {
    setFilters(DEFAULT_FILTERS);
    setGridFilterModel({ items: [] });
    setSearchQuery('');
    setSortModel(DEFAULT_SORT);
  }, []);

  return {
    // データ
    rows,
    rowCount,
    loading,
    error,

    // フィルター状態
    filters,
    gridFilterModel,
    searchQuery,

    // ソート・ページング
    sortModel,
    paginationModel,

    // アクション
    applyFilters,
    applyGridFilter,
    updateSearchQuery,
    updateSortModel,
    updatePaginationModel,
    clearFilters,
    refreshData: loadData,
  };
}
