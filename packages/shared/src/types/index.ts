export type EvaluationStatus = 'all_met' | 'other_only_unmet' | 'unmet';
export type WorkStatus = 'not_started' | 'in_progress' | 'completed';
export type AnnouncementStatus = 'upcoming' | 'ongoing' | 'awaiting_result' | 'closed';
export type BidType =
  | 'open_competitive'
  | 'planning_competition'
  | 'designated_competitive'
  | 'document_request'
  | 'opinion_request'
  | 'negotiated_contract'
  | 'open_counter'
  | 'unknown'
  | 'preferred_designation'
  | 'other';
export type PartnerStatus =
  | 'not_called'
  | 'unavailable'
  | 'waiting_documents'
  | 'waiting_response'
  | 'estimate_in_progress'
  | 'estimate_completed'
  | 'estimate_adopted';
export type OrdererCategory = 'national' | 'prefecture' | 'city' | 'other';
export type RequirementCategory = '欠格要件' | '所在地要件' | '等級要件' | '工事実績要件' | '技術者要件' | 'その他';
export type CompanyPriority = 1 | 2 | 3 | 4 | 5;

/**
 * ワークフローステップID型。
 * shared/src/constants/workflow.ts の WORKFLOW_STEP_IDS 値と一致する。
 */
export type CurrentStep = 'judgment' | 'orderer' | 'partner' | 'request' | 'award';

/**
 * ソートオプション（一覧APIの複数ソート条件用）。
 */
export interface SortOption {
  field: string;
  order: 'asc' | 'desc';
}

/**
 * 全ドメイン共通のページネーション・検索パラメータ。
 */
export interface BaseFilterParams {
  page?: number;
  pageSize?: number;
  searchQuery?: string;
  sortField?: string;
  sortOrder?: 'asc' | 'desc';
  sortOptions?: SortOption[];
}

/**
 * ページネーション付きレスポンス。
 */
export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}
