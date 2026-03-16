import { memo } from 'react';
import type { ReactNode } from 'react';
import { colors, fontSizes, borderRadius } from '../../constants/styles';

interface FilterOptionButtonProps {
  label: string;
  selected: boolean;
  onClick: () => void;
  icon?: ReactNode;
  color?: string;
  bgColor?: string;
}

export const FilterOptionButton = memo(function FilterOptionButton({
  label,
  selected,
  onClick,
  icon,
  color,
  bgColor,
}: FilterOptionButtonProps) {
  const selectedColor = color || colors.primary.main;
  const selectedBgColor = bgColor || 'rgba(30, 58, 95, 0.08)';

  return (
    <button
      onClick={onClick}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        padding: '6px 12px',
        borderRadius: borderRadius.xs,
        fontSize: fontSizes.xs,
        fontWeight: selected ? 600 : 500,
        cursor: 'pointer',
        border: selected ? `1px solid ${selectedColor}` : `1px solid ${colors.border.main}`,
        background: selected ? selectedBgColor : colors.text.white,
        color: selected ? selectedColor : colors.text.muted,
        transition: 'all 0.2s ease',
      }}
    >
      {icon}
      {label}
    </button>
  );
});
