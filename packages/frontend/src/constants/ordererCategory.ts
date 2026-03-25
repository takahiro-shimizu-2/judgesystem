import type { OrdererCategory } from '../types/orderer';

/**
 * 発注者カテゴリの表示設定
 */
export const ordererCategoryConfig: Record<OrdererCategory, {
  label: string;
  color: string;
  bgColor: string;
}> = {
  national: { label: '国', color: '#7c3aed', bgColor: '#f5f3ff' },
  prefecture: { label: '都道府県', color: '#2563eb', bgColor: '#eff6ff' },
  city: { label: '市区町村', color: '#16a34a', bgColor: '#f0fdf4' },
  other: { label: 'その他', color: '#64748b', bgColor: '#f1f5f9' },
};
