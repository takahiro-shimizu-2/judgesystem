/**
 * 作業ステータスに関する定数
 */
import {
  RadioButtonUnchecked as NotStartedIcon,
  Autorenew as InProgressIcon,
  CheckCircle as CompletedIcon,
} from '@mui/icons-material';
import type { WorkStatus } from '../types';

/** ステータス設定 */
export interface WorkStatusConfig {
  label: string;
  icon: typeof NotStartedIcon;
  color: string;
  bgColor: string;
  borderColor: string;
}

export const workStatusConfig: Record<WorkStatus, WorkStatusConfig> = {
  not_started: {
    label: '未着手',
    icon: NotStartedIcon,
    color: '#64748b',
    bgColor: '#f1f5f9',
    borderColor: '#cbd5e1',
  },
  in_progress: {
    label: '着手中',
    icon: InProgressIcon,
    color: '#2563eb',
    bgColor: '#eff6ff',
    borderColor: '#bfdbfe',
  },
  completed: {
    label: '完了',
    icon: CompletedIcon,
    color: '#16a34a',
    bgColor: '#f0fdf4',
    borderColor: '#bbf7d0',
  },
};
