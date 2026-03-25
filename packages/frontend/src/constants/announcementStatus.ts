import type { AnnouncementStatus } from '../types/announcement';

/**
 * 入札案件ステータスの表示設定
 */
export const announcementStatusConfig: Record<AnnouncementStatus, {
  label: string;
  color: string;
  bgColor: string;
}> = {
  upcoming: { label: '公告中', color: '#2563eb', bgColor: '#eff6ff' },
  ongoing: { label: '締切間近', color: '#ea580c', bgColor: '#fff7ed' },
  awaiting_result: { label: '結果待', color: '#7c3aed', bgColor: '#f5f3ff' },
  closed: { label: '終了', color: '#64748b', bgColor: '#f1f5f9' },
};
