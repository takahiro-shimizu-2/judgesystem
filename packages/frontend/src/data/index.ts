/**
 * データ層 - API呼び出し関数と定数の一元管理
 *
 * 使用方法:
 * import { fetchOrdererList, fetchCompanyList } from '../data';
 *
 * 構造:
 * - orderers.ts     : 発注者API呼び出し
 * - partners.ts     : 協力会社API呼び出し
 * - companies.ts    : 企業API呼び出し
 * - announcements.ts: 案件（API経由で取得、モックデータは削除済み）
 * - evaluations.ts  : 判定結果API呼び出し（ワークフロー、パートナー管理含む）
 *
 * 注意:
 * - 型は types/ から import
 * - 表示設定（Config）は constants/ から import
 */

// 発注者
export {
  fetchOrdererList,
} from './orderers';

// 発注者の型・設定は適切な場所から re-export
export { ordererCategoryConfig } from '../constants/ordererCategory';
export type { OrdererCategory } from '../types/orderer';

// 企業
export {
  fetchCompanyList,
  getCompanyPriority,
} from './companies';
export type { CompanyWithDetails } from './companies';

// 協力会社
export {
  fetchPartnerList,
  allCategories,
} from './partners';
export type {
  PartnerListParams,
  PartnerListRow,
  PaginatedPartnerResponse,
} from './partners';

// 案件
// Note: モックデータ（mockAnnouncements, findAnnouncementById, getAnnouncementsByOrdererId）は
// 削除済み（Issue #110）。案件データはAPIから取得する。

// 案件の型・設定は適切な場所から re-export
export { announcementStatusConfig } from '../constants/announcementStatus';
export { bidTypeConfig } from '../constants/bidType';
export { documentTypeConfig } from '../constants/documentType';
export type { AnnouncementStatus, BidType } from '../types/announcement';
export type { DocumentType, DocumentOcr } from '../types';

// 判定結果（メイン）
export {
  updateWorkStatus,
  updateEvaluationAssignee,
  fetchPartnerCandidates,
  createPartnerCandidate,
  updatePartnerCandidate,
  deletePartnerCandidate,
} from './evaluations';

// 担当者
