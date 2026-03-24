/**
 * MemoCard - メモ表示・編集用の共通カードコンポーネント
 * CallLogSection, EvaluationScoreSection などで共通利用
 */
import {
  Box,
  Typography,
  TextField,
  Paper,
  IconButton,
  Chip,
} from '@mui/material';
import {
  Edit as EditIcon,
  Check as CheckIcon,
  Close as CloseIcon,
  Delete as DeleteIcon,
} from '@mui/icons-material';
import {
  colors,
  fontSizes,
  borderRadius,
  sectionStyles,
  iconStyles,
  chipStyles,
} from '../../../constants/styles';
import { MEMO_TAGS } from '../../../constants/memoTags';
import type { CallMemo } from './ordererWorkflowUtils';
import { STYLES } from './ordererWorkflowUtils';

export interface MemoCardProps {
  memo: CallMemo;
  isEditing: boolean;
  editText: string;
  onEditTextChange: (text: string) => void;
  onStartEdit: () => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onDelete: () => void;
  variant?: 'default' | 'answer';
  children?: React.ReactNode;
}

export function MemoCard({
  memo,
  isEditing,
  editText,
  onEditTextChange,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  onDelete,
  variant = 'default',
  children,
}: MemoCardProps) {
  const tagConfig = MEMO_TAGS[memo.tag];
  const IconComponent = tagConfig.icon;
  const isAnswer = variant === 'answer';

  return (
    <Paper
      elevation={0}
      sx={isAnswer ? {
        p: 1.5,
        backgroundColor: tagConfig.bgColor,
        border: `1px solid ${tagConfig.color}20`,
        borderRadius: borderRadius.xs,
      } : STYLES.callLogCard}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
          <Chip
            size="small"
            icon={<IconComponent sx={iconStyles.small} />}
            label={tagConfig.label}
            sx={{
              ...chipStyles.small,
              backgroundColor: tagConfig.bgColor,
              color: tagConfig.color,
              '& .MuiChip-icon': { color: tagConfig.color },
            }}
          />
          <Typography sx={{ fontSize: fontSizes.sm, color: colors.text.muted }}>
            {memo.createdAt}
          </Typography>
          {memo.updatedAt && memo.updatedAt !== memo.createdAt && (
            <Typography sx={{ fontSize: fontSizes.sm, color: colors.text.light, fontStyle: 'italic' }}>
              更新: {memo.updatedAt}
            </Typography>
          )}
        </Box>
        {!isEditing && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <IconButton size="small" onClick={onStartEdit} sx={{ p: 0.5 }}>
              <EditIcon sx={{ ...iconStyles.medium, color: colors.text.muted }} />
            </IconButton>
            <IconButton size="small" onClick={onDelete} sx={{ p: 0.5 }}>
              <DeleteIcon sx={{ ...iconStyles.medium, color: colors.status.error.main }} />
            </IconButton>
          </Box>
        )}
      </Box>
      {isEditing ? (
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
          <TextField
            value={editText}
            onChange={(event) => onEditTextChange(event.target.value)}
            size="small"
            fullWidth
            multiline
            minRows={isAnswer ? 1 : 2}
            autoFocus
            sx={sectionStyles.textField}
          />
          <IconButton size="small" onClick={onSaveEdit} color="primary">
            <CheckIcon sx={iconStyles.medium} />
          </IconButton>
          <IconButton size="small" onClick={onCancelEdit}>
            <CloseIcon sx={{ ...iconStyles.medium, color: colors.text.muted }} />
          </IconButton>
        </Box>
      ) : (
        <Typography sx={{ fontSize: fontSizes.md, color: colors.text.secondary, whiteSpace: 'pre-wrap' }}>
          {memo.content}
        </Typography>
      )}
      {children}
    </Paper>
  );
}
