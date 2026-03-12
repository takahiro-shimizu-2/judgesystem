/**
 * データ層 - 一元管理されたモックデータ（本番想定のデータ量）
 *
 * 使用方法:
 * import { mockPartners, mockOrderers, mockBidEvaluations } from '../data';
 *
 * 構造:
 * - orderers.ts     : 発注者マスター（65件）国/独立行政法人/都道府県/政令市
 * - partners.ts     : 会社マスター（250件）※協力会社＋企業情報を統合
 * - companies.ts    : 企業マスター（115件）※評価・案件用の参照データ
 * - announcements.ts: 案件（500件）→ ordererId で発注者参照
 * - evaluations.ts  : 判定結果（3000件）→ 案件ID, 企業IDで参照
 *
 * 注意:
 * - 型は types/ から import
 * - 表示設定（Config）は constants/ から import
 */

// 発注者
export {
  mockOrderers,
  findOrdererById,
  findOrdererByName,
} from './orderers';

// 発注者の型・設定は適切な場所から re-export
export { ordererCategoryConfig } from '../constants/ordererCategory';
export type { OrdererCategory } from '../types/orderer';

// 企業
export {
  mockCompanies,
  findCompanyById,
  findCompanyByName,
  getCompanyPriority,
} from './companies';

// 協力会社
export {
  mockPartners,
  findPartnerById,
  findPartnerByName,
  allCategories,
} from './partners';

// 案件
export {
  mockAnnouncements,
  findAnnouncementById,
  getAnnouncementsByOrdererId,
} from './announcements';

// 案件の型・設定は適切な場所から re-export
export { announcementStatusConfig } from '../constants/announcementStatus';
export { bidTypeConfig } from '../constants/bidType';
export { documentTypeConfig } from '../constants/documentType';
export type { AnnouncementStatus, BidType } from '../types/announcement';
export type { DocumentType, DocumentOcr } from '../types';

// 判定結果（メイン）
export {
  mockBidEvaluations,
  filterByStatus,
  findById,
  updateWorkStatus,
  updateCurrentStep,
  mockSimilarCases,
  getSimilarCases,
} from './evaluations';

// 担当者
export {
  mockStaff,
  findStaffById,
  findStaffByName,
  getStaffByDepartment,
  getAllDepartments,
} from './staff';
