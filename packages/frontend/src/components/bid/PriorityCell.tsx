import { Box } from '@mui/material';
import { Star, StarHalf } from '@mui/icons-material';
import { priorityColors } from '../../constants/priority';
import { iconStyles } from '../../constants/styles';
import type { CompanyPriority } from '../../types';

interface PriorityCellProps {
  priority: CompanyPriority;
}

/** 優先度ごとの星表示設定 (full: 塗りつぶし, half: 半分) */
const priorityStars: Record<CompanyPriority, { full: number; half: boolean }> = {
  1: { full: 3, half: false },  // ★★★
  2: { full: 2, half: true },   // ★★½
  3: { full: 2, half: false },  // ★★
  4: { full: 1, half: true },   // ★½
  5: { full: 1, half: false },  // ★
};

function StarRating({ full, half, color }: { full: number; half: boolean; color: string }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
      {[...Array(full)].map((_, i) => (
        <Star key={i} sx={{ ...iconStyles.medium, color, ml: i > 0 ? '-4px' : 0 }} />
      ))}
      {half && <StarHalf sx={{ ...iconStyles.medium, color, ml: '-4px' }} />}
    </Box>
  );
}

export function PriorityCell({ priority }: PriorityCellProps) {
  const config = priorityColors[priority];
  const stars = priorityStars[priority];
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', height: '100%' }}>
      <StarRating full={stars.full} half={stars.half} color={config.gradient} />
    </Box>
  );
}
