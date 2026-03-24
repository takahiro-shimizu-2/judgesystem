/**
 * EvaluationScoreSection - 評価スコア関連のUI・ロジック
 * 評価の追加・編集・削除・ソートを含む
 */
import { useState } from 'react';
import {
  Box,
  Typography,
  Button,
  TextField,
} from '@mui/material';
import {
  Add as AddIcon,
  ArrowUpward as ArrowUpIcon,
  ArrowDownward as ArrowDownIcon,
} from '@mui/icons-material';
import {
  colors,
  fontSizes,
  sectionStyles,
  buttonStyles,
} from '../../../constants/styles';
import type { OrdererWorkflowState } from '../../../types';
import { MemoCard } from './MemoSection';
import {
  type EvaluationMemo,
  createId,
  formatTimestamp,
  sortByCreatedAt,
} from './ordererWorkflowUtils';

export interface EvaluationScoreSectionProps {
  workflowState: OrdererWorkflowState;
  persistWorkflowState: (updater: (prev: OrdererWorkflowState) => OrdererWorkflowState) => Promise<boolean>;
}

export function EvaluationScoreSection({
  workflowState,
  persistWorkflowState,
}: EvaluationScoreSectionProps) {
  const [evalSortNewest, setEvalSortNewest] = useState(true);
  const [showEvaluationInput, setShowEvaluationInput] = useState(false);
  const [newEvaluationText, setNewEvaluationText] = useState('');
  const [editingEvaluationId, setEditingEvaluationId] = useState<string | null>(null);
  const [editEvaluationText, setEditEvaluationText] = useState('');

  const sortedEvaluations = sortByCreatedAt(workflowState.evaluations, evalSortNewest);

  const addEvaluation = async () => {
    const content = newEvaluationText.trim();
    if (!content) {
      return;
    }

    const success = await persistWorkflowState((prev) => ({
      ...prev,
      evaluations: [
        {
          id: createId('evaluation'),
          createdAt: formatTimestamp(),
          content,
          tag: 'evaluation' as const,
        },
        ...prev.evaluations,
      ],
    }));

    if (success) {
      setNewEvaluationText('');
      setShowEvaluationInput(false);
    }
  };

  const startEditingEvaluation = (memo: EvaluationMemo) => {
    setEditingEvaluationId(memo.id);
    setEditEvaluationText(memo.content);
  };

  const cancelEditingEvaluation = () => {
    setEditingEvaluationId(null);
    setEditEvaluationText('');
  };

  const saveEvaluation = async (id: string) => {
    const content = editEvaluationText.trim();
    if (!content) {
      return;
    }

    const success = await persistWorkflowState((prev) => ({
      ...prev,
      evaluations: prev.evaluations.map((memo) =>
        memo.id === id
          ? { ...memo, content, updatedAt: formatTimestamp() }
          : memo
      ),
    }));

    if (success) {
      cancelEditingEvaluation();
    }
  };

  const deleteEvaluation = async (id: string) => {
    await persistWorkflowState((prev) => ({
      ...prev,
      evaluations: prev.evaluations.filter((memo) => memo.id !== id),
    }));

    if (editingEvaluationId === id) {
      cancelEditingEvaluation();
    }
  };

  return (
    <Box>
      {!showEvaluationInput && (
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
          <Button
            size="small"
            startIcon={evalSortNewest ? <ArrowDownIcon /> : <ArrowUpIcon />}
            onClick={() => setEvalSortNewest(!evalSortNewest)}
            sx={{ ...buttonStyles.small, color: colors.text.muted }}
          >
            {evalSortNewest ? '新しい順' : '古い順'}
          </Button>
          <Button
            size="small"
            startIcon={<AddIcon />}
            onClick={() => setShowEvaluationInput(true)}
            sx={{ ...buttonStyles.small, color: colors.accent.blue }}
          >
            追加
          </Button>
        </Box>
      )}

      {showEvaluationInput && (
        <Box sx={{ display: 'flex', gap: 1, mb: 2, alignItems: 'flex-start' }}>
          <TextField
            value={newEvaluationText}
            onChange={(event) => setNewEvaluationText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && event.ctrlKey && newEvaluationText.trim()) {
                event.preventDefault();
                void addEvaluation();
              }
            }}
            placeholder="評価内容を入力..."
            size="small"
            fullWidth
            multiline
            minRows={3}
            autoFocus
            sx={sectionStyles.textField}
          />
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
            <Button
              variant="contained"
              onClick={() => void addEvaluation()}
              disabled={!newEvaluationText.trim()}
              sx={{ minWidth: 80, backgroundColor: colors.accent.blue, ...buttonStyles.small, '&:hover': { backgroundColor: colors.accent.blueHover } }}
            >
              記録
            </Button>
            <Button
              size="small"
              onClick={() => {
                setShowEvaluationInput(false);
                setNewEvaluationText('');
              }}
              sx={{ ...buttonStyles.small, color: colors.text.muted }}
            >
              キャンセル
            </Button>
          </Box>
        </Box>
      )}

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        {sortedEvaluations.length === 0 && !showEvaluationInput ? (
          <Typography sx={{ fontSize: fontSizes.sm, color: colors.text.muted, textAlign: 'center', py: 4 }}>
            評価はまだありません
          </Typography>
        ) : (
          sortedEvaluations.map((memo) => (
            <MemoCard
              key={memo.id}
              memo={memo}
              isEditing={editingEvaluationId === memo.id}
              editText={editEvaluationText}
              onEditTextChange={setEditEvaluationText}
              onStartEdit={() => startEditingEvaluation(memo)}
              onSaveEdit={() => void saveEvaluation(memo.id)}
              onCancelEdit={cancelEditingEvaluation}
              onDelete={() => void deleteEvaluation(memo.id)}
            />
          ))
        )}
      </Box>
    </Box>
  );
}
