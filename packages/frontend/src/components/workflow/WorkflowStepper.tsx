import { Box, Typography, useTheme, useMediaQuery } from '@mui/material';
import { CheckCircle as CheckCircleIcon, Lock as LockIcon } from '@mui/icons-material';
import { colors } from '../../constants/styles';

// ============================================================================
// 型定義
// ============================================================================

export interface WorkflowStep {
  id: string;
  label: string;
  shortLabel?: string;
  icon: React.ReactNode;
  status: 'completed' | 'current' | 'locked';
}

export interface WorkflowStepperProps {
  steps: WorkflowStep[];
  onStepClick: (stepId: string) => void;
}

// ============================================================================
// スタイル定数
// ============================================================================

const STEPPER_STYLES = {
  container: {
    display: 'flex',
    alignItems: 'center',
    overflowX: 'auto',
    py: 2,
    px: { xs: 1, sm: 2 },
    gap: { xs: 0.5, sm: 1 },
    '&::-webkit-scrollbar': { height: 4 },
    '&::-webkit-scrollbar-track': { backgroundColor: 'transparent' },
    '&::-webkit-scrollbar-thumb': { backgroundColor: colors.border.dark, borderRadius: 2 },
  },
  stepBox: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    transition: 'all 0.2s ease',
    minWidth: { xs: 64, sm: 80 },
  },
  iconBox: {
    width: { xs: 36, sm: 44 },
    height: { xs: 36, sm: 44 },
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.2s ease',
    position: 'relative',
  },
  label: {
    mt: 1,
    fontSize: { xs: '0.65rem', sm: '0.75rem' },
    textAlign: 'center',
    whiteSpace: 'nowrap',
  },
  connector: {
    width: { xs: 20, sm: 40 },
    height: 2,
    mx: { xs: 0.5, sm: 1 },
    transition: 'background-color 0.3s ease',
  },
} as const;

const STATUS_ICON_COLORS = {
  completed: { bg: colors.workflow.completed.main, icon: colors.text.white },
  current: { bg: colors.primary.main, icon: colors.text.white },
  locked: { bg: colors.border.main, icon: colors.text.light },
} as const;

// ============================================================================
// コンポーネント
// ============================================================================

export function WorkflowStepper({ steps, onStepClick }: WorkflowStepperProps) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  const getIconBoxStyle = (status: WorkflowStep['status']) => {
    const isCompleted = status === 'completed';
    const isCurrent = status === 'current';
    return {
      ...STEPPER_STYLES.iconBox,
      backgroundColor: STATUS_ICON_COLORS[status].bg,
      border: isCurrent ? `3px solid ${colors.accent.blue}` : 'none',
      boxShadow: isCurrent
        ? '0 0 0 4px rgba(59, 130, 246, 0.2)'
        : isCompleted
        ? '0 2px 8px rgba(5, 150, 105, 0.3)'
        : 'none',
    };
  };

  const getLabelColor = (status: WorkflowStep['status']) => {
    if (status === 'completed') return colors.workflow.completed.main;
    if (status === 'current') return colors.primary.main;
    return colors.text.light;
  };

  return (
    <Box sx={STEPPER_STYLES.container}>
      {steps.map((step, index) => {
        const { status } = step;
        const isCompleted = status === 'completed';
        const isCurrent = status === 'current';
        const isLocked = status === 'locked';
        const isClickable = !isLocked;

        return (
          <Box key={step.id} sx={{ display: 'flex', alignItems: 'center' }}>
            <Box
              onClick={() => isClickable && onStepClick(step.id)}
              sx={{
                ...STEPPER_STYLES.stepBox,
                cursor: isClickable ? 'pointer' : 'not-allowed',
                opacity: isLocked ? 0.5 : 1,
                '&:hover': isClickable ? { transform: 'translateY(-2px)' } : {},
              }}
            >
              <Box sx={getIconBoxStyle(status)}>
                {isCompleted ? (
                  <CheckCircleIcon sx={{ fontSize: { xs: 20, sm: 24 }, color: colors.text.white }} />
                ) : isLocked ? (
                  <LockIcon sx={{ fontSize: { xs: 16, sm: 18 }, color: colors.text.light }} />
                ) : (
                  <Box
                    sx={{
                      color: isCurrent ? colors.text.white : colors.text.muted,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      '& svg': { fontSize: { xs: 18, sm: 22 } },
                    }}
                  >
                    {step.icon}
                  </Box>
                )}
              </Box>
              <Typography
                sx={{
                  ...STEPPER_STYLES.label,
                  fontWeight: isCurrent ? 700 : 500,
                  color: getLabelColor(status),
                }}
              >
                {isMobile ? (step.shortLabel || step.label) : step.label}
              </Typography>
            </Box>

            {index < steps.length - 1 && (
              <Box
                sx={{
                  ...STEPPER_STYLES.connector,
                  backgroundColor: steps[index + 1].status !== 'locked'
                    ? colors.workflow.completed.main
                    : colors.border.main,
                }}
              />
            )}
          </Box>
        );
      })}
    </Box>
  );
}
