/**
 * 入札可否判定システムの型定義
 *
 * 注意: 定数（priorityLabels, priorityColors等）は constants/ ディレクトリに移動しました。
 *       import { priorityLabels } from '../constants/priority' を使用してください。
 */

// shared パッケージからの re-export
export type { EvaluationStatus, WorkStatus, RequirementCategory, CompanyPriority } from '@judgesystem/shared';

// shared パッケージから import（このファイル内で使用するため）
import type { EvaluationStatus, WorkStatus, RequirementCategory, CompanyPriority } from '@judgesystem/shared';

// 各ファイルの型をre-export
export * from './workflow';
export * from './partner';
export * from './orderer';
export * from './announcement';
export * from './staff';

import type { BidType } from './announcement';

// 要件の判定結果
export interface RequirementResult {
  id: string;
  category: RequirementCategory;
  name: string;
  isMet: boolean;
  reason: string;
  evidence: string;
}

// 拠点情報
export interface Branch {
  id: string;
  name: string;
  address: string;
  phone?: string;
  email?: string;
  fax?: string;
  postalCode?: string;
}

// 企業情報
export interface Company {
  id: string;
  name: string;
  address: string;
  grade: string;
  priority: CompanyPriority;
}

// 担当部局情報
export interface Department {
  postalCode: string;       // 郵便番号
  address: string;          // 住所
  name: string;             // 部署名
  contactPerson: string;    // 担当者名
  phone: string;            // 電話番号
  fax: string;              // FAX
  email: string;            // メールアドレス
}

// 資料文字起こし
// DocumentType: 資料の種類は案件ごとに異なるため、柔軟な文字列型とする
// よく使われる種類: 入札公告、仕様書、入札書、入札説明書、図面、入札関連書 など
export type DocumentType = string;

// ファイル形式
export type FileFormat = 'pdf' | 'excel' | 'word' | 'xls' | 'doc' | 'png' | 'jpg' | 'jpeg' | 'other';

export interface DocumentOcr {
  id: number;
  type: DocumentType;                 // 資料種別（自由入力）
  title: string;                      // 資料名
  content: string;                    // 文字起こし内容
  fileFormat?: FileFormat;            // ファイル形式（pdf, excel, word, other）
  pageCount?: number;                 // ページ数
  extractedAt?: string;               // 抽出日時
  url?: string;                       // 資料URL
}

// 公告情報
export interface Announcement {
  id: string;
  ordererId?: string;                 // 発注者ID（マスター参照用）
  title: string;                      // 工事名
  category: string;                   // 工事カテゴリ
  bidType?: BidType;                  // 入札形式
  organization: string;               // 発注機関
  workLocation: string;               // 工事場所
  department: Department;             // 担当部局
  publishDate: string;                // 公告掲載日
  explanationStartDate: string;       // 入札説明書交付開始日
  explanationEndDate: string;         // 入札説明書交付終了日
  applicationStartDate: string;       // 申請書類提出開始日
  applicationEndDate: string;         // 申請書類提出終了日（受付期限）
  bidStartDate: string;               // 入札書提出開始日
  bidEndDate: string;                 // 入札書提出終了日（入札日・開札日）
  deadline: string;                   // 締切日（既存互換）
  estimatedAmountMin?: number;        // 見積予想金額下限（円）
  estimatedAmountMax?: number;        // 見積予想金額上限（円）
  pdfUrl?: string;
  documents?: DocumentOcr[];          // 資料文字起こし
  actualAmount?: number;              // 実際の落札金額
  winningCompanyId?: string;          // 落札企業ID
  winningCompanyName?: string;        // 落札企業名
  competingCompanies?: import('./announcement').CompetingCompany[];  // 競争参加企業
}

// 類似案件
export interface SimilarCase {
  id: string;
  announcementId: string;      // 入札案件ID（遷移用）
  similarAnnouncementId: string; // 類似案件として表示する別公告ID
  caseName: string;            // 類似案件名
  winningCompany: string;      // 落札企業名
  winningAmount: number | null;       // 落札金額（未登録時は null）
  competitors: string[];       // 競争参加企業名
}

// 入札判定結果（公告×企業×拠点）
export interface BidEvaluation {
  id: string;
  evaluationNo: string;  // 判定連番
  announcement: Announcement;
  company: Company;
  branch: Branch;  // 拠点
  requirements: RequirementResult[];
  status: EvaluationStatus;  // 判定結果
  workStatus: WorkStatus;    // 作業ステータス
  currentStep: string;       // 現在のワークフローステップ
  evaluatedAt: string;
  stepAssignees?: import('./staff').StepAssignee[];  // 各ステップの担当者
}

// フィルター状態の型
export interface FilterState {
  statuses: EvaluationStatus[];
  workStatuses: WorkStatus[];
  priorities: CompanyPriority[];
  categories: string[];
  bidTypes: string[];
  organizations: string[];
  prefectures: string[];
}

// DataGrid行データの型
export interface BidRowData {
  id: string;
  evaluationNo: string;
  status: EvaluationStatus;    // 判定結果
  workStatus: WorkStatus;      // 作業ステータス
  priority: CompanyPriority;
  title: string;
  company: string;
  branch: string;
  organization: string;
  category: string;
  deadline: string;
  evaluatedAt: string;
}
