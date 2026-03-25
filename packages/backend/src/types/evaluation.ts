/**
 * Evaluation domain types for Repository layer return values.
 *
 * These types match the actual query results produced by EvaluationRepository,
 * eliminating the use of `any` in method signatures.
 */

import type { JsonValue } from "./json";

// ---------------------------------------------------------------------------
// findWithFilters — list item (minimal per-row data)
// ---------------------------------------------------------------------------

/** Row returned by `EvaluationRepository.findWithFilters`. */
export interface EvaluationListItem {
  id: string;
  evaluationNo: string;
  announcement: JsonValue;
  company: JsonValue;
  branch: JsonValue;
  status: string;
  workStatus: string;
  currentStep: string;
  evaluatedAt: string | null;
}

// ---------------------------------------------------------------------------
// findById — full detail
// ---------------------------------------------------------------------------

/** Row returned by `EvaluationRepository.findById`. */
export interface EvaluationDetail {
  id: string;
  evaluationNo: string;
  announcement: JsonValue;
  company: JsonValue;
  branch: JsonValue;
  stepAssignees: JsonValue;
  requirements: JsonValue;
  status: string;
  workStatus: string;
  currentStep: string;
  evaluatedAt: string | null;
}

// ---------------------------------------------------------------------------
// updateWorkStatus — result
// ---------------------------------------------------------------------------

/** Row returned by `EvaluationRepository.updateWorkStatus`. */
export interface EvaluationWorkStatusResult {
  evaluationNo: string;
  workStatus: string;
  currentStep: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// getStats — analytics dashboard
// ---------------------------------------------------------------------------

/** Row returned by `EvaluationRepository.getStats`. */
export interface EvaluationStats {
  total: number;
  allMet: number;
  otherUnmet: number;
  unmet: number;
  topOrganizations: JsonValue;
  organizationCount: number;
  topCategories: JsonValue;
}
