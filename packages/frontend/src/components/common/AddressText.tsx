import { Box, Typography } from '@mui/material';
import { colors, fontSizes, iconStyles } from '../../constants/styles';
import { LocationOn as LocationOnIcon } from '@mui/icons-material';

export interface AddressTextProps {
  postalCode: string;
  address: string;
}

/**
 * 住所表示コンポーネント
 * アイコンを左中央に配置し、上段に郵便番号、下段に住所を表示
 */
export function AddressText({ postalCode, address }: AddressTextProps) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
      <LocationOnIcon sx={{ ...iconStyles.small, color: colors.text.muted, mt: 0.25 }} />
      <Box>
        <Typography sx={{ fontSize: fontSizes.sm, color: colors.text.secondary }}>
          〒{postalCode}
        </Typography>
        <Typography sx={{ fontSize: fontSizes.sm, color: colors.text.secondary, lineHeight: 1.5 }}>
          {address}
        </Typography>
      </Box>
    </Box>
  );
}
