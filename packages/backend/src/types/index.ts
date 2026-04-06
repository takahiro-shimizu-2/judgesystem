export type { JsonValue } from "./json";
export type {
  CompanyCategory,
  CompanyBranch,
  CompanyPastProject,
  UnifiedQualification,
  OrdererQualificationItem,
  OrdererQualification,
  CompanyQualifications,
  CompanyListSummary,
  CompanyDetail,
} from "./company";
export type {
  EvaluationListItem,
  EvaluationDetail,
  EvaluationWorkStatusResult,
  EvaluationStats,
} from "./evaluation";
export type { EvaluationCompanyCandidate } from "./evaluationCompanyCandidate";
export type {
  AnnouncementListItem,
  AnnouncementDetail,
  AnnouncementDocument,
  SubmissionDocument,
  ProgressingCompany,
  SimilarCase,
  DocumentFile,
} from "./announcement";

// ---------------------------------------------------------------------------
// Shared domain types (mirrored from @judgesystem/shared/src/types)
//
// These definitions MUST stay in sync with packages/shared/src/types/index.ts.
// They are duplicated here to avoid TS6059 rootDir errors when the shared
// package dist is not built.  Once the monorepo adopts project references
// (composite + references), replace these with re-exports from @judgesystem/shared.
// ---------------------------------------------------------------------------

export type EvaluationStatus = "all_met" | "other_only_unmet" | "unmet";
export type WorkStatus = "not_started" | "in_progress" | "completed";
export type AnnouncementStatus = "upcoming" | "ongoing" | "awaiting_result" | "closed";
export type BidType =
  | "open_competitive"
  | "planning_competition"
  | "designated_competitive"
  | "document_request"
  | "opinion_request"
  | "negotiated_contract"
  | "open_counter"
  | "unknown"
  | "preferred_designation"
  | "other";
export type CompanyStatus =
  | "not_called"
  | "unavailable"
  | "waiting_documents"
  | "waiting_response"
  | "estimate_in_progress"
  | "estimate_completed"
  | "estimate_adopted";
export type OrdererCategory = "national" | "prefecture" | "city" | "other";
export type RequirementCategory = "欠格要件" | "所在地要件" | "等級要件" | "工事実績要件" | "技術者要件" | "その他";
export type CompanyPriority = 1 | 2 | 3 | 4 | 5;

/** ワークフローステップID (shared の CurrentStep と同一) */
export type CurrentStep = "judgment" | "orderer" | "partner" | "request" | "award";

export interface SortOption {
  field: string;
  order: "asc" | "desc";
}

/**
 * Base filter parameters shared across all domains.
 * Contains pagination, search, and sort fields.
 */
export interface BaseFilterParams {
  page?: number;
  pageSize?: number;
  searchQuery?: string;
  sortField?: string;
  sortOrder?: "asc" | "desc";
  sortOptions?: SortOption[];
}

/**
 * Paginated response wrapper.
 */
export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}

/**
 * Evaluation-specific filter parameters.
 * Extends BaseFilterParams with evaluation domain fields.
 */
export interface EvaluationFilterParams extends BaseFilterParams {
  statuses?: string[];
  workStatuses?: string[];
  priorities?: string[];
  categories?: string[];
  categorySegments?: string[];
  categoryDetails?: string[];
  bidTypes?: string[];
  organizations?: string[];
  prefectures?: string[];
  ordererId?: string;
  officeIds?: string[];
}

/**
 * Backward-compatible alias for EvaluationFilterParams.
 * @deprecated Use EvaluationFilterParams directly.
 */
export type FilterParams = EvaluationFilterParams;

/**
 * Announcement-specific filter parameters.
 * Extends BaseFilterParams with announcement domain fields.
 */
export interface AnnouncementFilterParams extends BaseFilterParams {
  statuses?: string[];
  bidTypes?: string[];
  categories?: string[];
  categorySegments?: string[];
  categoryDetails?: string[];
  organizations?: string[];
  prefectures?: string[];
  ordererId?: string;
}
