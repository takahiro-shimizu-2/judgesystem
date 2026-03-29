import type { Announcement, SubmissionDocument } from '../types';

export type ScheduleEntryType = 'single' | 'range';

export interface SubmissionScheduleItem {
  id: string;
  label: string;
  meaning?: string;
  documentName?: string;
  dateText: string;
  type: ScheduleEntryType;
  isDeadline?: boolean;
}

type NormalizedSubmissionDocument = SubmissionDocument & { __index: number };

interface ScheduleItemInternal extends SubmissionScheduleItem {
  sortValue: number;
  hasValidDate: boolean;
}

const normalizeTimepointType = (value?: string | null): 'start' | 'end' | 'single' => {
  const normalized = (value || '').trim().toLowerCase();
  if (normalized === 'start') return 'start';
  if (normalized === 'end') return 'end';
  return 'single';
};

const getDateDisplayValue = (doc?: SubmissionDocument | null): string => {
  if (!doc) return '日付情報なし';
  return doc.dateValue || doc.dateRaw || '日付情報なし';
};

const hasDocumentDate = (doc?: SubmissionDocument | null): boolean => {
  if (!doc) return false;
  return Boolean(doc.dateValue) || Boolean(doc.dateRaw);
};

const toTimestamp = (doc?: SubmissionDocument | null): number => {
  if (!doc) return Number.MAX_SAFE_INTEGER;
  const source = doc.dateValue || doc.dateRaw;
  if (!source) return Number.MAX_SAFE_INTEGER;
  const parsed = Date.parse(source);
  if (Number.isNaN(parsed)) {
    return Number.MAX_SAFE_INTEGER;
  }
  return parsed;
};

const shouldEmphasize = (meaning?: string | null, documentName?: string | null): boolean => {
  const text = `${meaning || ''}${documentName || ''}`;
  return text.includes('締切') || text.includes('締め切') || text.toLowerCase().includes('deadline');
};

const buildGroupKey = (doc: SubmissionDocument, index: number): string => {
  const docId = (doc.documentId || '').trim();
  if (docId) return `doc-${docId}`;

  const meaning = (doc.dateMeaning || '').trim();
  const name = (doc.name || '').trim();

  if (meaning && name) {
    return `meaning-${meaning}__name-${name}`;
  }

  if (meaning) {
    return `meaning-${meaning}`;
  }

  if (name) {
    return `name-${name}`;
  }

  return `idx-${index}`;
};

const compareDocuments = (a: SubmissionDocument, b: SubmissionDocument): number => {
  const timeDiff = toTimestamp(a) - toTimestamp(b);
  if (timeDiff !== 0) return timeDiff;
  return 0;
};

const createRangeItem = (key: string, startDoc: NormalizedSubmissionDocument, endDoc: NormalizedSubmissionDocument, rangeIndex: number): ScheduleItemInternal => {
  const meaning = startDoc.dateMeaning || endDoc.dateMeaning || undefined;
  const documentName = startDoc.name || endDoc.name || undefined;
  const label = meaning || documentName || 'スケジュール';
  const hasValidDate = hasDocumentDate(startDoc) || hasDocumentDate(endDoc);
  return {
    id: `${key}-range-${rangeIndex}`,
    label,
    meaning,
    documentName,
    dateText: `${getDateDisplayValue(startDoc)} ~ ${getDateDisplayValue(endDoc)}`,
    type: 'range',
    isDeadline: shouldEmphasize(meaning, documentName),
    sortValue: Math.min(toTimestamp(startDoc), toTimestamp(endDoc)),
    hasValidDate,
  };
};

const createSingleItem = (key: string, doc: NormalizedSubmissionDocument, singleIndex: number): ScheduleItemInternal => {
  const meaning = doc.dateMeaning || undefined;
  const documentName = doc.name || undefined;
  const label = meaning || documentName || 'スケジュール';
  const hasValidDate = hasDocumentDate(doc);
  return {
    id: `${key}-single-${singleIndex}-${doc.__index}`,
    label,
    meaning,
    documentName,
    dateText: getDateDisplayValue(doc),
    type: 'single',
    isDeadline: shouldEmphasize(meaning, documentName),
    sortValue: toTimestamp(doc),
    hasValidDate,
  };
};

export const buildScheduleFromSubmissionDocuments = (documents?: SubmissionDocument[]): SubmissionScheduleItem[] => {
  if (!documents || documents.length === 0) return [];

  const groups = new Map<string, NormalizedSubmissionDocument[]>();

  documents.forEach((doc, index) => {
    const key = buildGroupKey(doc, index);
    const list = groups.get(key) || [];
    list.push({ ...doc, __index: index });
    groups.set(key, list);
  });

  const items: ScheduleItemInternal[] = [];

  groups.forEach((groupDocs, key) => {
    const sortedDocs = [...groupDocs].sort((a, b) => {
      const diff = compareDocuments(a, b);
      if (diff !== 0) return diff;
      return a.__index - b.__index;
    });

    const startDocs = sortedDocs.filter((doc) => normalizeTimepointType(doc.timepointType) === 'start');
    const endDocs = sortedDocs.filter((doc) => normalizeTimepointType(doc.timepointType) === 'end');
    const singleDocs = sortedDocs.filter((doc) => normalizeTimepointType(doc.timepointType) === 'single');

    const pairCount = Math.min(startDocs.length, endDocs.length);
    for (let i = 0; i < pairCount; i += 1) {
      items.push(createRangeItem(key, startDocs[i], endDocs[i], i));
    }

    const leftoverStarts = startDocs.slice(pairCount);
    const leftoverEnds = endDocs.slice(pairCount);
    const remainingSingles = [...leftoverStarts, ...leftoverEnds, ...singleDocs];

    remainingSingles.forEach((doc, idx) => {
      items.push(createSingleItem(key, doc, idx));
    });
  });

  const validItems = items.filter((item) => item.hasValidDate);

  if (validItems.length === 0) {
    return [];
  }

  return validItems
    .sort((a, b) => {
      const diff = a.sortValue - b.sortValue;
      if (diff !== 0) return diff;
      return a.id.localeCompare(b.id);
    })
    .map(({ sortValue, hasValidDate, ...rest }) => rest);
};

const legacyTimestamp = (value?: string | null): number => {
  if (!value) return Number.MAX_SAFE_INTEGER;
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return Number.MAX_SAFE_INTEGER;
  return parsed;
};

const normalizeLegacyText = (value?: string | null): string => {
  if (value && value.trim().length > 0) {
    return value;
  }
  return '日付情報なし';
};

const formatRangeText = (start?: string | null, end?: string | null): { dateText: string; type: ScheduleEntryType; sortValue: number } => {
  const startTs = legacyTimestamp(start);
  const endTs = legacyTimestamp(end);
  if (start && end) {
    return { dateText: `${start} ~ ${end}`, type: 'range', sortValue: Math.min(startTs, endTs) };
  }
  if (start) {
    return { dateText: start, type: 'single', sortValue: startTs };
  }
  if (end) {
    return { dateText: end, type: 'single', sortValue: endTs };
  }
  return { dateText: '日付情報なし', type: 'single', sortValue: Number.MAX_SAFE_INTEGER };
};

export const buildFallbackScheduleFromAnnouncement = (announcement: Announcement): SubmissionScheduleItem[] => {
  type FallbackScheduleItem = SubmissionScheduleItem & { sortValue: number };

  const legacyItems: FallbackScheduleItem[] = [
    {
      id: `legacy-publish-${announcement.id}`,
      label: '公告掲載日',
      meaning: '公告掲載日',
      dateText: normalizeLegacyText(announcement.publishDate),
      type: 'single',
      isDeadline: shouldEmphasize('公告掲載日', undefined),
      sortValue: legacyTimestamp(announcement.publishDate),
    },
    {
      id: `legacy-docdist-${announcement.id}`,
      label: '説明書交付期間',
      meaning: '説明書交付期間',
      ...formatRangeText(announcement.explanationStartDate, announcement.explanationEndDate),
    },
    {
      id: `legacy-application-${announcement.id}`,
      label: '申請受付期間',
      meaning: '申請受付期間',
      ...formatRangeText(announcement.applicationStartDate, announcement.applicationEndDate),
    },
    {
      id: `legacy-bid-${announcement.id}`,
      label: '入札期間',
      meaning: '入札期間',
      ...formatRangeText(announcement.bidStartDate, announcement.bidEndDate),
      isDeadline: shouldEmphasize('入札締切', undefined),
    },
    {
      id: `legacy-deadline-${announcement.id}`,
      label: '締切日',
      meaning: '締切日',
      dateText: normalizeLegacyText(announcement.deadline),
      type: 'single',
      isDeadline: true,
      sortValue: legacyTimestamp(announcement.deadline),
    },
  ];

  return legacyItems
    .filter((item) => item.dateText && item.dateText !== '日付情報なし')
    .sort((a, b) => a.sortValue - b.sortValue)
    .map(({ sortValue, ...rest }) => rest);
};
