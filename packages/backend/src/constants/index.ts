/**
 * Backend constants.
 *
 * Values are mirrored from @judgesystem/shared/src/constants to avoid
 * TS6059 rootDir errors when the shared dist is not built.
 * Keep in sync with packages/shared/src/constants/.
 */

/** 1ページあたりのデフォルト件数 */
export const DEFAULT_PAGE_SIZE = 25;

/** ページサイズ選択肢 (UI用) */
export const PAGE_SIZE_OPTIONS = [25, 50, 100] as const;

/** ワークフローステップID */
export const WORKFLOW_STEP_IDS = {
  JUDGMENT: "judgment",
  ORDERER: "orderer",
  PARTNER: "partner",
  REQUEST: "request",
  AWARD: "award",
} as const;

export type WorkflowStepId = (typeof WORKFLOW_STEP_IDS)[keyof typeof WORKFLOW_STEP_IDS];
