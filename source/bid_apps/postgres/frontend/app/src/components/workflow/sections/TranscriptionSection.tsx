/**
 * TranscriptionSection - 文字起こし関連のUI・ロジック
 * 文字起こしの追加・編集・削除を含む
 */
import { useState } from 'react';
import {
  Box,
  Typography,
  Button,
  TextField,
  Paper,
  IconButton,
} from '@mui/material';
import {
  Add as AddIcon,
  Mic as MicIcon,
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
  buttonStyles,
  iconStyles,
} from '../../../constants/styles';
import type { OrdererWorkflowState, WorkflowTranscription } from '../../../types';
import {
  createId,
  formatTimestamp,
  sortByCreatedAt,
} from './ordererWorkflowUtils';

export interface TranscriptionSectionProps {
  workflowState: OrdererWorkflowState;
  persistWorkflowState: (updater: (prev: OrdererWorkflowState) => OrdererWorkflowState) => Promise<boolean>;
}

export function TranscriptionSection({
  workflowState,
  persistWorkflowState,
}: TranscriptionSectionProps) {
  const [showTranscriptionInput, setShowTranscriptionInput] = useState(false);
  const [newTranscription, setNewTranscription] = useState('');
  const [editingTranscriptionId, setEditingTranscriptionId] = useState<string | null>(null);
  const [editTranscriptionText, setEditTranscriptionText] = useState('');

  const sortedTranscriptions = sortByCreatedAt(workflowState.transcriptions, true);

  const addTranscription = async () => {
    const content = newTranscription.trim();
    if (!content) {
      return;
    }

    const success = await persistWorkflowState((prev) => ({
      ...prev,
      transcriptions: [
        {
          id: createId('transcription'),
          createdAt: formatTimestamp(),
          content,
        },
        ...prev.transcriptions,
      ],
    }));

    if (success) {
      setNewTranscription('');
      setShowTranscriptionInput(false);
    }
  };

  const startEditingTranscription = (transcription: WorkflowTranscription) => {
    setEditingTranscriptionId(transcription.id);
    setEditTranscriptionText(transcription.content);
  };

  const cancelEditingTranscription = () => {
    setEditingTranscriptionId(null);
    setEditTranscriptionText('');
  };

  const saveTranscription = async (id: string) => {
    const content = editTranscriptionText.trim();
    if (!content) {
      return;
    }

    const success = await persistWorkflowState((prev) => ({
      ...prev,
      transcriptions: prev.transcriptions.map((transcription) =>
        transcription.id === id
          ? { ...transcription, content, updatedAt: formatTimestamp() }
          : transcription
      ),
    }));

    if (success) {
      cancelEditingTranscription();
    }
  };

  const deleteTranscription = async (id: string) => {
    await persistWorkflowState((prev) => ({
      ...prev,
      transcriptions: prev.transcriptions.filter((transcription) => transcription.id !== id),
    }));

    if (editingTranscriptionId === id) {
      cancelEditingTranscription();
    }
  };

  return (
    <Box>
      {!showTranscriptionInput && (
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 1 }}>
          <Button
            size="small"
            startIcon={<AddIcon />}
            onClick={() => setShowTranscriptionInput(true)}
            sx={{ ...buttonStyles.small, color: colors.accent.blue }}
          >
            追加
          </Button>
        </Box>
      )}

      {showTranscriptionInput && (
        <Box sx={{ display: 'flex', gap: 1, mb: 2, alignItems: 'flex-start' }}>
          <TextField
            value={newTranscription}
            onChange={(event) => setNewTranscription(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && event.ctrlKey && newTranscription.trim()) {
                event.preventDefault();
                void addTranscription();
              }
            }}
            placeholder="文字起こしを入力..."
            size="small"
            fullWidth
            multiline
            minRows={4}
            autoFocus
            sx={sectionStyles.textField}
          />
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
            <Button
              variant="contained"
              onClick={() => void addTranscription()}
              disabled={!newTranscription.trim()}
              sx={{ minWidth: 80, backgroundColor: colors.accent.blue, ...buttonStyles.small, '&:hover': { backgroundColor: colors.accent.blueHover } }}
            >
              保存
            </Button>
            <Button
              size="small"
              onClick={() => {
                setShowTranscriptionInput(false);
                setNewTranscription('');
              }}
              sx={{ ...buttonStyles.small, color: colors.text.muted }}
            >
              キャンセル
            </Button>
          </Box>
        </Box>
      )}

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        {sortedTranscriptions.length === 0 && !showTranscriptionInput ? (
          <Typography sx={{ fontSize: fontSizes.sm, color: colors.text.muted, textAlign: 'center', py: 4 }}>
            文字起こしはまだありません
          </Typography>
        ) : (
          sortedTranscriptions.map((transcription) => {
            const isEditing = editingTranscriptionId === transcription.id;

            return (
              <Paper
                key={transcription.id}
                elevation={0}
                sx={{
                  p: 2,
                  backgroundColor: 'rgba(37, 99, 235, 0.05)',
                  border: '1px solid rgba(37, 99, 235, 0.15)',
                  borderRadius: borderRadius.xs,
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <MicIcon sx={{ ...iconStyles.small, color: colors.accent.blue }} />
                    <Typography sx={{ fontSize: fontSizes.xs, color: colors.text.muted }}>
                      {transcription.createdAt}
                    </Typography>
                    {transcription.updatedAt && transcription.updatedAt !== transcription.createdAt && (
                      <Typography sx={{ fontSize: fontSizes.xs, color: colors.text.light }}>
                        更新: {transcription.updatedAt}
                      </Typography>
                    )}
                  </Box>
                  {!isEditing && (
                    <Box sx={{ display: 'flex', gap: 0.5 }}>
                      <IconButton size="small" onClick={() => startEditingTranscription(transcription)}>
                        <EditIcon sx={{ ...iconStyles.small, color: colors.text.muted }} />
                      </IconButton>
                      <IconButton size="small" onClick={() => void deleteTranscription(transcription.id)}>
                        <DeleteIcon sx={{ ...iconStyles.small, color: colors.status.error.main }} />
                      </IconButton>
                    </Box>
                  )}
                </Box>

                {isEditing ? (
                  <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
                    <TextField
                      value={editTranscriptionText}
                      onChange={(event) => setEditTranscriptionText(event.target.value)}
                      size="small"
                      fullWidth
                      multiline
                      minRows={4}
                      autoFocus
                      sx={sectionStyles.textField}
                    />
                    <IconButton size="small" onClick={() => void saveTranscription(transcription.id)} color="primary">
                      <CheckIcon sx={iconStyles.medium} />
                    </IconButton>
                    <IconButton size="small" onClick={cancelEditingTranscription}>
                      <CloseIcon sx={{ ...iconStyles.medium, color: colors.text.muted }} />
                    </IconButton>
                  </Box>
                ) : (
                  <Typography sx={{ fontSize: fontSizes.sm, color: colors.text.secondary, whiteSpace: 'pre-wrap' }}>
                    {transcription.content}
                  </Typography>
                )}
              </Paper>
            );
          })
        )}
      </Box>
    </Box>
  );
}
