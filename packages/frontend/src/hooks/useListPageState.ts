/**
 * リストページ共通の状態管理フック
 * Partner, Company, Orderer, AnnouncementListPage で使用
 */
import { useState, useCallback, useMemo, useEffect } from 'react';
import type { GridPaginationModel } from '@mui/x-data-grid';
import { useSidebar } from '../contexts/SidebarContext';

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

/** フック設定オプション */
export interface UseListPageStateOptions<T> {
  /** 検索対象のフィールド名（キーのパス） */
  searchFields: (keyof T | ((item: T) => string))[];
  /** 初期ページサイズ（デフォルト: 25） */
  defaultPageSize?: number;
  /** localStorageのキープレフィックス（指定すると状態が永続化される） */
  storageKey?: string;
}

/** フック戻り値 */
export interface UseListPageStateReturn<T> {
  // 状態
  searchQuery: string;
  paginationModel: GridPaginationModel;
  gridKey: number;
  rows: T[];

  // ハンドラ
  handleSearchChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handlePaginationModelChange: (model: GridPaginationModel) => void;
}

/**
 * リストページ共通フック
 * @param data - 元データ配列
 * @param options - フックオプション
 */
export function useListPageState<T>(
  data: T[],
  options: UseListPageStateOptions<T>
): UseListPageStateReturn<T> {
  const { searchFields, defaultPageSize = 25, storageKey } = options;

  // ストレージキー
  const searchStorageKey = storageKey ? `${storageKey}-search` : null;
  const pageStorageKey = storageKey ? `${storageKey}-page` : null;

  // 検索クエリ（永続化対応）
  const [searchQuery, setSearchQuery] = useState(() =>
    searchStorageKey ? loadFromStorage(searchStorageKey, '') : ''
  );

  // ページネーション（永続化対応）
  const [paginationModel, setPaginationModel] = useState<GridPaginationModel>(() =>
    pageStorageKey
      ? loadFromStorage(pageStorageKey, { page: 0, pageSize: defaultPageSize })
      : { page: 0, pageSize: defaultPageSize }
  );

  // DataGridの再レンダリング用キー
  const [gridKey, setGridKey] = useState(0);

  // サイドバー状態
  const { isOpen } = useSidebar();

  // サイドバー開閉時にDataGridを再レンダリング（幅調整）
  useEffect(() => {
    const timer = setTimeout(() => {
      setGridKey((prev) => prev + 1);
    }, 220); // アニメーション完了後
    return () => clearTimeout(timer);
  }, [isOpen]);

  // ウィンドウリサイズ時にDataGridを再レンダリング（幅調整）
  useEffect(() => {
    let resizeTimer: ReturnType<typeof setTimeout>;
    const handleResize = () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        setGridKey((prev) => prev + 1);
      }, 200);
    };
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      clearTimeout(resizeTimer);
    };
  }, []);

  // フィルタリング済みデータ
  const rows = useMemo(() => {
    if (!searchQuery.trim()) {
      return data;
    }

    const query = searchQuery.toLowerCase();
    return data.filter((item) =>
      searchFields.some((field) => {
        // 関数の場合は実行して値を取得
        if (typeof field === 'function') {
          return field(item).toLowerCase().includes(query);
        }
        // フィールド名の場合はそのプロパティを取得
        const value = item[field];
        if (typeof value === 'string') {
          return value.toLowerCase().includes(query);
        }
        if (Array.isArray(value)) {
          return value.some((v) =>
            typeof v === 'string' && v.toLowerCase().includes(query)
          );
        }
        return false;
      })
    );
  }, [data, searchQuery, searchFields]);

  // 検索ハンドラ
  const handleSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      setSearchQuery(value);
      if (searchStorageKey) {
        saveToStorage(searchStorageKey, value);
      }
      // 検索時はページを先頭に戻す
      const newPagination = { page: 0, pageSize: paginationModel.pageSize };
      setPaginationModel(newPagination);
      if (pageStorageKey) {
        saveToStorage(pageStorageKey, newPagination);
      }
    },
    [searchStorageKey, pageStorageKey, paginationModel.pageSize]
  );

  // ページネーションハンドラ
  const handlePaginationModelChange = useCallback(
    (model: GridPaginationModel) => {
      setPaginationModel(model);
      if (pageStorageKey) {
        saveToStorage(pageStorageKey, model);
      }
    },
    [pageStorageKey]
  );

  return {
    searchQuery,
    paginationModel,
    gridKey,
    rows,
    handleSearchChange,
    handlePaginationModelChange,
  };
}
