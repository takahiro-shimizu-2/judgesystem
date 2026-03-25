/**
 * 記録メモのタグ定義（共通）
 * 発注者タブ・協力会社タブで共通利用
 */
import {
  HelpOutline as QuestionIcon,
  CheckCircleOutline as AnswerIcon,
  ChatBubbleOutline as MemoIcon,
  LightbulbOutlined as IdeaIcon,
  StarOutline as EvaluationIcon,
} from '@mui/icons-material';
import { colors } from './styles';

// メモの種別
export type MemoTag = 'question' | 'answer' | 'memo' | 'idea' | 'evaluation';

export interface MemoTagConfig {
  label: string;
  color: string;
  bgColor: string;
  icon: typeof QuestionIcon;
}

export const MEMO_TAGS: Record<MemoTag, MemoTagConfig> = {
  question: { label: '確認事項', color: colors.accent.orange, bgColor: colors.accent.orangeBg, icon: QuestionIcon },
  answer: { label: '回答', color: colors.accent.green, bgColor: colors.accent.greenBg, icon: AnswerIcon },
  memo: { label: 'コメント', color: colors.text.muted, bgColor: 'rgba(107, 114, 128, 0.1)', icon: MemoIcon },
  idea: { label: '気づき', color: colors.accent.purple, bgColor: colors.accent.purpleBg, icon: IdeaIcon },
  evaluation: { label: '評価', color: colors.accent.blue, bgColor: colors.accent.blueBg, icon: EvaluationIcon },
};

// 記録メモの型
export interface RecordMemo {
  id: string;
  createdAt: string;
  updatedAt?: string;
  content: string;
  tag: MemoTag;
  parentId?: string; // 回答の場合、紐づく確認事項のID
}
