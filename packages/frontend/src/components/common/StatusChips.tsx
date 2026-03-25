/**
 * ステータス表示用チップコンポーネント
 *
 * BidDetailPage, BidListPage などで使用
 * すべてのステータスチップは ConfigChip を使用して統一されたスタイルを提供
 */
import { evaluationStatusConfig } from '../../constants/status';
import { workStatusConfig } from '../../constants/workStatus';
import { priorityColors } from '../../constants/priority';
import type { EvaluationStatus, WorkStatus, CompanyPriority } from '../../types';
import { ConfigChip } from './ConfigChip';

/**
 * 判定結果チップ（参加可能/その他のみ不可/参加不可）
 */
export function EvaluationStatusChip({ status }: { status: EvaluationStatus }) {
  const config = evaluationStatusConfig[status];
  return (
    <ConfigChip
      config={{
        label: config.label,
        color: config.color,
        bgColor: config.bgColor,
        gradient: config.gradient,
        icon: config.icon,
      }}
      variant="outlined"
      showIcon={false}
    />
  );
}

/**
 * 作業ステータスチップ（未着手/着手中/完了）
 */
export function WorkStatusChip({ status }: { status: WorkStatus }) {
  const config = workStatusConfig[status];
  return (
    <ConfigChip
      config={{
        label: config.label,
        color: config.color,
        bgColor: config.bgColor,
        borderColor: config.borderColor,
        icon: config.icon,
      }}
      variant="outlined"
      showIcon={false}
    />
  );
}

/**
 * 優先度チップ（優先度 1〜5）
 */
export function PriorityChip({ priority }: { priority: CompanyPriority }) {
  const config = priorityColors[priority];
  return (
    <ConfigChip
      config={{
        label: `優先度 ${priority}`,
        color: config.color,
        bgColor: config.bgColor,
        gradient: config.gradient,
      }}
      variant="outlined"
      showIcon={false}
    />
  );
}
