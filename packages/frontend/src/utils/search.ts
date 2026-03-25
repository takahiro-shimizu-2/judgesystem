/**
 * 日本語検索ユーティリティ
 * ひらがな・カタカナ・全角半角を同一視した検索機能を提供
 */

// カタカナ→ひらがな変換
export const katakanaToHiragana = (str: string): string => {
  return str.replace(/[\u30A1-\u30F6]/g, (match) =>
    String.fromCharCode(match.charCodeAt(0) - 0x60)
  );
};

// 全角英数字→半角変換
export const fullWidthToHalfWidth = (str: string): string => {
  return str.replace(/[\uFF01-\uFF5E]/g, (match) =>
    String.fromCharCode(match.charCodeAt(0) - 0xFEE0)
  ).replace(/\u3000/g, ' ');
};

// 正規化した文字列で検索（ひらがな・カタカナ・全角半角を統一）
export const normalizeForSearch = (str: string): string => {
  return katakanaToHiragana(fullWidthToHalfWidth(str)).toLowerCase();
};

// 日本語対応の部分一致検索
export const japaneseIncludes = (text: string, query: string): boolean => {
  if (!query) return true;
  return normalizeForSearch(text).includes(normalizeForSearch(query));
};

// 日本語対応の完全一致検索
export const japaneseEquals = (text: string, query: string): boolean => {
  if (!query) return true;
  return normalizeForSearch(text) === normalizeForSearch(query);
};

// 日本語対応の前方一致検索
export const japaneseStartsWith = (text: string, query: string): boolean => {
  if (!query) return true;
  return normalizeForSearch(text).startsWith(normalizeForSearch(query));
};

// 日本語対応の後方一致検索
export const japaneseEndsWith = (text: string, query: string): boolean => {
  if (!query) return true;
  return normalizeForSearch(text).endsWith(normalizeForSearch(query));
};
