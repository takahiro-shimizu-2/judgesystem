/**
 * OrdererWorkflowSection 共有ユーティリティ・型定義
 * サブコンポーネント間で共有する定数・関数・型をまとめる
 */
import type { MemoTag } from '../../../constants/memoTags';
import type { WorkflowRecordMemo } from '../../../types';
import { colors, fontSizes, borderRadius } from '../../../constants/styles';

export type CallMemo = WorkflowRecordMemo;
export type EvaluationMemo = WorkflowRecordMemo;

export const STYLES = {
  callLogCard: {
    p: 2,
    backgroundColor: colors.text.white,
    borderRadius: borderRadius.xs,
    border: `1px solid ${colors.border.main}`,
    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)',
  },
  tagButton: {
    minWidth: 'auto',
    px: 1.5,
    py: 0.5,
    fontSize: fontSizes.xs,
    borderRadius: borderRadius.xs,
    textTransform: 'none' as const,
  },
} as const;

export const CATEGORY_ORDER: Record<MemoTag, number> = {
  question: 1,
  answer: 2,
  memo: 3,
  idea: 4,
  evaluation: 5,
};

export const SCRIPT_TEMPLATE_IDS = ['intro', 'followup'] as const;
export const EMAIL_TEMPLATE_IDS = ['1', '2', '3'] as const;

export const createId = (prefix: string): string =>
  `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;

export const formatTimestamp = (date: Date = new Date()): string =>
  `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;

export const parseTimestamp = (value: string): number =>
  new Date(value.replace(/\//g, '-')).getTime();

export const sortMemos = (items: CallMemo[], type: 'newest' | 'oldest' | 'category'): CallMemo[] => {
  return [...items].sort((a, b) => {
    if (type === 'category') {
      const categoryDiff = CATEGORY_ORDER[a.tag] - CATEGORY_ORDER[b.tag];
      if (categoryDiff !== 0) {
        return categoryDiff;
      }
      return parseTimestamp(b.createdAt) - parseTimestamp(a.createdAt);
    }

    const aTime = parseTimestamp(a.createdAt);
    const bTime = parseTimestamp(b.createdAt);
    return type === 'newest' ? bTime - aTime : aTime - bTime;
  });
};

export const sortByCreatedAt = <T extends { createdAt: string }>(items: T[], newest: boolean): T[] =>
  [...items].sort((a, b) => {
    const aTime = parseTimestamp(a.createdAt);
    const bTime = parseTimestamp(b.createdAt);
    return newest ? bTime - aTime : aTime - bTime;
  });

export const getSortLabel = (type: 'newest' | 'oldest' | 'category'): string => {
  if (type === 'oldest') {
    return '古い順';
  }
  if (type === 'category') {
    return 'カテゴリー順';
  }
  return '新しい順';
};

export const getNextSortType = (current: 'newest' | 'oldest' | 'category'): 'newest' | 'oldest' | 'category' => {
  if (current === 'newest') {
    return 'oldest';
  }
  if (current === 'oldest') {
    return 'category';
  }
  return 'newest';
};

export const readFileAsDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });

export const triggerDownload = (doc: { dataUrl?: string; fileName?: string; name: string }) => {
  if (!doc.dataUrl) {
    return;
  }

  const link = document.createElement('a');
  link.href = doc.dataUrl;
  link.download = doc.fileName || doc.name;
  link.click();
};
