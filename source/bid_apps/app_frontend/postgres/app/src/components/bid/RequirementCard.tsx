/**
 * 要件カードコンポーネント
 * 入札参加要件の達成/未達成状態を表示する折りたたみカード
 */
import { useState } from 'react';
import { Box, Paper, Typography, Collapse, IconButton } from '@mui/material';
import {
  CheckCircle as CheckCircleIcon,
  Cancel as CancelIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
} from '@mui/icons-material';
import { colors, borderRadius, fontSizes, iconStyles } from '../../constants/styles';
import type { RequirementResult } from '../../types';

// ============================================================================
// 型定義
// ============================================================================

export interface RequirementCardProps {
  requirement: RequirementResult;
  defaultExpanded?: boolean;
}

// ============================================================================
// スタイル定数
// ============================================================================

const CARD_STYLES = {
  met: {
    border: colors.border.main,
    bg: colors.text.white,
    headerBg: colors.text.white,
    hoverBorder: colors.border.dark,
    iconColor: colors.status.success.main,
    categoryColor: colors.text.muted,
  },
  unmet: {
    border: colors.border.main,
    bg: colors.text.white,
    headerBg: colors.status.error.bg,
    hoverBorder: colors.status.error.border,
    iconColor: colors.status.error.main,
    categoryColor: colors.status.error.main,
  },
} as const;

// ============================================================================
// コンポーネント
// ============================================================================

export function RequirementCard({ requirement, defaultExpanded = false }: RequirementCardProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const isMet = requirement.isMet;
  const style = isMet ? CARD_STYLES.met : CARD_STYLES.unmet;

  return (
    <Paper
      elevation={0}
      sx={{
        border: `1px solid ${style.border}`,
        borderRadius: borderRadius.xs,
        overflow: 'hidden',
        transition: 'all 0.15s ease',
        backgroundColor: style.bg,
        '&:hover': {
          borderColor: style.hoverBorder,
        },
      }}
    >
      <Box
        onClick={() => setExpanded(!expanded)}
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          p: 2,
          cursor: 'pointer',
          backgroundColor: style.headerBg,
          '&:hover': { opacity: 0.9 },
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          {isMet ? (
            <CheckCircleIcon sx={{ color: style.iconColor, ...iconStyles.medium }} />
          ) : (
            <CancelIcon sx={{ color: style.iconColor, ...iconStyles.medium }} />
          )}
          <Box>
            <Typography sx={{ fontSize: fontSizes.xs, color: style.categoryColor, fontWeight: 500, mb: 0.25 }}>
              {requirement.category}
            </Typography>
            <Typography sx={{ fontWeight: 500, color: colors.text.secondary, fontSize: fontSizes.sm }}>
              {requirement.name}
            </Typography>
          </Box>
        </Box>
        <IconButton size="small" sx={{ color: colors.text.light }}>
          {expanded ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
        </IconButton>
      </Box>

      <Collapse in={expanded}>
        <Box sx={{ px: 2, pb: 2, pt: 1.5, borderTop: `1px solid ${colors.border.dark}` }}>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            <Box>
              <Typography sx={{ fontSize: fontSizes.xs, fontWeight: 500, color: colors.text.muted, mb: 0.5 }}>
                判断理由
              </Typography>
              <Typography sx={{ fontSize: fontSizes.sm, color: colors.text.secondary, lineHeight: 1.6 }}>
                {requirement.reason}
              </Typography>
            </Box>
            <Box>
              <Typography sx={{ fontSize: fontSizes.xs, fontWeight: 500, color: colors.text.muted, mb: 0.5 }}>
                根拠
              </Typography>
              <Typography sx={{ fontSize: fontSizes.sm, color: colors.text.secondary, lineHeight: 1.6 }}>
                {requirement.evidence}
              </Typography>
            </Box>
          </Box>
        </Box>
      </Collapse>
    </Paper>
  );
}
