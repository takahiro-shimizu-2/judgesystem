/**
 * DataGrid関連の定数
 */

/** 列フィールドのラベル名マッピング */
export const COLUMN_FIELD_LABELS: Record<string, string> = {
  evaluationNo: 'No',
  title: '公告名',
  company: '企業名',
  branch: '拠点',
  organization: '発注機関',
  category: 'カテゴリ',
  deadline: '締切日',
  evaluatedAt: '判定日',
} as const;

/** フィルター演算子のラベルマッピング */
export const OPERATOR_LABELS: Record<string, string> = {
  contains: '含む',
  equals: '=',
  startsWith: '始まる',
  endsWith: '終わる',
  isEmpty: '空',
  isNotEmpty: '空でない',
} as const;

/** フィルター演算子の型 */
export type GridFilterOperator = 'contains' | 'equals' | 'startsWith' | 'endsWith' | 'isEmpty' | 'isNotEmpty';

/** 列フィルター項目の型 */
export interface ColumnFilterItem {
  value: string;
  operator: GridFilterOperator;
}

/** フィルター演算子オプション（UI用） */
export const FILTER_OPERATOR_OPTIONS: { value: GridFilterOperator; label: string }[] = [
  { value: 'contains', label: '含む' },
  { value: 'equals', label: '等しい' },
  { value: 'startsWith', label: '始まる' },
  { value: 'endsWith', label: '終わる' },
  { value: 'isEmpty', label: '空' },
  { value: 'isNotEmpty', label: '空でない' },
];

/** デフォルトの列フィルター設定 */
export const DEFAULT_COLUMN_FILTERS: Record<string, ColumnFilterItem> = {
  title: { value: '', operator: 'contains' },
  company: { value: '', operator: 'contains' },
  organization: { value: '', operator: 'contains' },
  category: { value: '', operator: 'contains' },
  deadline: { value: '', operator: 'contains' },
  evaluatedAt: { value: '', operator: 'contains' },
};
