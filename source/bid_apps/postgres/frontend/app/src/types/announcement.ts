import type { Announcement } from './index';

/**
 * 入札案件ステータス
 * - upcoming: 公告中（締切まで14日以上）
 * - ongoing: 締切間近（締切まで14日以内）
 * - awaiting_result: 結果待（締切後、落札結果待ち）
 * - closed: 終了（落札結果確定）
 */
export type AnnouncementStatus = 'upcoming' | 'ongoing' | 'awaiting_result' | 'closed';

/**
 * 入札形式
 */
export type BidType =
  | 'open_competitive'         // 一般競争入札
  | 'planning_competition'     // 企画競争
  | 'designated_competitive'   // 指名競争入札
  | 'document_request'         // 資料提供招請
  | 'opinion_request'          // 意見招請
  | 'negotiated_contract'      // 随意契約
  | 'open_counter'             // 見積(オープンカウンター)
  | 'unknown'                  // その他・不明
  | 'preferred_designation'    // 希望制指名競争入札
  | 'other';

/**
 * 競争参加企業
 */
export interface CompetingCompany {
  name: string;                  // 企業名
  isWinner?: boolean;            // 落札企業かどうか
  bidAmounts?: (number | null)[];  // 入札金額（最大3回分、nullは不参加）
}

/**
 * 入札案件（ステータス付き）
 */
export interface AnnouncementWithStatus extends Announcement {
  no: number;                    // NO
  status: AnnouncementStatus;
  actualAmount?: number;         // 実際の落札金額（結果確定後）
  winningCompanyId?: string;     // 落札企業ID
  winningCompanyName?: string;   // 落札企業名
  competingCompanies?: CompetingCompany[];  // 競争参加企業
}
