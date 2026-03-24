/**
 * 入札一覧ページの状態管理フック（サーバーサイドページネーション対応）
 * useFilterState と usePaginationState を統合し、APIデータ取得を行う
 */
import { useState, useEffect } from 'react';
import type { GridSortModel } from '@mui/x-data-grid';
import { extractPrefecture } from '../constants/prefectures';
import type { EvaluationStatus, FilterState } from '../types';
import { getApiUrl } from '../config/api';
import { useFilterState } from './useFilterState';
import { usePaginationState } from './usePaginationState';

// デフォルトステータス件数
const DEFAULT_STATUS_COUNTS: Record<EvaluationStatus, number> = {
  all_met: 0,
  other_only_unmet: 0,
  unmet: 0,
};

/**
 * API クエリパラメータにフィルターを追加
 */
function appendFilterParams(
  queryParams: URLSearchParams,
  filters: FilterState,
  options?: { includeStatuses?: boolean }
) {
  const includeStatuses = options?.includeStatuses ?? true;

  if (includeStatuses && filters.statuses.length > 0) {
    filters.statuses.forEach(s => queryParams.append('statuses', s));
  }
  if (filters.workStatuses.length > 0) {
    filters.workStatuses.forEach(s => queryParams.append('workStatuses', s));
  }
  if (filters.priorities.length > 0) {
    filters.priorities.forEach(s => queryParams.append('priorities', s.toString()));
  }
  if (filters.categories.length > 0) {
    filters.categories.forEach(s => queryParams.append('categories', s));
  }
  if (filters.bidTypes.length > 0) {
    filters.bidTypes.forEach(s => queryParams.append('bidTypes', s));
  }
  if (filters.organizations.length > 0) {
    filters.organizations.forEach(s => queryParams.append('organizations', s));
  }
  if (filters.prefectures.length > 0) {
    filters.prefectures.forEach(s => queryParams.append('prefectures', s));
  }
}

/**
 * API からデータを取得
 */
async function fetchEvaluations(params: {
  page: number;
  pageSize: number;
  filters: FilterState;
  searchQuery: string;
  sortModel: GridSortModel;
}): Promise<{ data: any[]; total: number }> {
  const { page, pageSize, filters, searchQuery, sortModel } = params;

  const queryParams = new URLSearchParams();
  queryParams.append('page', page.toString());
  queryParams.append('pageSize', pageSize.toString());

  appendFilterParams(queryParams, filters);

  if (searchQuery.trim()) {
    queryParams.append('searchQuery', searchQuery.trim());
  }

  if (sortModel.length > 0) {
    sortModel.forEach(sort => {
      queryParams.append('sortField', sort.field);
      queryParams.append('sortOrder', sort.sort || 'asc');
    });
  }

  const response = await fetch(getApiUrl(`/api/evaluations?${queryParams.toString()}`));
  if (!response.ok) {
    const errorText = await response.text();
    console.error('API Error:', response.status, errorText);
    throw new Error(`Failed to fetch evaluations: ${response.status} - ${errorText}`);
  }

  const result = await response.json();
  console.log('API Response:', result);
  return result;
}

/**
 * ステータス件数を取得
 */
async function fetchStatusCounts(params: {
  filters: FilterState;
  searchQuery: string;
}): Promise<Record<EvaluationStatus, number>> {
  const { filters, searchQuery } = params;
  const queryParams = new URLSearchParams();
  appendFilterParams(queryParams, filters, { includeStatuses: false });

  if (searchQuery.trim()) {
    queryParams.append('searchQuery', searchQuery.trim());
  }

  const response = await fetch(getApiUrl(`/api/evaluations/status-counts?${queryParams.toString()}`));
  if (!response.ok) {
    throw new Error(`Failed to fetch status counts: ${response.status}`);
  }

  const result = await response.json();
  return {
    all_met: Number(result?.all_met ?? 0),
    other_only_unmet: Number(result?.other_only_unmet ?? 0),
    unmet: Number(result?.unmet ?? 0),
  };
}

/**
 * 入札一覧の状態管理フック
 */
export function useBidListState() {
  // ページネーション状態
  const {
    paginationModel,
    setPaginationModel,
    handlePaginationModelChange,
  } = usePaginationState();

  // フィルタ状態
  const {
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
  } = useFilterState(setPaginationModel);

  // API状態
  const [rows, setRows] = useState<any[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusCounts, setStatusCounts] = useState<Record<EvaluationStatus, number>>(DEFAULT_STATUS_COUNTS);

  // データ取得
  useEffect(() => {
    let isCancelled = false;

    const loadData = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const result = await fetchEvaluations({
          page: paginationModel.page,
          pageSize: paginationModel.pageSize,
          filters,
          searchQuery,
          sortModel,
        });

        if (!isCancelled) {
          if (!result || !result.data || !Array.isArray(result.data)) {
            console.error('Invalid API response structure:', result);
            throw new Error('Invalid API response: data is not an array');
          }

          const mapped = result.data.map((e: any) => ({
            id: e.id,
            evaluationNo: e.evaluationNo,
            status: e.status,
            workStatus: e.workStatus,
            priority: e.company?.priority || 0,
            title: e.announcement?.title || '',
            company: e.company?.name || '',
            branch: e.branch?.name || '',
            organization: e.announcement?.organization || '',
            category: e.announcement?.category || '',
            bidType: e.announcement?.bidType,
            deadline: e.announcement?.deadline || '',
            evaluatedAt: e.evaluatedAt ? e.evaluatedAt.substring(0, 10) : '',
            prefecture: extractPrefecture(e.announcement?.workLocation || '') ?? '',
          }));

          setRows(mapped);
          setTotalCount(result.total);
        }
      } catch (err) {
        if (!isCancelled) {
          console.error('Failed to fetch evaluations:', err);
          setError(err instanceof Error ? err.message : 'Unknown error');
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    };

    loadData();

    return () => {
      isCancelled = true;
    };
  }, [paginationModel, filters, searchQuery, sortModel]);

  // ステータス件数の取得
  useEffect(() => {
    let isCancelled = false;

    const loadStatusCounts = async () => {
      try {
        const counts = await fetchStatusCounts({ filters, searchQuery });
        if (!isCancelled) {
          setStatusCounts(counts);
        }
      } catch (err) {
        console.error('Failed to fetch status counts:', err);
        if (!isCancelled) {
          setStatusCounts(DEFAULT_STATUS_COUNTS);
        }
      }
    };

    loadStatusCounts();

    return () => {
      isCancelled = true;
    };
  }, [filters, searchQuery]);

  return {
    // 状態
    searchQuery,
    filters,
    gridFilterModel,
    sortModel,
    paginationModel,
    showFilterModal,
    rows,
    filteredRows: rows,
    isLoading,
    error,
    totalCount,
    statusCounts,

    // フィルター件数
    activeFilterCount,
    columnFilterCount,
    totalFilterCount,

    // セッター
    setSearchQuery,
    setFilters,
    setShowFilterModal,

    // ハンドラ
    handleGridFilterChange,
    handleSortModelChange,
    handlePaginationModelChange,
    removeColumnFilter,
    clearAllFilters,
  };
}
