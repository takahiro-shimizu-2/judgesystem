import { Chip } from '@mui/material';
import { colors, fontSizes, iconStyles } from '../../constants/styles';
import type { SvgIconComponent } from '@mui/icons-material';

/**
 * チップ設定の型
 */
export interface ChipConfig {
  label: string;
  color: string;
  bgColor?: string;
  borderColor?: string;
  gradient?: string;
  icon?: SvgIconComponent;
}

/**
 * チップのバリアント
 * - filled: 塗りつぶし（gradient使用、白文字）
 * - outlined: 枠線付き（bgColor + border使用）
 */
export type ChipVariant = 'filled' | 'outlined';

interface ConfigChipProps {
  config: ChipConfig;
  variant?: ChipVariant;
  showIcon?: boolean;
}

/**
 * 設定ベースの汎用チップコンポーネント
 */
export function ConfigChip({ config, variant = 'outlined', showIcon = true }: ConfigChipProps) {
  const IconComponent = config.icon;
  const isFilled = variant === 'filled';

  const chipIcon = showIcon && IconComponent ? (
    <IconComponent
      style={{
        ...iconStyles.small,
        color: isFilled ? colors.text.white : config.color,
      }}
    />
  ) : undefined;

  return (
    <Chip
      icon={chipIcon}
      label={config.label}
      size="small"
      sx={{
        ...(isFilled
          ? {
              background: config.gradient || config.color,
              color: colors.text.white,
            }
          : {
              backgroundColor: config.bgColor || 'transparent',
              color: config.color,
              border: config.borderColor ? `1px solid ${config.borderColor}` : undefined,
            }),
        fontWeight: 600,
        fontSize: fontSizes.xs,
        '& .MuiChip-icon': { marginLeft: '8px' },
      }}
    />
  );
}
