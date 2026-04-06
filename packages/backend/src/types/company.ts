/**
 * Company domain types for Repository layer return values.
 *
 * These types match the actual query results produced by CompanyRepository,
 * eliminating the use of `any` in method signatures.
 */

// ---------------------------------------------------------------------------
// Shared sub-types
// ---------------------------------------------------------------------------

/** A category assigned to a company (group may be null). */
export interface CompanyCategory {
  group: string | null;
  name: string;
}

/** A branch / office belonging to a company. */
export interface CompanyBranch {
  name: string;
  address: string;
}

/** A past project (evaluation) linked to a company. */
export interface CompanyPastProject {
  evaluationId: string;
  announcementId: string;
  announcementNo: number | null;
  announcementTitle: string;
  branchName: string;
  workStatus: string;
  evaluationStatus: string;
  priority: number | null;
  bidType: string;
  category: string;
  prefecture: string;
  publishDate: string;
  deadline: string;
  evaluatedAt: string;
  organization: string;
}

/** A unified qualification entry. */
export interface UnifiedQualification {
  mainCategory: string;
  category: string;
  region: string;
  value: string;
  grade: string;
}

/** A single orderer-specific qualification item. */
export interface OrdererQualificationItem {
  category: string;
  region: string;
  value: string;
  grade: string;
}

/** An orderer with its qualification items. */
export interface OrdererQualification {
  ordererName: string;
  items: OrdererQualificationItem[];
}

/** Qualifications block containing both unified and orderer-specific data. */
export interface CompanyQualifications {
  unified: UnifiedQualification[];
  orderers: OrdererQualification[];
}

// ---------------------------------------------------------------------------
// findWithFilters — list summary (minimal fields)
// ---------------------------------------------------------------------------

/** Row returned by `CompanyRepository.findWithFilters`. */
export interface CompanyListSummary {
  id: string;
  no: number;
  name: string;
  address: string;
  phone: string;
  surveyCount: number | null;
  rating: number | null;
  resultCount: number | null;
  hasPrimeQualification: boolean;
  categories: CompanyCategory[];
}

// ---------------------------------------------------------------------------
// findAll / findById — full detail
// ---------------------------------------------------------------------------

/** Row returned by `CompanyRepository.findAll` / `findById`. */
export interface CompanyDetail {
  id: string;
  no: number;
  name: string;
  postalCode: string;
  address: string;
  phone: string;
  fax: string;
  email: string;
  url: string;
  surveyCount: number | null;
  rating: number | null;
  resultCount: number | null;
  representative: string;
  established: string;
  capital: number | null;
  employeeCount: number | null;
  categories: CompanyCategory[];
  pastProjects: CompanyPastProject[];
  branches: CompanyBranch[];
  qualifications: CompanyQualifications;
}
