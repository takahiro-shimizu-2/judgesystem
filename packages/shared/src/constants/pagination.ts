/**
 * ページネーション関連の共通定数。
 *
 * バックエンド (repository / service) とフロントエンド (DataGrid) の
 * 両方で参照し、ハードコードの重複を排除する。
 */

/** 1ページあたりのデフォルト件数 */
export const DEFAULT_PAGE_SIZE = 25;

/** ページサイズ選択肢 (UI用) */
export const PAGE_SIZE_OPTIONS = [25, 50, 100] as const;
