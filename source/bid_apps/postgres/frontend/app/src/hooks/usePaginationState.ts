/**
 * ページネーション状態管理フック
 * サーバーサイドページネーション対応、localStorage永続化、ナビゲーション追跡を含む
 */
import { useState, useCallback, useEffect } from 'react';
import type { GridPaginationModel } from '@mui/x-data-grid';
import { loadFromStorage, saveToStorage } from './useFilterState';

// ナビゲーション追跡用のsessionStorageキー
const NAV_TRACKING_KEY = 'lastVisitedPath';

// ローカルストレージのキー
const STORAGE_KEY_PAGE = 'bidlist-page';

// デフォルト値
const DEFAULT_PAGINATION: GridPaginationModel = { pageSize: 25, page: 0 };

/**
 * 詳細ページから戻ってきたかどうかを判定
 */
function isReturningFromDetail(): boolean {
  try {
    const lastPath = sessionStorage.getItem(NAV_TRACKING_KEY);
    return lastPath ? /^\/detail\//.test(lastPath) : false;
  } catch {
    return false;
  }
}

/**
 * ページネーション状態管理フック
 */
export function usePaginationState() {
  // ページネーション（詳細から戻った場合のみ復元、それ以外は0ページ目から）
  const [paginationModel, setPaginationModel] = useState<GridPaginationModel>(() => {
    const saved = loadFromStorage(STORAGE_KEY_PAGE, DEFAULT_PAGINATION);
    if (isReturningFromDetail()) {
      return saved;
    }
    return { ...saved, page: 0 };
  });

  // 現在のパスを記録（他の一覧から来た場合のページリセット用）
  useEffect(() => {
    try {
      sessionStorage.setItem(NAV_TRACKING_KEY, '/');
    } catch { /* ignore */ }
  }, [paginationModel]);

  // ページネーションの変更ハンドラ
  const handlePaginationModelChange = useCallback((model: GridPaginationModel) => {
    setPaginationModel(model);
    saveToStorage(STORAGE_KEY_PAGE, model);
  }, []);

  return {
    paginationModel,
    setPaginationModel,
    handlePaginationModelChange,
  };
}
