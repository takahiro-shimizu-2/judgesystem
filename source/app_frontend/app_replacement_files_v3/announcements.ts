/**
 * 案件マスターデータ
 * 全ての案件データの単一真実源（Single Source of Truth）
 * 発注者ID（ordererId）で発注者マスターを参照
 */
//import type { AnnouncementWithStatus, Department, DocumentOcr, DocumentType, FileFormat } from '../types';
import type { AnnouncementWithStatus } from '../types';
//import type { AnnouncementStatus, BidType } from '../types/announcement';
//import { mockOrderers } from './orderers';
//import { mockCompanies } from './companies';

const generateAnnouncements = async (): Promise<AnnouncementWithStatus[]> => {
  const res = await fetch("/api/announcements");
  const data = await res.json();
  //console.log("API response:", data);
  return data;
}

// エクスポート
//export const mockAnnouncements: AnnouncementWithStatus[] = generateAnnouncements();
export const mockAnnouncements: AnnouncementWithStatus[] = await generateAnnouncements();

// テスト用: 非常に長い案件名を1件追加
//if (mockAnnouncements.length > 0) {
//  mockAnnouncements[0].title = '令和6年度国土交通省関東地方整備局管内における道路橋梁長寿命化修繕工事及び耐震補強工事に係る設計業務委託（荒川水系河川管理施設点検・補修を含む複合案件）';
//}

// ヘルパー関数
export const findAnnouncementById = (id: string): AnnouncementWithStatus | undefined =>
  mockAnnouncements.find(a => a.id === id);

export const getAnnouncementsByOrdererId = (ordererId: string): AnnouncementWithStatus[] =>
  mockAnnouncements.filter(a => a.ordererId === ordererId);
