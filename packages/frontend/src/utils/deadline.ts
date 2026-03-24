export interface DeadlineInfo {
  color: string;
  bgColor: string;
  label: string;
  urgent: boolean;
}

/**
 * 締切日までの日数を計算
 */
export function getDaysUntilDeadline(deadlineStr: string): number {
  const deadline = new Date(deadlineStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  deadline.setHours(0, 0, 0, 0);
  const diffTime = deadline.getTime() - today.getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

/**
 * 締切日数に基づいた表示情報を取得
 */
export function getDeadlineInfo(days: number): DeadlineInfo {
  if (days < 0) {
    return { color: '#64748b', bgColor: 'rgba(100,116,139,0.1)', label: '締切済み', urgent: false };
  }
  if (days === 0) {
    return { color: '#dc2626', bgColor: 'rgba(220,38,38,0.1)', label: '本日締切', urgent: true };
  }
  if (days <= 3) {
    return { color: '#dc2626', bgColor: 'rgba(220,38,38,0.1)', label: `あと${days}日`, urgent: true };
  }
  if (days <= 7) {
    return { color: '#ea580c', bgColor: 'rgba(234,88,12,0.1)', label: `あと${days}日`, urgent: false };
  }
  return { color: '#64748b', bgColor: 'rgba(100,116,139,0.1)', label: `あと${days}日`, urgent: false };
}

/**
 * 金額をフォーマット（万円表示）
 */
export function formatAmountInManYen(min?: number, max?: number): string {
  if (!min || !max) return '金額未定';
  return `${(min / 10000).toLocaleString()}〜${(max / 10000).toLocaleString()}万円`;
}
