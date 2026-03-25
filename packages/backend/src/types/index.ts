export interface SortOption {
  field: string;
  order: "asc" | "desc";
}

/**
 * Common pagination / sort fields shared by all domain filter params.
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
 * Backward-compatible alias. Existing code that imports FilterParams
 * continues to work without changes.
 */
export type FilterParams = EvaluationFilterParams;

/**
 * Announcement-specific filter parameters.
 */
export interface AnnouncementFilterParams extends BaseFilterParams {
  statuses?: string[];
  categories?: string[];
  bidTypes?: string[];
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
