/**
 * Announcement domain types for Repository layer return values.
 *
 * These types match the actual query results produced by AnnouncementRepository,
 * eliminating the use of `any` in method signatures.
 */

import type { JsonValue } from "./json";

// ---------------------------------------------------------------------------
// findWithFilters — list item
// ---------------------------------------------------------------------------

/** Row returned by `AnnouncementRepository.findWithFilters`. */
export interface AnnouncementListItem {
  id: string;
  announcementNo: number;
  title: string;
  organization: string;
  category: string;
  categorySegment: string;
  categoryDetail: string;
  noticeCategoryName: string;
  noticeCategoryCode: string;
  noticeProcurementMethod: string;
  bidType: string;
  workLocation: string;
  publishDate: string;
  deadline: string;
  status: string;
}

// ---------------------------------------------------------------------------
// findByNo — full detail
// ---------------------------------------------------------------------------

/** Document attached to an announcement (after content loading). */
export interface AnnouncementDocument {
  id: number;
  type: string;
  title: string;
  fileFormat: string;
  pageCount: number | null;
  extractedAt: string | null;
  url: string;
  content: string;
}

export interface SubmissionDocument {
  documentId: string | null;
  name: string;
  dateValue: string | null;
  dateRaw: string;
  dateMeaning: string;
  timepointType: string;
}

/** Row returned by `AnnouncementRepository.findByNo`. */
export interface AnnouncementDetail {
  id: string;
  no: number;
  announcementNo: number;
  ordererId: string;
  title: string;
  organization: string;
  category: string;
  categorySegment: string;
  categoryDetail: string;
  bidType: string;
  workLocation: string;
  department: JsonValue;
  publishDate: string;
  explanationStartDate: string;
  explanationEndDate: string;
  applicationStartDate: string;
  applicationEndDate: string;
  bidStartDate: string;
  bidEndDate: string;
  deadline: string;
  status: string;
  noticeCategoryName: string;
  noticeCategoryCode: string;
  noticeProcurementMethod: string;
  estimatedAmountMin: number | null;
  estimatedAmountMax: number | null;
  actualAmount: number | null;
  winningCompanyId: string | null;
  winningCompanyName: string | null;
  documents: AnnouncementDocument[];
  submissionDocuments: SubmissionDocument[];
  competingCompanies: JsonValue;
}

// ---------------------------------------------------------------------------
// findProgressingCompanies — companies with in_progress/completed status
// ---------------------------------------------------------------------------

/** Row returned by `AnnouncementRepository.findProgressingCompanies`. */
export interface ProgressingCompany {
  evaluationId: string;
  announcementNo: string;
  companyId: string;
  companyName: string;
  branchId: string;
  branchName: string;
  branchAddress: string;
  companyAddress: string;
  priority: number;
  workStatus: string;
  evaluationStatus: string;
  updatedAt: string | null;
}

// ---------------------------------------------------------------------------
// findSimilarCases — similar past cases
// ---------------------------------------------------------------------------

/** Row returned by `AnnouncementRepository.findSimilarCases`. */
export interface SimilarCase {
  id: string;
  announcementId: string;
  similarAnnouncementId: string;
  caseName: string;
  winningCompany: string;
  winningAmount: number | null;
  competitors: JsonValue;
}

// ---------------------------------------------------------------------------
// getDocumentFile — binary file download
// ---------------------------------------------------------------------------

/** Result returned by `AnnouncementRepository.getDocumentFile`. */
export interface DocumentFile {
  data: Buffer;
  fileFormat: string;
  title: string;
}
