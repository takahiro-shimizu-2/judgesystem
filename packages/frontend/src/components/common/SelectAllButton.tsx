import { colors, fontSizes, borderRadius } from '../../constants/styles';

interface SelectAllButtonProps {
  state: 'all' | 'partial' | 'none';
  count: number;
  total: number;
  onClick: () => void;
}

export function SelectAllButton({
  state,
  count,
  total,
  onClick,
}: SelectAllButtonProps) {
  const getBackground = () => {
    if (state === 'all') return colors.primary.gradient;
    if (state === 'partial') return colors.accent.blue;
    return colors.background.hover;
  };

  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '4px',
        padding: '4px 10px',
        borderRadius: borderRadius.xs,
        fontSize: fontSizes.xs,
        fontWeight: 600,
        cursor: 'pointer',
        border: state === 'none' ? `1px solid ${colors.border.main}` : 'none',
        background: getBackground(),
        color: state === 'none' ? colors.text.muted : colors.text.white,
        transition: 'all 0.2s ease',
      }}
    >
      {state === 'none' ? 'すべて選択' : state === 'all' ? 'すべて解除' : `${count}/${total}`}
    </button>
  );
}
