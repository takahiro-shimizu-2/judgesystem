export interface SortOption {
  field: string;
  order: "asc" | "desc";
}

export interface FilterParams {
  page?: number;
  pageSize?: number;
  statuses?: string[];
  workStatuses?: string[];
  priorities?: string[];
  categories?: string[];
  bidTypes?: string[];
  organizations?: string[];
  prefectures?: string[];
  searchQuery?: string;
  sortField?: string;
  sortOrder?: "asc" | "desc";
  sortOptions?: SortOption[];
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
