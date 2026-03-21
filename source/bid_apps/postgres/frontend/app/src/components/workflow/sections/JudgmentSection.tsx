import { Box, Typography, LinearProgress, Chip } from '@mui/material';
import { CheckCircle as CheckCircleIcon, Cancel as CancelIcon } from '@mui/icons-material';
import type { RequirementResult, EvaluationStatus } from '../../../types';
import { RequirementCard } from '../../bid';
import { colors, fontSizes, iconStyles, chipStyles, borderRadius } from '../../../constants/styles';

interface JudgmentSectionProps {
  requirements: RequirementResult[];
  status: EvaluationStatus;
}

export function JudgmentSection({ requirements, status }: JudgmentSectionProps) {
  if (!requirements || !Array.isArray(requirements)) {
    return <Typography>要件データを読み込んでいます...</Typography>;
  }

  const metRequirements = requirements.filter((r) => r.isMet);
  const unmetRequirements = requirements.filter((r) => !r.isMet);
  const totalCount = requirements.length;
  const metCount = metRequirements.length;
  const progressPercent = totalCount > 0 ? (metCount / totalCount) * 100 : 0;

  const getStatusInfo = () => {
    switch (status) {
      case 'all_met':
        return {
          label: '参加可能',
          color: colors.text.white,
          bgColor: colors.accent.greenSuccess,
          textColor: colors.text.white,
        };
      case 'other_only_unmet':
        return {
          label: '条件付き参加',
          color: colors.text.white,
          bgColor: colors.accent.orangeDark,
          textColor: colors.text.white,
        };
      default:
        return {
          label: '参加不可',
          color: colors.text.white,
          bgColor: colors.status.error.main,
          textColor: colors.text.white,
        };
    }
  };

  const statusInfo = getStatusInfo();

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <Box
        sx={{
          p: 2.5,
          borderRadius: borderRadius.xs,
          backgroundColor: statusInfo.bgColor,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
          <Typography sx={{ fontWeight: 600, fontSize: fontSizes.md, color: colors.text.white }}>
            総合判定
          </Typography>
          <Chip
            label={statusInfo.label}
            size="small"
            sx={{
              ...chipStyles.small,
              backgroundColor: 'rgba(255,255,255,0.2)',
              color: colors.text.white,
            }}
          />
        </Box>
        <Box sx={{ mb: 1.5 }}>
          <LinearProgress
            variant="determinate"
            value={progressPercent}
            sx={{
              height: 6,
              borderRadius: 3,
              backgroundColor: 'rgba(255,255,255,0.3)',
              '& .MuiLinearProgress-bar': {
                borderRadius: 3,
                backgroundColor: colors.text.white,
              },
            }}
          />
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <CheckCircleIcon sx={{ ...iconStyles.small, color: colors.text.white }} />
              <Typography sx={{ fontSize: fontSizes.xs, color: 'rgba(255,255,255,0.9)', fontWeight: 500 }}>
                OK: {metCount}件
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <CancelIcon sx={{ ...iconStyles.small, color: colors.text.white }} />
              <Typography sx={{ fontSize: fontSizes.xs, color: 'rgba(255,255,255,0.9)', fontWeight: 500 }}>
                NG: {unmetRequirements.length}件
              </Typography>
            </Box>
          </Box>
          <Typography sx={{ fontWeight: 700, fontSize: fontSizes.base, color: colors.text.white }}>
            {Math.round(progressPercent)}%
          </Typography>
        </Box>
      </Box>

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        {unmetRequirements.length > 0 && (
          <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
              <Box
                sx={{
                  width: 4,
                  height: 18,
                  borderRadius: 2,
                  backgroundColor: colors.status.error.main,
                }}
              />
              <Typography sx={{ fontWeight: 600, color: colors.text.secondary, fontSize: fontSizes.md }}>
                未達成要件
              </Typography>
              <Typography sx={{ fontSize: fontSizes.xs, color: colors.text.muted }}>
                {unmetRequirements.length}件
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
              {unmetRequirements.map((req) => (
                <RequirementCard key={req.id} requirement={req} defaultExpanded={true} />
              ))}
            </Box>
          </Box>
        )}

        {metRequirements.length > 0 && (
          <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
              <Box
                sx={{
                  width: 4,
                  height: 18,
                  borderRadius: 2,
                  backgroundColor: colors.accent.greenSuccess,
                }}
              />
              <Typography sx={{ fontWeight: 600, color: colors.text.secondary, fontSize: fontSizes.md }}>
                達成要件
              </Typography>
              <Typography sx={{ fontSize: fontSizes.xs, color: colors.text.muted }}>
                {metRequirements.length}件
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
              {metRequirements.map((req) => (
                <RequirementCard key={req.id} requirement={req} defaultExpanded={false} />
              ))}
            </Box>
          </Box>
        )}
      </Box>
    </Box>
  );
}
