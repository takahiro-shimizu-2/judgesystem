import { Box, Typography, Chip, Button } from '@mui/material';
import {
  ArrowBack as ArrowBackIcon,
  Business as BusinessIcon,
  Schedule as ScheduleIcon,
} from '@mui/icons-material';
import type { BidEvaluation, EvaluationStatus, CompanyPriority, WorkStatus } from '../../types';
import { priorityColors, priorityLabels } from '../../constants/priority';
import { evaluationStatusConfig } from '../../constants/status';
import { workStatusConfig } from '../../constants/workStatus';
import { getDaysUntilDeadline, getDeadlineInfo } from '../../utils';
import { fontSizes, chipStyles, iconStyles, borderRadius } from '../../constants/styles';

// ============================================================================
// スタイル定数
// ============================================================================

const HEADER_STYLES = {
  container: {
    background: 'linear-gradient(135deg, #0f172a 0%, #1e3a5f 50%, #334155 100%)',
    color: '#fff',
    px: 4,
    py: 2.5,
    display: 'flex',
    justifyContent: 'space-between',
    gap: 3,
  },
  backButton: {
    color: '#fff',
    fontSize: fontSizes.sm,
    fontWeight: 600,
    backgroundColor: 'rgba(255,255,255,0.15)',
    border: '1px solid rgba(255,255,255,0.3)',
    borderRadius: borderRadius.md,
    px: 2,
    py: 0.75,
    '&:hover': { backgroundColor: 'rgba(255,255,255,0.25)' },
  },
  chip: {
    ...chipStyles.medium,
  },
  companyBox: {
    display: { xs: 'none', md: 'flex' },
    alignItems: 'center',
    gap: 1.5,
    px: 2.5,
    py: 1.5,
    borderRadius: borderRadius.md,
    backgroundColor: 'rgba(255,255,255,0.15)',
    border: '1px solid rgba(255,255,255,0.3)',
    flexShrink: 0,
  },
} as const;

// ============================================================================
// サブコンポーネント
// ============================================================================

interface StatusChipProps {
  icon?: React.ElementType;
  label: string;
  gradient?: string;
  bgColor?: string;
  color?: string;
}

function StatusChip({ icon: Icon, label, gradient, bgColor, color }: StatusChipProps) {
  return (
    <Chip
      icon={Icon ? <Icon sx={{ ...iconStyles.small, color: gradient ? '#fff !important' : color }} /> : undefined}
      label={label}
      size="small"
      sx={{
        ...HEADER_STYLES.chip,
        ...(gradient ? { background: gradient, color: '#fff' } : { backgroundColor: bgColor, color }),
        '& .MuiChip-icon': { color: gradient ? '#fff' : color },
      }}
    />
  );
}

// ============================================================================
// メインコンポーネント
// ============================================================================

export interface DetailHeaderProps {
  evaluation: BidEvaluation;
  onBack: () => void;
}

/**
 * 詳細ページヘッダー
 * ステータス、優先度、締切情報、企業情報を表示
 */
export function DetailHeader({ evaluation, onBack }: DetailHeaderProps) {
  const { announcement, company, branch, status, workStatus } = evaluation;
  const config = evaluationStatusConfig[status as EvaluationStatus];
  const wsConfig = workStatusConfig[workStatus as WorkStatus];
  const daysUntilDeadline = getDaysUntilDeadline(announcement.deadline);
  const deadlineInfo = getDeadlineInfo(daysUntilDeadline);
  const priorityConfig = priorityColors[company.priority as CompanyPriority];
  const priorityLabel = priorityLabels[company.priority as CompanyPriority];

  return (
    <Box sx={HEADER_STYLES.container}>
      {/* 左側：ステータス行とタイトル */}
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 1.5 }}>
          <Button startIcon={<ArrowBackIcon />} onClick={onBack} sx={HEADER_STYLES.backButton}>
            一覧へ戻る
          </Button>
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
            <StatusChip icon={wsConfig.icon} label={wsConfig.label} bgColor={wsConfig.bgColor} color={wsConfig.color} />
            <StatusChip icon={config.icon} label={config.label} gradient={config.gradient} />
            <StatusChip
              label={`優先度: ${priorityLabel}`}
              gradient={priorityConfig.gradient}
            />
            <StatusChip
              icon={ScheduleIcon}
              label={deadlineInfo.label}
              bgColor={deadlineInfo.bgColor}
              color={deadlineInfo.color}
            />
            <Typography sx={{ fontSize: fontSizes.sm, color: 'rgba(255,255,255,0.9)', ml: 1 }}>
              締切: {announcement.deadline}
            </Typography>
          </Box>
        </Box>
        <Typography sx={{ fontSize: fontSizes.xl, fontWeight: 700, lineHeight: 1.3 }}>
          {announcement.title}
        </Typography>
      </Box>

      {/* 右側：企業情報 */}
      <Box sx={HEADER_STYLES.companyBox}>
        <BusinessIcon sx={{ ...iconStyles.large, color: '#fff' }} />
        <Box>
          <Typography sx={{ fontSize: fontSizes.base, fontWeight: 700, color: '#fff', lineHeight: 1.2 }}>
            {company.name}
          </Typography>
          <Typography sx={{ fontSize: fontSizes.sm, color: 'rgba(255,255,255,0.8)', lineHeight: 1.2 }}>
            {branch.name}
          </Typography>
        </Box>
      </Box>
    </Box>
  );
}
