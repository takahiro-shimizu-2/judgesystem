import type { CompanyStatus } from '../types/workflow';
import { colors } from './styles';

/**
 * 協力会社ステータスのラベル
 */
export const companyStatusLabels: Record<CompanyStatus, string> = {
  not_called: '未架電',
  unavailable: '対応不可',
  waiting_documents: '資料送付待',
  waiting_response: '対応可否連絡待',
  estimate_in_progress: '見積作成中',
  estimate_completed: '見積受領',
  estimate_adopted: '見積採用',
};

/**
 * 協力会社ステータスの色設定
 */
export const companyStatusColors: Record<CompanyStatus, { color: string; bgColor: string }> = {
  not_called: { color: colors.text.muted, bgColor: 'rgba(107, 114, 128, 0.1)' },
  unavailable: { color: colors.accent.red, bgColor: colors.accent.redBg },
  waiting_documents: { color: colors.accent.purple, bgColor: colors.accent.purpleBg },
  waiting_response: { color: colors.accent.blue, bgColor: colors.accent.blueBg },
  estimate_in_progress: { color: colors.accent.orange, bgColor: colors.accent.orangeBg },
  estimate_completed: { color: colors.accent.green, bgColor: colors.accent.greenBg },
  estimate_adopted: { color: colors.accent.greenDark, bgColor: 'rgba(5, 150, 105, 0.1)' },
};

/**
 * 協力会社ステータスの優先度（ソート用）
 * 数字が小さいほど優先
 */
export const companyStatusPriority: Record<CompanyStatus, number> = {
  estimate_adopted: 1,
  estimate_completed: 2,
  estimate_in_progress: 3,
  waiting_response: 4,
  waiting_documents: 5,
  not_called: 6,
  unavailable: 7,
};
