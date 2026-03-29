/**
 * ワークフロー関連の型定義
 */

// ============================================================================
// 書類関連
// ============================================================================

/** 書類ステータス */
export type DocumentStatus = 'pending' | 'draft' | 'reviewing' | 'approved' | 'submitted' | 'uploaded';

/** 依頼書類ステータス */
export type RequestDocumentStatus = 'not_requested' | 'requested' | 'received' | 'submitted';

/** 書類タイプ */
export type DocumentType = 'estimate' | 'bid' | 'result';

/** 資料フロータイプ */
export type DocumentFlowType = 'sent' | 'received' | 'submitted';

/** 依頼書類 */
export interface RequestDocument {
  id: string;
  type: DocumentType;
  name: string;
  status: DocumentStatus;
  dueDate?: string;
  updatedAt?: string;
}

/** 依頼アイテム */
export interface RequestItem {
  id: string;
  type: DocumentType;
  status: RequestDocumentStatus;
  requestedDate?: string;
  receivedDate?: string;
  submittedDate?: string;
  dueDate?: string;
  note?: string;
  fileName?: string;
  fileUrl?: string;      // ファイルURL（アップロード後）
  uploadedAt?: string;   // アップロード日時
}

/** パートナー資料 */
export interface PartnerDocument {
  id: string;
  name: string;
  type: DocumentFlowType;
  date?: string;
  uploadedAt?: string;
  fileName?: string;
  contentType?: string;
  size?: number;
  fileId?: string;
}

export interface PartnerWorkflowEntry {
  callMemos: WorkflowRecordMemo[];
  receivedDocuments: PartnerDocument[];
  transcriptions: WorkflowTranscription[];
}

export interface PartnerWorkflowState {
  sentDocuments: PartnerDocument[];
  partners: Record<string, PartnerWorkflowEntry>;
}

/** 事前提出資料 */
export interface PreSubmitDocument {
  id: string;
  name: string;
  status: 'pending' | 'submitted';
  dueDate?: string;
  uploadedAt?: string;
  fileName?: string;
  contentType?: string;
  dataUrl?: string;
  size?: number;
}

// ============================================================================
// 確認事項関連
// ============================================================================

/** 確認事項カテゴリ */
export type CheckItemCategory = 'frequent' | 'similar' | 'case' | 'high_freq' | 'case_specific';

/** 確認事項 */
export interface CheckItem {
  id: string;
  content: string;
  checked: boolean;
  category: CheckItemCategory;
}

/** 確認事項（ラベル付き） */
export interface ConfirmItem {
  id: string;
  label: string;
  checked: boolean;
  category: CheckItemCategory;
}

// ============================================================================
// パートナー関連
// ============================================================================

/** パートナーステータス */
export type PartnerStatus =
  | 'not_called'           // 未架電
  | 'unavailable'          // 対応不可
  | 'waiting_documents'    // 資料送付待ち
  | 'waiting_response'     // 対応可否連絡待ち
  | 'estimate_in_progress' // 見積書作成中
  | 'estimate_completed'   // 見積書受領
  | 'estimate_adopted';    // 見積採用

// ステータスのラベル・色・優先度は constants/partnerStatus.ts に定義

/** パートナーメモ */
export interface PartnerMemo {
  id: string;
  content: string;
  createdAt: string;
  updatedAt?: string;
}

/** パートナー文字起こし */
export interface PartnerTranscription {
  id: string;
  content: string;
  date: string;
}

/** パートナー受信資料 */
export interface PartnerReceivedDocument {
  id: string;
  name: string;
  date: string;
}

/** パートナー情報 */
export interface Partner {
  id: string;
  name: string;              // 企業名
  contactPerson: string;     // 担当者名
  phone: string;             // 電話番号
  email: string;             // メールアドレス
  fax: string;               // FAX
  status: PartnerStatus;     // 進捗状況
  memos: PartnerMemo[];      // メモ
  transcriptions: PartnerTranscription[]; // 文字起こし
  talkScript: string;        // トークスクリプト
  surveyApproved: boolean;   // 現地調査OK
  receivedDocuments: PartnerReceivedDocument[]; // 受信資料
  assignedStaffId?: string;  // 担当者ID
}

/** 協力会社候補追加時の入力 */
export interface PartnerCandidatePayload {
  partnerId: string;
  partnerName: string;
  contactPerson?: string;
  phone?: string;
  email?: string;
  fax?: string;
}

// ============================================================================
// 発注者ワークフロー関連
// ============================================================================

export type WorkflowMemoTag = 'question' | 'answer' | 'memo' | 'idea' | 'evaluation';

export interface WorkflowRecordMemo {
  id: string;
  createdAt: string;
  updatedAt?: string;
  content: string;
  tag: WorkflowMemoTag;
  parentId?: string;
}

export interface WorkflowTranscription {
  id: string;
  createdAt: string;
  updatedAt?: string;
  content: string;
}

export interface OrdererWorkflowState {
  callMemos: WorkflowRecordMemo[];
  evaluations: WorkflowRecordMemo[];
  preSubmitDocs: PreSubmitDocument[];
  transcriptions: WorkflowTranscription[];
}

// ============================================================================
// 落札関連
// ============================================================================

/** 参加企業 */
export interface Participant {
  id: string;
  name: string;
  bidAmount?: number;
  isWinner: boolean;
  rank?: number;
}

// ============================================================================
// 架電記録関連
// ============================================================================

/** 架電記録評価 */
export type CallEvaluation = 'positive' | 'neutral' | 'negative';

/** 架電記録 */
export interface CallLog {
  id: string;
  date: string;
  memo: string;
  evaluation?: CallEvaluation;
  transcription?: string;
}

// ============================================================================
// メール関連
// ============================================================================

/** メール送信先タイプ */
export type EmailRecipientType =
  | 'requester'           // 依頼元企業
  | 'adopted_partner'     // 見積採用した協力会社
  | 'non_adopted_partner' // 見積書受領のみの協力会社
  | 'participant';        // 参加企業（落札タブ用）

/** メールテンプレートカテゴリ */
export type EmailTemplateCategory = 'request' | 'award';

/** メールテンプレート */
export interface EmailTemplate {
  id: string;
  label: string;
  category: EmailTemplateCategory;
  recipientType: EmailRecipientType;
  subject: string;
  body: string;
}
