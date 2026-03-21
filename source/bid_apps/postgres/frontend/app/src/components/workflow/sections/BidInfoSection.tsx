/**
 * 入札情報セクション（サイドバー）
 * 概要・スケジュール情報を表示
 */
import { Box, Chip } from '@mui/material';
import { CollapsibleSection, InfoRow } from '../../common';
import { colors, chipStyles } from '../../../constants/styles';
import { bidTypeConfig } from '../../../constants/bidType';
import type { Announcement } from '../../../types';

export interface BidInfoSectionProps {
  announcement: Announcement;
}

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
                label={announcement.category}
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
        </Box>
      </CollapsibleSection>
    </Box>
  );
}
