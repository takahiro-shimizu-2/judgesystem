import type { BidType } from '../types/announcement';

/**
 * 入札形式の表示設定
 */
export const bidTypeConfig: Record<BidType, {
  label: string;
  color: string;
  bgColor: string;
}> = {
  open_competitive: { label: '一般競争入札', color: '#2563eb', bgColor: '#eff6ff' },
  planning_competition: { label: '企画競争', color: '#7c3aed', bgColor: '#f5f3ff' },
  designated_competitive: { label: '指名競争入札', color: '#0891b2', bgColor: '#ecfeff' },
  document_request: { label: '資料提供招請', color: '#059669', bgColor: '#ecfdf5' },
  opinion_request: { label: '意見招請', color: '#65a30d', bgColor: '#f7fee7' },
  negotiated_contract: { label: '随意契約', color: '#ea580c', bgColor: '#fff7ed' },
  open_counter: { label: '見積(オープンカウンター)', color: '#d97706', bgColor: '#fffbeb' },
  unknown: { label: 'その他・不明', color: '#64748b', bgColor: '#f1f5f9' },
  preferred_designation: { label: '希望制指名競争入札', color: '#0d9488', bgColor: '#f0fdfa' },
  other: { label: 'その他入札', color: '#71717a', bgColor: '#f4f4f5' },
};

/**
 * 入札形式のラベル一覧（配列）
 */
export const bidTypes: BidType[] = [
  'open_competitive',
  'planning_competition',
  'designated_competitive',
  'document_request',
  'opinion_request',
  'negotiated_contract',
  'open_counter',
  'unknown',
  'preferred_designation',
  'other',
];
