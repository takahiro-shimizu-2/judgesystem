/**
 * 案件マスターデータ
 * 全ての案件データの単一真実源（Single Source of Truth）
 * 発注者ID（ordererId）で発注者マスターを参照
 */
//import type { AnnouncementWithStatus, Department } from '../types';
import type { AnnouncementWithStatus } from '../types';
//import type { AnnouncementStatus } from '../types/announcement';
//import { mockOrderers } from './orderers';
//import { mockCompanies } from './companies';

const generateAnnouncements = async (): Promise<AnnouncementWithStatus[]> => {
  const res = await fetch("/api/announcements");
  const data = await res.json();
  return data;
}

// エクスポート
//export const mockAnnouncements: AnnouncementWithStatus[] = generateAnnouncements();
export const mockAnnouncements: AnnouncementWithStatus[] = await generateAnnouncements();

// ヘルパー関数
export const findAnnouncementById = (id: string): AnnouncementWithStatus | undefined =>
  mockAnnouncements.find(a => a.id === id);

export const getAnnouncementsByOrdererId = (ordererId: string): AnnouncementWithStatus[] =>
  mockAnnouncements.filter(a => a.ordererId === ordererId);
