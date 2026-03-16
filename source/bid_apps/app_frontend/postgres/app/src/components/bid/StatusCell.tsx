import { evaluationStatusConfig } from '../../constants/status';
import type { EvaluationStatus } from '../../types';
import { ConfigChip } from '../common';

interface StatusCellProps {
  status: EvaluationStatus;
}

export function StatusCell({ status }: StatusCellProps) {
  const config = evaluationStatusConfig[status];
  return (
    <ConfigChip
      config={{
        label: config.label,
        color: config.color,
        gradient: config.gradient,
        icon: config.icon,
      }}
      variant="filled"
    />
  );
}
