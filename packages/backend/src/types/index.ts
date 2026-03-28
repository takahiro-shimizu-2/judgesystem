export type { JsonValue } from "./json";
export type {
  PartnerCategory,
  PartnerBranch,
  PartnerPastProject,
  UnifiedQualification,
  OrdererQualificationItem,
  OrdererQualification,
  PartnerQualifications,
  PartnerListSummary,
  PartnerDetail,
} from "./partner";
export type {
  EvaluationListItem,
  EvaluationDetail,
  EvaluationWorkStatusResult,
  EvaluationStats,
} from "./evaluation";
export type {
  AnnouncementListItem,
  AnnouncementDetail,
  AnnouncementDocument,
  SubmissionDocument,
  ProgressingCompany,
  SimilarCase,
  DocumentFile,
} from "./announcement";

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
 * Evaluation-specific filter parameters.
 * Extends BaseFilterParams with evaluation domain fields.
 */
export interface EvaluationFilterParams extends BaseFilterParams {
  statuses?: string[];
  workStatuses?: string[];
  priorities?: string[];
  categories?: string[];
  bidTypes?: string[];
  organizations?: string[];
  prefectures?: string[];
  ordererId?: string;
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

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface WorkStatus {
  validStatuses: string[];
}
