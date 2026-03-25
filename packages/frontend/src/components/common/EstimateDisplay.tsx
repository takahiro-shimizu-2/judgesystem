import { Box, Typography } from '@mui/material';
import { colors, fontSizes, iconStyles } from '../../constants/styles';
import { CurrencyYen as CurrencyYenIcon } from '@mui/icons-material';
import { PANEL_STYLES } from '../../constants/workflow';
import { formatAmountInManYen } from '../../utils';

export interface EstimateDisplayProps {
  estimatedAmountMin?: number;
  estimatedAmountMax?: number;
}

const STYLES = {
  container: {
    display: 'flex',
    alignItems: 'center',
    gap: 1.5,
    px: 2,
    py: 1.5,
    borderBottom: `1px solid ${colors.border.main}`,
    backgroundColor: PANEL_STYLES.estimate.backgroundColor,
  },
  iconBox: {
    width: 40,
    height: 40,
    borderRadius: '10px',
    background: PANEL_STYLES.estimate.iconGradient,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 2px 8px rgba(16,185,129,0.3)',
  },
  label: {
    fontSize: fontSizes.xs,
    color: colors.text.muted,
    fontWeight: 500,
    lineHeight: 1,
    mb: 0.5,
  },
  amount: {
    fontSize: fontSizes.lg,
    fontWeight: 700,
    color: colors.text.secondary,
    lineHeight: 1.2,
  },
} as const;

/**
 * 見積予想金額表示コンポーネント
 * 右サイドバーの上部に表示される
 */
export function EstimateDisplay({ estimatedAmountMin, estimatedAmountMax }: EstimateDisplayProps) {
  return (
    <Box sx={STYLES.container}>
      <Box sx={STYLES.iconBox}>
        <CurrencyYenIcon sx={{ ...iconStyles.large, color: colors.text.white }} />
      </Box>
      <Box sx={{ flex: 1 }}>
        <Typography sx={STYLES.label}>見積予想金額</Typography>
        <Typography sx={STYLES.amount}>
          {formatAmountInManYen(estimatedAmountMin, estimatedAmountMax)}
        </Typography>
      </Box>
    </Box>
  );
}
