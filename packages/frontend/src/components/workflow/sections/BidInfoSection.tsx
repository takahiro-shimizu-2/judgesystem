/**
 * 入札情報セクション（サイドバー）
 * 概要・スケジュール情報を表示
 */
import { Box, Chip, Typography } from '@mui/material';
import { CollapsibleSection, InfoRow } from '../../common';
import { colors, chipStyles } from '../../../constants/styles';
import { bidTypeConfig } from '../../../constants/bidType';
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
  const scheduleItems = [
    { label: '申請書提出日', value: announcement.deadline },
    {
      label: '入札書提出期間',
      value: `${announcement.bidStartDate} 〜 ${announcement.bidEndDate}`,
    },
    {
      label: '説明書交付期間',
      value: `${announcement.explanationStartDate} 〜 ${announcement.explanationEndDate}`,
    },
    { label: '公告掲載日', value: announcement.publishDate },
  ];

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
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {scheduleItems.map((item) => (
            <InfoRow key={item.label} label={item.label} value={item.value} />
          ))}
          {announcement.submissionDocuments && announcement.submissionDocuments.length > 0 && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
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
        </Box>
      </CollapsibleSection>
    </Box>
  );
}
