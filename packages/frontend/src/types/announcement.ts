import type { Announcement } from './index';

// shared パッケージからの re-export
export type { AnnouncementStatus, BidType } from '@judgesystem/shared';

// shared パッケージから import（このファイル内で使用するため）
import type { AnnouncementStatus } from '@judgesystem/shared';

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
