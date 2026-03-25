import { Box, Typography } from '@mui/material';
import { colors, fontSizes } from '../../constants/styles';

export interface InfoRowProps {
  label: string;
  value: React.ReactNode;
  icon?: React.ReactNode;
  /** アイコン付きリスト形式（borderBottom付き）で表示 */
  variant?: 'default' | 'list';
}

/**
 * ラベル+値の行コンポーネント
 * スケジュールなどのキー・バリュー形式の表示で使用
 */
export function InfoRow({ label, value, icon, variant = 'default' }: InfoRowProps) {
  if (variant === 'list') {
    return (
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5, py: 1, borderBottom: `1px solid ${colors.border.light}`, '&:last-child': { borderBottom: 'none' } }}>
        {icon && <Box sx={{ mt: 0.25 }}>{icon}</Box>}
        {/* ラベル: ワイドモニター(xl)以上のみ表示 */}
        <Typography sx={{ display: { xs: 'none', xl: 'block' }, fontSize: fontSizes.xs2, color: colors.text.muted, fontWeight: 500, minWidth: 56, flexShrink: 0 }}>{label}</Typography>
        <Typography component="div" sx={{ fontSize: fontSizes.xs2, color: colors.text.secondary, fontWeight: 500, flex: 1 }}>{value}</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <Typography sx={{ fontSize: fontSizes.xs2, color: colors.text.muted }}>{label}</Typography>
      <Typography component="div" sx={{ fontSize: fontSizes.sm, color: colors.text.secondary, fontWeight: 500 }}>{value}</Typography>
    </Box>
  );
}
