/**
 * 優先順位に関する定数
 */
import type { CompanyPriority } from '../types';

/** 優先順位の表示ラベル */
export const priorityLabels: Record<CompanyPriority, string> = {
  1: '優先度:最高',
  2: '優先度:高',
  3: '優先度:中',
  4: '優先度:低',
  5: '優先度:最低',
};

/** 優先順位の色設定（色相環: 赤→オレンジ→黄→緑→青） */
export const priorityColors: Record<
  CompanyPriority,
  { color: string; bgColor: string; borderColor: string; gradient: string }
> = {
  1: { color: '#dc2626', bgColor: '#fef2f2', borderColor: '#fecaca', gradient: '#dc2626' },
  2: { color: '#ea580c', bgColor: '#fff7ed', borderColor: '#fed7aa', gradient: '#ea580c' },
  3: { color: '#ca8a04', bgColor: '#fefce8', borderColor: '#fef08a', gradient: '#ca8a04' },
  4: { color: '#16a34a', bgColor: '#f0fdf4', borderColor: '#bbf7d0', gradient: '#16a34a' },
  5: { color: '#9ca3af', bgColor: '#f9fafb', borderColor: '#e5e7eb', gradient: '#9ca3af' },
};
