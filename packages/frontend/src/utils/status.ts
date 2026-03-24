import { colors } from '../constants/styles';

// ============================================================================
// 型定義
// ============================================================================

export type StatusType = 'pending' | 'active' | 'completed' | 'error' | 'warning';
export type CategoryType = 'call' | 'document' | 'check' | 'confirm' | 'submit';
export type DocumentType = 'estimate' | 'bid' | 'report' | 'certificate' | 'other';

export interface StatusInfo {
  label: string;
  color: string;
  bgColor: string;
  borderColor?: string;
}

export interface CategoryInfo {
  label: string;
  color: string;
  bgColor: string;
}

// ============================================================================
// ステータス情報の取得
// ============================================================================

const STATUS_CONFIG: Record<StatusType, StatusInfo> = {
  pending: {
    label: '未着手',
    color: colors.workflow.pending.main,
    bgColor: colors.workflow.pending.bg,
    borderColor: colors.workflow.pending.border,
  },
  active: {
    label: '進行中',
    color: colors.workflow.active.main,
    bgColor: colors.workflow.active.bg,
    borderColor: colors.workflow.active.border,
  },
  completed: {
    label: '完了',
    color: colors.workflow.completed.main,
    bgColor: colors.workflow.completed.bg,
    borderColor: colors.workflow.completed.border,
  },
  error: {
    label: 'エラー',
    color: colors.status.error.main,
    bgColor: colors.status.error.bg,
    borderColor: colors.status.error.border,
  },
  warning: {
    label: '注意',
    color: colors.status.warning.main,
    bgColor: colors.status.warning.bg,
    borderColor: colors.status.warning.border,
  },
};

/**
 * ステータスタイプから表示情報を取得
 */
export function getStatusInfo(status: StatusType | string): StatusInfo {
  return STATUS_CONFIG[status as StatusType] || STATUS_CONFIG.pending;
}

// ============================================================================
// カテゴリ情報の取得
// ============================================================================

const CATEGORY_CONFIG: Record<CategoryType, CategoryInfo> = {
  call: {
    label: '架電',
    color: colors.accent.blue,
    bgColor: colors.accent.blueBg,
  },
  document: {
    label: '資料',
    color: colors.accent.purple,
    bgColor: colors.accent.purpleBg,
  },
  check: {
    label: '確認',
    color: colors.accent.teal,
    bgColor: colors.accent.tealBg,
  },
  confirm: {
    label: '確認事項',
    color: colors.accent.orange,
    bgColor: colors.accent.orangeBg,
  },
  submit: {
    label: '提出',
    color: colors.accent.green,
    bgColor: colors.accent.greenBg,
  },
};

/**
 * カテゴリタイプから表示情報を取得
 */
export function getCategoryInfo(category: CategoryType | string): CategoryInfo {
  return CATEGORY_CONFIG[category as CategoryType] || CATEGORY_CONFIG.check;
}

/**
 * カテゴリのラベルを取得
 */
export function getCategoryLabel(category: CategoryType | string): string {
  return getCategoryInfo(category).label;
}

/**
 * カテゴリの色を取得
 */
export function getCategoryColor(category: CategoryType | string): string {
  return getCategoryInfo(category).color;
}

// ============================================================================
// ドキュメントタイプ情報の取得
// ============================================================================

const DOCUMENT_TYPE_CONFIG: Record<DocumentType, CategoryInfo> = {
  estimate: {
    label: '見積書',
    color: colors.accent.blue,
    bgColor: colors.accent.blueBg,
  },
  bid: {
    label: '入札書',
    color: colors.accent.green,
    bgColor: colors.accent.greenBg,
  },
  report: {
    label: '報告書',
    color: colors.accent.purple,
    bgColor: colors.accent.purpleBg,
  },
  certificate: {
    label: '証明書',
    color: colors.accent.orange,
    bgColor: colors.accent.orangeBg,
  },
  other: {
    label: 'その他',
    color: colors.text.muted,
    bgColor: colors.background.alt,
  },
};

/**
 * ドキュメントタイプから表示情報を取得
 */
export function getDocumentTypeInfo(type: DocumentType | string): CategoryInfo {
  return DOCUMENT_TYPE_CONFIG[type as DocumentType] || DOCUMENT_TYPE_CONFIG.other;
}

// ============================================================================
// ワークフローステータス
// ============================================================================

export type WorkflowStatusType = 'completed' | 'current' | 'locked';

const WORKFLOW_STATUS_COLORS: Record<WorkflowStatusType, { main: string; bg: string }> = {
  completed: {
    main: colors.workflow.completed.main,
    bg: colors.workflow.completed.bg,
  },
  current: {
    main: colors.workflow.active.main,
    bg: colors.workflow.active.bg,
  },
  locked: {
    main: colors.workflow.locked.main,
    bg: colors.workflow.locked.bg,
  },
};

/**
 * ワークフローステータスの色を取得
 */
export function getWorkflowStatusColor(status: WorkflowStatusType): string {
  return WORKFLOW_STATUS_COLORS[status]?.main || colors.text.muted;
}

/**
 * ワークフローステータスの背景色を取得
 */
export function getWorkflowStatusBgColor(status: WorkflowStatusType): string {
  return WORKFLOW_STATUS_COLORS[status]?.bg || colors.background.alt;
}
