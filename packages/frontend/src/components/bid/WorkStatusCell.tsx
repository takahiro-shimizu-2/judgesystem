import { workStatusConfig } from '../../constants/workStatus';
import type { WorkStatus } from '../../types';
import { ConfigChip } from '../common';

interface WorkStatusCellProps {
  status: WorkStatus;
}

export function WorkStatusCell({ status }: WorkStatusCellProps) {
  const config = workStatusConfig[status];
  return (
    <ConfigChip
      config={{
        label: config.label,
        color: config.color,
        bgColor: config.bgColor,
        borderColor: config.borderColor,
        icon: config.icon,
      }}
      variant="outlined"
    />
  );
}
