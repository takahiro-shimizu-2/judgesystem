/**
 * 詳細ページ用共通コンポーネント
 *
 * PartnerDetailPage, CompanyDetailPage, OrdererDetailPage, AnnouncementDetailPage で使用
 */
import { Box, Paper, Typography, Button, Alert } from '@mui/material';
import { ArrowBack as ArrowBackIcon } from '@mui/icons-material';
import { detailPageStyles } from '../../constants/detailPageStyles';
import { colors, fontSizes, iconStyles, borderRadius } from '../../constants/styles';

// ============================================================================
// DetailInfoRow - アイコン付き情報行
// ============================================================================

export interface DetailInfoRowProps {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  labelWidth?: 'default' | 'wide';
}

export function DetailInfoRow({
  icon,
  label,
  value,
  labelWidth = 'default',
}: DetailInfoRowProps) {
  const labelStyle =
    labelWidth === 'wide'
      ? detailPageStyles.infoLabelWide
      : detailPageStyles.infoLabel;

  return (
    <Box sx={detailPageStyles.infoRow}>
      <Box sx={{ color: colors.border.dark, display: 'flex', alignItems: 'center', '& .MuiSvgIcon-root': iconStyles.small }}>{icon}</Box>
      <Typography sx={labelStyle}>{label}</Typography>
      <Box sx={detailPageStyles.infoValue}>{value}</Box>
    </Box>
  );
}

// ============================================================================
// StatCard - 統計カード
// ============================================================================

export interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  value: string | React.ReactNode;
  color: string;
}

export function StatCard({ icon, label, value, color }: StatCardProps) {
  return (
    <Paper sx={detailPageStyles.statCard}>
      <Box sx={{ color, mb: 1 }}>{icon}</Box>
      <Box sx={{ fontSize: fontSizes.xl, fontWeight: 700, color }}>{value}</Box>
      <Typography sx={{ fontSize: fontSizes.sm, color: colors.text.muted }}>
        {label}
      </Typography>
    </Paper>
  );
}

// ============================================================================
// ScheduleItem - スケジュール項目
// ============================================================================

export interface ScheduleItemProps {
  label: string;
  date: string;
}

export function ScheduleItem({ label, date }: ScheduleItemProps) {
  return (
    <Box sx={detailPageStyles.scheduleItem}>
      <Typography sx={{ color: colors.text.light, fontSize: fontSizes.xs, fontWeight: 500 }}>
        {label}
      </Typography>
      <Typography sx={{ fontWeight: 600, fontSize: fontSizes.sm, color: colors.text.secondary }}>{date}</Typography>
    </Box>
  );
}

// ============================================================================
// NotFoundView - 見つからない場合の表示
// ============================================================================

export interface NotFoundViewProps {
  message: string;
  backLabel: string;
  onBack: () => void;
}

export function NotFoundView({ message, backLabel, onBack }: NotFoundViewProps) {
  return (
    <Box sx={detailPageStyles.notFound}>
      <Alert severity="error" sx={{ mb: 3, borderRadius: borderRadius.xs }}>
        {message}
      </Alert>
      <Button startIcon={<ArrowBackIcon />} onClick={onBack}>
        {backLabel}
      </Button>
    </Box>
  );
}

// ============================================================================
// DetailPageHeader - 詳細ページヘッダー
// ============================================================================

export interface DetailPageHeaderProps {
  title: string;
  backLabel: string;
  onBack: () => void;
  /** 戻るボタンと同じ行に表示する要素（チップ、No等） */
  headerItems?: React.ReactNode;
  /** タイトルの下に表示する要素（従来のchildren） */
  children?: React.ReactNode;
}

export function DetailPageHeader({
  title,
  backLabel,
  onBack,
  headerItems,
  children,
}: DetailPageHeaderProps) {
  return (
    <Box sx={detailPageStyles.header}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 0.5, flexWrap: 'wrap' }}>
        <Button
          startIcon={<ArrowBackIcon />}
          onClick={onBack}
          size="small"
          sx={{ ...detailPageStyles.headerBackButton, mb: 0 }}
        >
          {backLabel}
        </Button>
        {headerItems}
      </Box>
      <Typography variant="h6" sx={{ fontWeight: 700, color: colors.text.secondary }}>
        {title}
      </Typography>
      {children}
    </Box>
  );
}

// ============================================================================
// SectionCard - セクションカード
// ============================================================================

export interface SectionCardProps {
  icon?: React.ReactNode;
  title: React.ReactNode;
  children: React.ReactNode;
}

export function SectionCard({ icon, title, children }: SectionCardProps) {
  return (
    <Paper sx={detailPageStyles.card} elevation={0}>
      <Box sx={{ ...detailPageStyles.sectionTitle, '& .MuiSvgIcon-root': { ...iconStyles.medium, color: colors.text.light } }}>
        {icon}
        <Typography component="span" sx={{ fontSize: 'inherit', fontWeight: 'inherit', letterSpacing: 'inherit' }}>
          {title}
        </Typography>
      </Box>
      {children}
    </Paper>
  );
}
