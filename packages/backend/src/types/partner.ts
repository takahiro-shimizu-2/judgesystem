/**
 * Partner domain types for Repository layer return values.
 *
 * These types match the actual query results produced by PartnerRepository,
 * eliminating the use of `any` in method signatures.
 */

// ---------------------------------------------------------------------------
// Shared sub-types
// ---------------------------------------------------------------------------

/** A category assigned to a partner (group may be null). */
export interface PartnerCategory {
  group: string | null;
  name: string;
}

/** A branch / office belonging to a partner. */
export interface PartnerBranch {
  name: string;
  address: string;
}

/** A past project (evaluation) linked to a partner. */
export interface PartnerPastProject {
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
export interface PartnerQualifications {
  unified: UnifiedQualification[];
  orderers: OrdererQualification[];
}

// ---------------------------------------------------------------------------
// findWithFilters — list summary (minimal fields)
// ---------------------------------------------------------------------------

/** Row returned by `PartnerRepository.findWithFilters`. */
export interface PartnerListSummary {
  id: string;
  no: number;
  name: string;
  address: string;
  phone: string;
  surveyCount: number | null;
  rating: number | null;
  resultCount: number | null;
  hasPrimeQualification: boolean;
  categories: PartnerCategory[];
}

// ---------------------------------------------------------------------------
// findAll / findById — full detail
// ---------------------------------------------------------------------------

/** Row returned by `PartnerRepository.findAll` / `findById`. */
export interface PartnerDetail {
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
  categories: PartnerCategory[];
  pastProjects: PartnerPastProject[];
  branches: PartnerBranch[];
  qualifications: PartnerQualifications;
}
