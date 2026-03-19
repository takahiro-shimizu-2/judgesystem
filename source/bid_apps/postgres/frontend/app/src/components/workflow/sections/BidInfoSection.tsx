/**
 * 入札情報セクション
 * 資料リンク、概要情報、スケジュールを表示
 */
import { Box, Typography, Button, Chip } from '@mui/material';
import { OpenInNew as OpenInNewIcon } from '@mui/icons-material';
import { CollapsibleSection, InfoRow } from '../../common';
import { colors, buttonStyles, fontSizes, chipStyles, borderRadius } from '../../../constants/styles';
import { bidTypeConfig } from '../../../constants/bidType';
import { getDocumentTypeConfig, getFileFormatConfig } from '../../../constants/documentType';
import type { Announcement } from '../../../types';

// ============================================================================
// 型定義
// ============================================================================

export interface BidInfoSectionProps {
  announcement: Announcement;
}

// ============================================================================
// スタイル定数
// ============================================================================

const DOCUMENT_LINK_BUTTON_STYLE = {
  ...buttonStyles.action,
  justifyContent: 'space-between',
  fontWeight: 500,
} as const;

// ============================================================================
// サブコンポーネント
// ============================================================================

interface DocumentLinkButtonProps {
  label: string;
  href?: string;
  disabled?: boolean;
}

function DocumentLinkButton({ label, href, disabled = false }: DocumentLinkButtonProps) {
  const baseProps = {
    variant: 'outlined' as const,
    size: 'small' as const,
    endIcon: <OpenInNewIcon fontSize="small" />,
    disabled,
    sx: {
      ...DOCUMENT_LINK_BUTTON_STYLE,
      color: disabled ? colors.text.light : colors.primary.main,
      '&:hover': disabled
        ? {}
        : {
            borderColor: colors.accent.blue,
            backgroundColor: 'rgba(59, 130, 246, 0.04)',
          },
    },
  };

  if (disabled) {
    return <Button {...baseProps}>{label}</Button>;
  }

  return (
    <Button
      {...baseProps}
      component="a"
      href={href || '#'}
      target="_blank"
      rel="noopener noreferrer"
    >
      {label}
    </Button>
  );
}

// ============================================================================
// コンポーネント
// ============================================================================

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
    <Box sx={{ display: 'flex', flexDirection: 'column' }}>
      {/* 概要情報 */}
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

      {/* スケジュール */}
      <CollapsibleSection title="スケジュール">
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {scheduleItems.map((item) => (
            <InfoRow key={item.label} label={item.label} value={item.value} />
          ))}
        </Box>
      </CollapsibleSection>

      {/* 資料リンク */}
      <CollapsibleSection title="資料リンク">
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {announcement.documents && announcement.documents.length > 0 ? (
            announcement.documents.map((doc) => {
              const typeConfig = getDocumentTypeConfig(doc.type);
              const formatConfig = getFileFormatConfig(doc.fileFormat);
              return (
                <DocumentLinkButton
                  key={doc.id}
                  label={`${typeConfig.label}（${formatConfig.label}）`}
                  href={doc.url}
                  disabled={!doc.url}
                />
              );
            })
          ) : (
            <Typography sx={{ fontSize: fontSizes.xs2, color: colors.text.light }}>
              資料がありません
            </Typography>
          )}
        </Box>
      </CollapsibleSection>

      {/* 資料文字起こし */}
      {announcement.documents && announcement.documents.length > 0 && (
        announcement.documents.map((doc) => {
          return (
            <CollapsibleSection
              key={doc.id}
              title={`${doc.title}（文字起こし）`}
              defaultExpanded={false}
            >
              <Box
                sx={{
                  backgroundColor: colors.background.default,
                  borderRadius: borderRadius.xs,
                  p: 1.5,
                  maxHeight: 300,
                  overflow: 'auto',
                  '&::-webkit-scrollbar': { width: 6 },
                  '&::-webkit-scrollbar-track': { backgroundColor: colors.background.hover, borderRadius: 3 },
                  '&::-webkit-scrollbar-thumb': { backgroundColor: colors.border.dark, borderRadius: 3 },
                }}
              >
                <Typography
                  component="pre"
                  sx={{
                    fontSize: fontSizes.xs2,
                    color: colors.text.secondary,
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    fontFamily: 'inherit',
                    margin: 0,
                    lineHeight: 1.7,
                  }}
                >
                  {doc.content}
                </Typography>
              </Box>
            </CollapsibleSection>
          );
        })
      )}
    </Box>
  );
}
