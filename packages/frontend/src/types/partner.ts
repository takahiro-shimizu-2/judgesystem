import type { EvaluationStatus, WorkStatus, CompanyPriority } from './index';
import type { BidType } from './announcement';

/**
 * 対応案件
 */
export interface PastProject {
  evaluationId: string;        // 判定結果ID
  announcementId: string;      // 案件ID
  announcementNo: number;      // 案件No
  announcementTitle: string;   // 案件名
  branchName: string;          // 支店名
  workStatus: WorkStatus;      // 着手ステータス
  evaluationStatus: EvaluationStatus; // 参加可否
  priority: CompanyPriority | null;   // 優先度
  bidType?: BidType;           // 入札形式
  category: string;            // 種別
  prefecture: string;          // 都道府県
  publishDate: string;         // 公告日
  deadline: string;            // 締切日
  evaluatedAt: string;         // 判定日
  organization: string;        // 発注機関
}

/**
 * 企業支店情報
 */
export interface CompanyBranch {
  name: string;
  address: string;
}

/**
 * 全省庁統一資格項目
 */
export interface UnifiedQualificationItem {
  mainCategory: string; // 大カテゴリー（物品の製造、物品の販売など）
  category: string;     // 種別（衣服・その他繊維製品類など）
  region: string;       // 競争参加地域
  value: string;        // 数値
  grade: string;        // 等級（A、B、C、D等）
}

/**
 * 発注者別資格項目
 */
export interface OrdererQualificationItem {
  category: string; // 種別（土木、建築など）
  region: string;   // 競争参加地域
  value: string;    // 数値
  grade: string;    // 等級（A、B、C、D等）
}

/**
 * 競争参加資格項目（後方互換用）
 * @deprecated Use UnifiedQualificationItem or OrdererQualificationItem
 */
export interface QualificationItem {
  category: string;    // 業種区分（土木一式、建築一式など）
  grade: string;       // 等級（A、B、C、D等）
  validUntil?: string; // 有効期限
}

/**
 * 発注者別競争参加資格
 */
export interface OrdererQualification {
  ordererName: string;              // 発注者名
  items: OrdererQualificationItem[]; // 資格項目
}

/**
 * 競争参加資格
 */
export interface Qualifications {
  unified: UnifiedQualificationItem[];  // 全省庁統一資格
  orderers: OrdererQualification[];     // 発注者別資格
}

/**
 * 協力会社一覧用の型（企業情報を統合）
 * ※ワークフロー内の協力会社は workflow.ts の Partner を使用
 */
export interface PartnerListItem {
  id: string;
  no: number;              // NO
  name: string;            // 会社名
  postalCode: string;      // 郵便番号
  address: string;         // 住所
  phone: string;           // 電話番号
  email: string;           // メールアドレス
  fax: string;             // FAX
  url?: string;            // ホームページURL
  surveyCount: number | null;     // 現地調査回数
  rating: number | null;          // 評価（0〜3、0.5刻み）
  resultCount: number | null;     // 実績数
  categories: string[];    // 種別（最大30個程度）
  pastProjects: PastProject[]; // 過去案件
  // 企業情報（統合）
  representative: string;  // 代表者
  established: string;     // 設立年
  capital: number | null;         // 資本金
  employeeCount: number | null;   // 従業員数
  branches: CompanyBranch[]; // 拠点一覧
  qualifications: Qualifications; // 競争参加資格
}
