/**
 * フィルタ状態管理フック
 * 検索クエリ、カスタムフィルター、DataGrid列フィルターの状態を管理
 */
import { useState, useCallback, useEffect, useRef } from 'react';
import type { GridFilterModel, GridSortModel, GridPaginationModel } from '@mui/x-data-grid';
import type { FilterState } from '../types';

// ローカルストレージのキー
const STORAGE_KEYS = {
  FILTERS: 'bidlist-filters',
  GRID_FILTER: 'bidlist-grid-filter',
  SEARCH: 'bidlist-search',
  SORT: 'bidlist-sort',
} as const;

// デフォルト値
const DEFAULT_FILTERS: FilterState = {
  statuses: [],
  workStatuses: [],
  priorities: [],
  categories: [],
  bidTypes: [],
  organizations: [],
  prefectures: [],
};

const DEFAULT_SORT: GridSortModel = [];

/**
 * localStorage から安全に値を読み込む
 */
export function loadFromStorage<T>(key: string, defaultValue: T): T {
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
export function saveToStorage(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}

/**
 * フィルタ状態管理フック
 */
export function useFilterState(setPaginationModel: React.Dispatch<React.SetStateAction<GridPaginationModel>>) {
  // 検索クエリ
  const [searchQuery, setSearchQuery] = useState(() =>
    loadFromStorage(STORAGE_KEYS.SEARCH, '')
  );

  // カスタムフィルター（ステータス/優先順位/工種/発注機関）
  const [filters, setFilters] = useState<FilterState>(() => {
    const saved = loadFromStorage<Partial<FilterState>>(STORAGE_KEYS.FILTERS, {});
    return { ...DEFAULT_FILTERS, ...saved };
  });

  // DataGridの列フィルター
  const [gridFilterModel, setGridFilterModel] = useState<GridFilterModel>(() =>
    loadFromStorage(STORAGE_KEYS.GRID_FILTER, { items: [] })
  );

  // ソート状態
  const [sortModel, setSortModel] = useState<GridSortModel>(() =>
    loadFromStorage(STORAGE_KEYS.SORT, DEFAULT_SORT)
  );

  // モーダル表示
  const [showFilterModal, setShowFilterModal] = useState(false);

  // 前回の値を追跡（実際に値が変わった時のみページリセット）
  const prevSearchQuery = useRef(searchQuery);
  const prevFilters = useRef(filters);

  // 検索クエリの永続化 & ページリセット
  useEffect(() => {
    saveToStorage(STORAGE_KEYS.SEARCH, searchQuery);
    if (prevSearchQuery.current !== searchQuery) {
      prevSearchQuery.current = searchQuery;
      setPaginationModel(prev => prev.page !== 0 ? { ...prev, page: 0 } : prev);
    }
  }, [searchQuery, setPaginationModel]);

  // フィルターの永続化 & ページリセット
  useEffect(() => {
    saveToStorage(STORAGE_KEYS.FILTERS, filters);
    if (prevFilters.current !== filters) {
      prevFilters.current = filters;
      setPaginationModel(prev => prev.page !== 0 ? { ...prev, page: 0 } : prev);
    }
  }, [filters, setPaginationModel]);

  // DataGrid列フィルターの変更ハンドラ
  const handleGridFilterChange = useCallback((model: GridFilterModel) => {
    setGridFilterModel(model);
    saveToStorage(STORAGE_KEYS.GRID_FILTER, model);
    setPaginationModel(prev => prev.page !== 0 ? { ...prev, page: 0 } : prev);
  }, [setPaginationModel]);

  // ソートの変更ハンドラ
  const handleSortModelChange = useCallback((model: GridSortModel) => {
    setSortModel(model);
    saveToStorage(STORAGE_KEYS.SORT, model);
    setPaginationModel(prev => prev.page !== 0 ? { ...prev, page: 0 } : prev);
  }, [setPaginationModel]);

  // フィルター件数
  const activeFilterCount =
    filters.statuses.length +
    filters.workStatuses.length +
    filters.priorities.length +
    filters.categories.length +
    filters.bidTypes.length +
    filters.organizations.length +
    filters.prefectures.length;

  const columnFilterCount = gridFilterModel.items.filter(
    item => item.value
  ).length;

  const totalFilterCount = activeFilterCount + columnFilterCount;

  // 列フィルター削除
  const removeColumnFilter = useCallback(
    (field: string) => {
      const newItems = gridFilterModel.items.filter(item => item.field !== field);
      handleGridFilterChange({ items: newItems });
    },
    [gridFilterModel, handleGridFilterChange]
  );

  // フィルター全クリア
  const clearAllFilters = useCallback(() => {
    setFilters(DEFAULT_FILTERS);
    handleGridFilterChange({ items: [] });
    setSearchQuery('');
    handleSortModelChange([]);
  }, [handleGridFilterChange, handleSortModelChange]);

  return {
    searchQuery,
    filters,
    gridFilterModel,
    sortModel,
    showFilterModal,
    activeFilterCount,
    columnFilterCount,
    totalFilterCount,
    setSearchQuery,
    setFilters,
    setShowFilterModal,
    handleGridFilterChange,
    handleSortModelChange,
    removeColumnFilter,
    clearAllFilters,
  };
}
