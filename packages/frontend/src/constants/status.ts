import {
  CheckCircle as CheckCircleIcon,
  Warning as WarningIcon,
  Cancel as CancelIcon,
} from '@mui/icons-material';
import type { EvaluationStatus } from '../types';

/**
 * 判定結果の設定
 */
export interface EvaluationStatusConfig {
  label: string;
  icon: typeof CheckCircleIcon;
  gradient: string;
  bgColor: string;
  color: string;
  borderColor: string;
}

export const evaluationStatusConfig: Record<EvaluationStatus, EvaluationStatusConfig> = {
  all_met: {
    label: '参加可能',
    icon: CheckCircleIcon,
    gradient: '#16a34a',
    bgColor: '#f0fdf4',
    color: '#16a34a',
    borderColor: '#bbf7d0',
  },
  other_only_unmet: {
    label: '特殊条件',
    icon: WarningIcon,
    gradient: '#ea580c',
    bgColor: '#fff7ed',
    color: '#ea580c',
    borderColor: '#fed7aa',
  },
  unmet: {
    label: '参加不可',
    icon: CancelIcon,
    gradient: '#dc2626',
    bgColor: '#fef2f2',
    color: '#dc2626',
    borderColor: '#fecaca',
  },
};

