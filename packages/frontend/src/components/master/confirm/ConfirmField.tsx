import { Box, Typography, Link, Chip, Rating } from '@mui/material';
import { colors, fontSizes, chipStyles, borderRadius } from '../../../constants/styles';

interface ConfirmFieldProps {
  label: string;
  value?: string | number | null;
  type?: 'text' | 'link' | 'chips' | 'rating';
  chips?: string[];
  ratingMax?: number;
  fullWidth?: boolean;
  suffix?: string;
}

const fieldStyles = {
  container: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 0.5,
    minWidth: 0,
  },
  label: {
    fontSize: fontSizes.xs,
    color: colors.text.muted,
    fontWeight: 500,
  },
  value: {
    fontSize: fontSizes.sm,
    color: colors.text.primary,
    fontWeight: 400,
    wordBreak: 'break-word' as const,
  },
  emptyValue: {
    fontSize: fontSizes.sm,
    color: colors.text.light,
    fontStyle: 'italic' as const,
  },
  chipContainer: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: 0.75,
  },
  chip: {
    ...chipStyles.small,
    borderRadius: borderRadius.xs,
    backgroundColor: colors.status.info.bg,
    color: colors.accent.blue,
  },
} as const;

export function ConfirmField({
  label,
  value,
  type = 'text',
  chips,
  ratingMax = 3,
  fullWidth = false,
  suffix = '',
}: ConfirmFieldProps) {
  const isEmpty = value === '' || value === null || value === undefined;
  const isEmptyChips = !chips || chips.length === 0;

  const renderValue = () => {
    if (type === 'chips') {
      if (isEmptyChips) {
        return <Typography sx={fieldStyles.emptyValue}>登録なし</Typography>;
      }
      return (
        <Box sx={fieldStyles.chipContainer}>
          {chips!.map((chip, index) => (
            <Chip key={index} label={chip} size="small" sx={fieldStyles.chip} />
          ))}
        </Box>
      );
    }

    if (type === 'rating') {
      return (
        <Rating
          value={typeof value === 'number' ? value : 0}
          max={ratingMax}
          precision={0.5}
          readOnly
          size="small"
        />
      );
    }

    if (isEmpty) {
      return <Typography sx={fieldStyles.emptyValue}>-</Typography>;
    }

    if (type === 'link' && typeof value === 'string') {
      return (
        <Link
          href={value}
          target="_blank"
          rel="noopener noreferrer"
          sx={{ fontSize: fontSizes.sm, wordBreak: 'break-all' }}
        >
          {value}
        </Link>
      );
    }

    return (
      <Typography sx={fieldStyles.value}>
        {value}
        {suffix}
      </Typography>
    );
  };

  return (
    <Box sx={{ ...fieldStyles.container, ...(fullWidth && { gridColumn: '1 / -1' }) }}>
      <Typography sx={fieldStyles.label}>{label}</Typography>
      {renderValue()}
    </Box>
  );
}
