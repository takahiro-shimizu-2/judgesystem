/**
 * 入札情報セクション（サイドバー）
 * 概要・スケジュール情報を表示
 */
import { Box, Chip, Typography } from '@mui/material';
import { CollapsibleSection, InfoRow } from '../../common';
import { colors, chipStyles } from '../../../constants/styles';
import { bidTypeConfig } from '../../../constants/bidType';
import { buildScheduleFromSubmissionDocuments, buildFallbackScheduleFromAnnouncement, buildSubmissionDocumentDisplayItems, type SubmissionScheduleItem } from '../../../utils';
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
  const submissionDocumentItems = buildSubmissionDocumentDisplayItems(announcement.submissionDocuments);
  const hasSubmissionDocuments = submissionDocumentItems.length > 0;

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
      </CollapsibleSection>

      {hasSubmissionDocuments && (
        <CollapsibleSection title="提出書類と期日">
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            {submissionDocumentItems.map((item) => (
              <Box
                key={item.id}
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
                  {item.documentName || '提出書類'}
                </Typography>
                {item.meaning && (
                  <Typography sx={{ fontSize: '0.8rem', color: colors.text.light }}>
                    {item.meaning}
                  </Typography>
                )}
                <Typography sx={{ color: colors.text.secondary }}>
                  {item.type === 'range' ? '期間' : '期日'}: {item.dateText}
                </Typography>
                <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                  <Chip
                    size="small"
                    label={item.type === 'range' ? '期間' : '単日'}
                    sx={{ height: 20, fontSize: '0.75rem' }}
                  />
                  {item.documentIds.map((docId) => (
                    <Chip
                      key={`${item.id}-${docId}`}
                      size="small"
                      label={`ID: ${docId}`}
                      sx={{ height: 20, fontSize: '0.75rem', color: colors.text.light }}
                    />
                  ))}
                </Box>
              </Box>
            ))}
          </Box>
        </CollapsibleSection>
      )}
    </Box>
  );
}
