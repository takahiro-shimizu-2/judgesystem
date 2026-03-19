/**
 * 担当者選択パネル
 * 現在のタブの担当者を表示・選択
 */
import { Box, Typography, Select, MenuItem, FormControl } from '@mui/material';
import { PersonIcon } from '../../../constants/icons';
import { colors, fontSizes, borderRadius, iconStyles } from '../../../constants/styles';
import { mockStaff, findStaffById } from '../../../data';
import type { StepAssignee } from '../../../types';

// ============================================================================
// 型定義
// ============================================================================

export interface StaffAssignmentPanelProps {
  stepAssignees: StepAssignee[];
  currentStep: string;
  onAssigneeChange: (stepId: string, staffId: string) => void;
}

// ============================================================================
// スタイル定数
// ============================================================================

const STYLES = {
  container: {
    display: 'flex',
    alignItems: 'center',
    gap: 1.5,
    p: 1.5,
    backgroundColor: colors.accent.blueBg,
    borderRadius: borderRadius.xs,
    border: 'none',
  },
  label: {
    display: 'flex',
    alignItems: 'center',
    gap: 0.5,
    fontSize: fontSizes.sm,
    color: colors.accent.blue,
    fontWeight: 600,
    whiteSpace: 'nowrap',
  },
  select: {
    fontSize: fontSizes.sm,
    flex: 1,
    '& .MuiSelect-select': {
      py: 0.75,
      px: 1.5,
    },
    '& .MuiOutlinedInput-notchedOutline': {
      borderColor: colors.border.main,
      borderRadius: borderRadius.xs,
    },
    '&:hover .MuiOutlinedInput-notchedOutline': {
      borderColor: colors.accent.blue,
    },
    '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
      borderColor: colors.accent.blue,
      borderWidth: 1,
    },
  },
  unassigned: {
    color: colors.text.light,
    fontStyle: 'italic' as const,
  },
} as const;

// ============================================================================
// コンポーネント
// ============================================================================

export function StaffAssignmentPanel({
  stepAssignees,
  currentStep,
  onAssigneeChange,
}: StaffAssignmentPanelProps) {
  // 現在のステップの担当者IDを取得
  const assignee = stepAssignees.find((a) => a.stepId === currentStep);
  const assignedStaffId = assignee?.staffId || '';

  return (
    <Box sx={STYLES.container}>
      <Typography sx={STYLES.label}>
        <PersonIcon sx={{ ...iconStyles.small, color: colors.accent.blue }} />
        担当者
      </Typography>
      <FormControl size="small" sx={{ flex: 1 }}>
        <Select
          value={assignedStaffId}
          onChange={(e) => onAssigneeChange(currentStep, e.target.value)}
          displayEmpty
          sx={STYLES.select}
          renderValue={(value) => {
            if (!value) {
              return <span style={STYLES.unassigned}>未割当</span>;
            }
            const staff = findStaffById(value);
            return staff?.name || '未割当';
          }}
        >
          <MenuItem value="">
            <em style={{ color: colors.text.light }}>未割当</em>
          </MenuItem>
          {mockStaff.map((staff) => (
            <MenuItem key={staff.id} value={staff.id}>
              <Box>
                <Typography sx={{ fontSize: fontSizes.sm }}>
                  {staff.name}
                </Typography>
                <Typography sx={{ fontSize: fontSizes.xs, color: colors.text.muted }}>
                  {staff.department}
                </Typography>
              </Box>
            </MenuItem>
          ))}
        </Select>
      </FormControl>
    </Box>
  );
}
