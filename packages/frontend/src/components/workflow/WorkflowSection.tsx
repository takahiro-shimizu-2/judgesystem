import { Box, Paper, Typography, Collapse, IconButton, Chip, LinearProgress } from '@mui/material';
import {
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
  CheckCircle as CheckCircleIcon,
  Lock as LockIcon,
  RadioButtonUnchecked as PendingIcon,
} from '@mui/icons-material';
import { colors, borderRadius, iconStyles, chipStyles } from '../../constants/styles';
import { getWorkflowStatusColor, getWorkflowStatusBgColor, type WorkflowStatusType } from '../../utils/status';

// ============================================================================
// 型定義
// ============================================================================

export interface WorkflowSectionProps {
  id: string;
  title: string;
  icon: React.ReactNode;
  status: 'completed' | 'current' | 'locked';
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  progress?: number;
  subLabel?: string;
  actionButton?: React.ReactNode;
}

// ============================================================================
// スタイル定数
// ============================================================================

const SECTION_STYLES = {
  paper: {
    borderRadius: borderRadius.xl,
    overflow: 'hidden',
    transition: 'all 0.2s ease',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    p: { xs: 2, sm: 2.5 },
    transition: 'background-color 0.2s ease',
  },
  iconBox: {
    width: { xs: 36, sm: 40 },
    height: { xs: 36, sm: 40 },
    borderRadius: '10px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontWeight: 600,
    fontSize: { xs: '0.95rem', sm: '1.05rem' },
  },
  subLabel: {
    fontSize: { xs: '0.7rem', sm: '0.75rem' },
    color: colors.text.muted,
    mt: 0.25,
  },
  chip: {
    ...chipStyles.small,
    display: { xs: 'none', sm: 'flex' },
  },
  content: {
    p: { xs: 2, sm: 3 },
    pt: { xs: 1, sm: 1.5 },
    borderTop: `1px solid ${colors.border.light}`,
  },
} as const;

const STATUS_LABELS: Record<WorkflowStatusType, string> = {
  completed: '完了',
  current: '進行中',
  locked: '未着手',
};

// ============================================================================
// コンポーネント
// ============================================================================

export function WorkflowSection({
  id,
  title,
  icon,
  status,
  expanded,
  onToggle,
  children,
  progress,
  subLabel,
  actionButton,
}: WorkflowSectionProps) {
  const isCompleted = status === 'completed';
  const isCurrent = status === 'current';
  const isLocked = status === 'locked';

  const statusColor = getWorkflowStatusColor(status);
  const statusBgColor = getWorkflowStatusBgColor(status);

  const statusIcon = isCompleted
    ? <CheckCircleIcon sx={{ ...iconStyles.medium, color: colors.workflow.completed.main }} />
    : isLocked
      ? <LockIcon sx={{ ...iconStyles.small, color: colors.workflow.locked.main }} />
      : <PendingIcon sx={{ ...iconStyles.medium, color: colors.workflow.active.main }} />;

  return (
    <Paper
      id={`section-${id}`}
      elevation={0}
      sx={{
        ...SECTION_STYLES.paper,
        border: `1px solid ${isCurrent ? colors.accent.blue : colors.border.main}`,
        opacity: isLocked ? 0.6 : 1,
        boxShadow: isCurrent ? '0 0 0 3px rgba(59, 130, 246, 0.15)' : 'none',
      }}
    >
      {/* ヘッダー */}
      <Box
        onClick={() => !isLocked && onToggle()}
        sx={{
          ...SECTION_STYLES.header,
          cursor: isLocked ? 'not-allowed' : 'pointer',
          backgroundColor: expanded ? statusBgColor : 'transparent',
          '&:hover': !isLocked ? { backgroundColor: statusBgColor } : {},
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: { xs: 1.5, sm: 2 }, flex: 1 }}>
          {/* セクションアイコン */}
          <Box
            sx={{
              ...SECTION_STYLES.iconBox,
              backgroundColor: statusBgColor,
              color: statusColor,
              '& svg': { fontSize: { xs: 20, sm: 22 } },
            }}
          >
            {icon}
          </Box>

          {/* タイトル・サブラベル */}
          <Box sx={{ flex: 1 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography sx={{ ...SECTION_STYLES.title, color: statusColor }}>
                {title}
              </Typography>
              {statusIcon}
            </Box>
            {subLabel && <Typography sx={SECTION_STYLES.subLabel}>{subLabel}</Typography>}
          </Box>

          {/* ステータスチップ */}
          <Chip
            size="small"
            label={STATUS_LABELS[status]}
            sx={{
              ...SECTION_STYLES.chip,
              backgroundColor: `${statusColor}20`,
              color: statusColor,
            }}
          />
        </Box>

        {/* 展開ボタン */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          {actionButton && !isLocked && expanded && (
            <Box onClick={(e) => e.stopPropagation()}>{actionButton}</Box>
          )}
          <IconButton
            size="small"
            sx={{
              color: isLocked ? colors.workflow.locked.main : colors.text.muted,
              '&:hover': { backgroundColor: 'rgba(0,0,0,0.04)' },
            }}
            disabled={isLocked}
          >
            {expanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
          </IconButton>
        </Box>
      </Box>

      {/* プログレスバー */}
      {progress !== undefined && expanded && (
        <LinearProgress
          variant="determinate"
          value={progress}
          sx={{
            height: 3,
            backgroundColor: colors.border.main,
            '& .MuiLinearProgress-bar': {
              backgroundColor: isCompleted ? colors.workflow.completed.main : colors.workflow.active.main,
            },
          }}
        />
      )}

      {/* コンテンツ */}
      <Collapse in={expanded && !isLocked}>
        <Box sx={SECTION_STYLES.content}>{children}</Box>
      </Collapse>
    </Paper>
  );
}
