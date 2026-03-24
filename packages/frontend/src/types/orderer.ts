// shared パッケージからの re-export
export type { OrdererCategory } from '@judgesystem/shared';

// shared パッケージから import（このファイル内で使用するため）
import type { OrdererCategory } from '@judgesystem/shared';

export interface Orderer {
  id: string;
  no: number;                // NO
  name: string;              // 機関名
  category: OrdererCategory; // 種別
  address: string;
  phone: string;
  fax: string;
  email: string;
  website?: string;
  departments: string[];      // 部署一覧
  announcementCount: number;  // 公告数
  awardCount: number;         // 落札実績数
  averageAmount: number;      // 平均落札額
  lastAnnouncementDate: string;
}
