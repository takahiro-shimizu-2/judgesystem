/**
 * API設定
 *
 * 環境変数 VITE_API_URL でバックエンドのベースURLを設定
 * - ローカル開発: VITE_API_URL が未設定の場合は http://localhost:8080 を使用
 * - 本番環境: デプロイ時に VITE_API_URL を設定
 */

export const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080';

/**
 * APIエンドポイントのURL取得ヘルパー関数
 * @param path - APIパス (例: '/api/evaluations')
 * @returns 完全なURL
 */
export const getApiUrl = (path: string): string => {
  // pathが既に絶対URLの場合はそのまま返す
  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path;
  }

  // 先頭のスラッシュを除去してベースURLと結合
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `${API_BASE_URL}${cleanPath}`;
};
