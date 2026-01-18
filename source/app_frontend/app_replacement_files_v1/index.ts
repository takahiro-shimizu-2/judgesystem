/**
 * 入札可否判定システムの型定義
 *
 * 注意: 定数（priorityLabels, priorityColors等）は constants/ ディレクトリに移動しました。
 *       import { priorityLabels } from '../constants/priority' を使用してください。
 */

// ステータスの種類
export type EvaluationStatus = 'all_met' | 'other_only_unmet' | 'unmet';

// 要件の種類
export type RequirementCategory =
  | '欠格要件'
  | '所在地要件'
  | '等級要件'
  | '業種・等級要件'
  | '技術者要件'
  | 'その他';

// 要件の判定結果
export interface RequirementResult {
  id: string;
  category: RequirementCategory;
  name: string;
  isMet: boolean;
  reason: string;
  evidence: string;
}

// 企業の優先順位
export type CompanyPriority = 1 | 2 | 3 | 4 | 5;

// 拠点情報
export interface Branch {
  id: string;
  name: string;
  address: string;
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

// 公告情報
export interface Announcement {
  id: string;
  title: string;                      // 工事名
  category: string;                   // 工事カテゴリ
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
}

// 入札判定結果（公告×企業×拠点）
export interface BidEvaluation {
  id: string;
  evaluationNo: string;  // 判定連番
  announcement: Announcement;
  company: Company;
  branch: Branch;  // 拠点
  requirements: RequirementResult[];
  status: EvaluationStatus;
  evaluatedAt: string;
}

// フィルター状態の型
export interface FilterState {
  statuses: EvaluationStatus[];
  priorities: CompanyPriority[];
  categories: string[];
  organizations: string[];
}

// DataGrid行データの型
export interface BidRowData {
  id: string;
  evaluationNo: string;
  status: EvaluationStatus;
  priority: CompanyPriority;
  title: string;
  company: string;
  branch: string;
  organization: string;
  category: string;
  deadline: string;
  evaluatedAt: string;
}
