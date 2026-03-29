/**
 * 入札情報セクション（サイドバー）
 * 概要・スケジュール情報を表示
 */
import { Box, Chip, Typography } from '@mui/material';
import { CollapsibleSection, InfoRow } from '../../common';
import { colors, chipStyles } from '../../../constants/styles';
import { bidTypeConfig } from '../../../constants/bidType';
import { buildScheduleFromSubmissionDocuments, buildFallbackScheduleFromAnnouncement, type SubmissionScheduleItem } from '../../../utils';
import type { Announcement } from '../../../types';

export interface BidInfoSectionProps {
  announcement: Announcement;
}

const formatCategoryLabel = (segment?: string, detail?: string, fallback?: string): string => {
  if (segment && detail) return `${segment}／${detail}`;
  if (segment) return segment;
  if (detail) return detail;
  return fallback || '未分類';
};

export function BidInfoSection({ announcement }: BidInfoSectionProps) {
  const derivedSchedule = buildScheduleFromSubmissionDocuments(announcement.submissionDocuments);
  const fallbackSchedule = buildFallbackScheduleFromAnnouncement(announcement);
  const scheduleItems: SubmissionScheduleItem[] = derivedSchedule.length > 0 ? derivedSchedule : fallbackSchedule;
  const hasSchedule = scheduleItems.length > 0;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      <CollapsibleSection title="概要情報">
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          <InfoRow
            label="カテゴリ"
            value={
              <Chip
                label={formatCategoryLabel(announcement.categorySegment, announcement.categoryDetail, announcement.category)}
                size="small"
                sx={{
                  ...chipStyles.small,
                  backgroundColor: colors.accent.blueBg,
                  color: colors.accent.blue,
                }}
              />
            }
          />
          {announcement.bidType && (
            <InfoRow
              label="入札形式"
              value={
                <Chip
                  label={bidTypeConfig[announcement.bidType].label}
                  size="small"
                  sx={{
                    ...chipStyles.small,
                    backgroundColor: colors.accent.greenBg,
                    color: colors.accent.green,
                  }}
                />
              }
            />
          )}
          <InfoRow label="工事場所" value={announcement.workLocation} />
        </Box>
      </CollapsibleSection>

      <CollapsibleSection title="スケジュール">
        {!hasSchedule && (
          <Typography sx={{ color: colors.text.light }}>スケジュール情報はありません。</Typography>
        )}
        {hasSchedule && (
          <Box sx={{ border: `1px solid ${colors.border.light}`, borderRadius: 1, overflow: 'hidden' }}>
            {scheduleItems.map((item, index) => (
              <Box
                key={item.id}
                sx={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  gap: 1.5,
                  px: 1.5,
                  py: 1,
                  borderBottom: index < scheduleItems.length - 1 ? `1px solid ${colors.border.light}` : 'none',
                  backgroundColor: item.isDeadline ? colors.accent.redBg : 'transparent',
                }}
              >
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography sx={{ fontWeight: 600, color: item.isDeadline ? colors.accent.red : colors.text.secondary }}>
                    {item.meaning || item.label}
                  </Typography>
                  {item.documentName && (
                    <Typography sx={{ fontSize: '0.8rem', color: colors.text.light }}>
                      書類: {item.documentName}
                    </Typography>
                  )}
                </Box>
                <Typography
                  sx={{
                    fontWeight: 600,
                    color: item.isDeadline ? colors.accent.red : colors.text.primary,
                    textAlign: 'right',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {item.dateText}
                </Typography>
              </Box>
            ))}
          </Box>
        )}
        {announcement.submissionDocuments && announcement.submissionDocuments.length > 0 && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, mt: 1.5 }}>
            <Typography sx={{ fontWeight: 600, color: colors.primary.main }}>提出書類と期日</Typography>
            {announcement.submissionDocuments.map((doc, idx) => (
              <Box
                key={`${doc.documentId || 'doc'}-${idx}`}
                sx={{
                  border: `1px solid ${colors.border.light}`,
                  borderRadius: 1,
                  p: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 0.5,
                  backgroundColor: colors.background.paper,
                }}
              >
                <Typography sx={{ fontWeight: 600, color: colors.text.primary }}>
                  {doc.name || '提出書類'}
                </Typography>
                <Typography sx={{ color: colors.text.secondary }}>
                  期日: {doc.dateValue || doc.dateRaw || '日付情報なし'}
                </Typography>
                {doc.dateMeaning && (
                  <Typography sx={{ fontSize: '0.8rem', color: colors.text.light }}>
                    {doc.dateMeaning}
                  </Typography>
                )}
              </Box>
            ))}
          </Box>
        )}
      </CollapsibleSection>
    </Box>
  );
}
