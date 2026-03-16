import { Box, Typography, type SxProps, type Theme } from '@mui/material';
import { colors, fontSizes } from '../../constants/styles';

export interface IconTextProps {
  icon: React.ReactNode;
  text: string;
  fontWeight?: number;
  color?: string;
  alignItems?: 'center' | 'flex-start';
  sx?: SxProps<Theme>;
}

/**
 * アイコン付きテキスト行コンポーネント
 * 連絡先情報などアイコン+テキストの表示パターンで使用
 */
export function IconText({
  icon,
  text,
  fontWeight = 400,
  color = colors.text.secondary,
  alignItems = 'center',
  sx,
}: IconTextProps) {
  return (
    <Box sx={{ display: 'flex', alignItems, gap: 1.5, ...sx }}>
      {icon}
      <Typography
        sx={{
          fontSize: fontSizes.sm,
          color,
          fontWeight,
          lineHeight: alignItems === 'flex-start' ? 1.5 : 'inherit',
        }}
      >
        {text}
      </Typography>
    </Box>
  );
}
