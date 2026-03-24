/**
 * CallLogSection - 架電記録関連のUI・ロジック
 * トークスクリプト、メモ入力・表示、回答機能を含む
 */
import { useState } from 'react';
import {
  Box,
  Typography,
  Button,
  Chip,
  TextField,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Select,
  MenuItem,
  FormControl,
} from '@mui/material';
import {
  Phone as PhoneIcon,
  Add as AddIcon,
  ExpandMore as ExpandMoreIcon,
  MenuBook as ScriptIcon,
  ArrowUpward as ArrowUpIcon,
  ArrowDownward as ArrowDownIcon,
  Sort as SortIcon,
} from '@mui/icons-material';
import {
  colors,
  fontSizes,
  borderRadius,
  sectionStyles,
  buttonStyles,
  iconStyles,
  chipStyles,
  staffSelectStyles,
} from '../../../constants/styles';
import { MEMO_TAGS, type MemoTag, type MemoTagConfig } from '../../../constants/memoTags';
import type { OrdererWorkflowState } from '../../../types';
import type { Staff } from '../../../types';
import { PersonIcon } from '../../../constants/icons';
import { MemoCard } from './MemoSection';
import {
  type CallMemo,
  STYLES,
  createId,
  formatTimestamp,
  sortMemos,
  sortByCreatedAt,
  getSortLabel,
  getNextSortType,
} from './ordererWorkflowUtils';

interface TalkScriptTemplate {
  id: string;
  label: string;
  content: string;
}

export interface CallLogSectionProps {
  workflowState: OrdererWorkflowState;
  isWorkflowLoading: boolean;
  persistWorkflowState: (updater: (prev: OrdererWorkflowState) => OrdererWorkflowState) => Promise<boolean>;
  talkScriptTemplates: TalkScriptTemplate[];
  staff: Staff[];
  findById: (id: string) => Staff | undefined;
  scriptAssignees: Record<string, string>;
  onScriptAssigneeChange: (scriptId: string, staffId: string) => void;
}

export function CallLogSection({
  workflowState,
  isWorkflowLoading,
  persistWorkflowState,
  talkScriptTemplates,
  staff,
  findById,
  scriptAssignees,
  onScriptAssigneeChange,
}: CallLogSectionProps) {
  const [sortType, setSortType] = useState<'newest' | 'oldest' | 'category'>('newest');
  const [showMemoInput, setShowMemoInput] = useState(false);
  const [newMemo, setNewMemo] = useState('');
  const [newMemoTag, setNewMemoTag] = useState<MemoTag>('memo');
  const [editingMemoId, setEditingMemoId] = useState<string | null>(null);
  const [editMemoText, setEditMemoText] = useState('');
  const [answerTargetId, setAnswerTargetId] = useState<string | null>(null);
  const [answerText, setAnswerText] = useState('');

  const [scriptOpen, setScriptOpen] = useState(true);
  const [selectedScriptId, setSelectedScriptId] = useState<string>('intro');
  const [editedScriptContent, setEditedScriptContent] = useState<string | null>(null);

  const selectedScript = talkScriptTemplates.find((template) => template.id === selectedScriptId) || talkScriptTemplates[0];
  const displayScriptContent = editedScriptContent ?? selectedScript.content;

  const startEditingMemo = (memo: CallMemo) => {
    setEditingMemoId(memo.id);
    setEditMemoText(memo.content);
  };

  const cancelEditingMemo = () => {
    setEditingMemoId(null);
    setEditMemoText('');
  };

  const addMemo = async () => {
    const content = newMemo.trim();
    if (!content) {
      return;
    }

    const createdAt = formatTimestamp();
    const success = await persistWorkflowState((prev) => ({
      ...prev,
      callMemos: [
        {
          id: createId('memo'),
          createdAt,
          content,
          tag: newMemoTag,
        },
        ...prev.callMemos,
      ],
    }));

    if (success) {
      setNewMemo('');
      setNewMemoTag('memo');
      setShowMemoInput(false);
    }
  };

  const addAnswer = async (parentId: string) => {
    const content = answerText.trim();
    if (!content) {
      return;
    }

    const createdAt = formatTimestamp();
    const success = await persistWorkflowState((prev) => ({
      ...prev,
      callMemos: [
        {
          id: createId('answer'),
          createdAt,
          content,
          tag: 'answer',
          parentId,
        },
        ...prev.callMemos,
      ],
    }));

    if (success) {
      setAnswerText('');
      setAnswerTargetId(null);
    }
  };

  const saveMemo = async (id: string) => {
    const content = editMemoText.trim();
    if (!content) {
      return;
    }

    const success = await persistWorkflowState((prev) => ({
      ...prev,
      callMemos: prev.callMemos.map((memo) =>
        memo.id === id
          ? { ...memo, content, updatedAt: formatTimestamp() }
          : memo
      ),
    }));

    if (success) {
      cancelEditingMemo();
    }
  };

  const deleteMemo = async (id: string) => {
    await persistWorkflowState((prev) => ({
      ...prev,
      callMemos: prev.callMemos.filter((memo) => memo.id !== id && memo.parentId !== id),
    }));

    if (editingMemoId === id) {
      cancelEditingMemo();
    }
    if (answerTargetId === id) {
      setAnswerTargetId(null);
      setAnswerText('');
    }
  };

  const selectScriptTemplate = (scriptId: string) => {
    setSelectedScriptId(scriptId);
    setEditedScriptContent(null);
  };

  const resetScript = () => {
    setEditedScriptContent(null);
  };

  const primaryMemos = sortMemos(
    workflowState.callMemos.filter((memo) => !memo.parentId),
    sortType
  );

  return (
    <Box>
      <Box sx={{ mb: 1.5 }}>
        <Button
          variant="contained"
          fullWidth
          startIcon={<PhoneIcon />}
          sx={{
            py: 1.5,
            backgroundColor: colors.accent.greenDark,
            fontWeight: 600,
            fontSize: fontSizes.sm,
            '&:hover': { backgroundColor: colors.accent.greenHover },
          }}
        >
          電話をかける
        </Button>
      </Box>

      <Accordion
        expanded={scriptOpen}
        onChange={() => setScriptOpen(!scriptOpen)}
        elevation={0}
        sx={{
          mb: 1.5,
          border: `1px solid ${colors.border.main}`,
          borderRadius: `${borderRadius.xs} !important`,
          '&:before': { display: 'none' },
          '&.Mui-expanded': { margin: 0, mb: 1.5 },
        }}
      >
        <AccordionSummary
          expandIcon={<ExpandMoreIcon />}
          sx={{
            minHeight: 44,
            '&.Mui-expanded': { minHeight: 44 },
            '& .MuiAccordionSummary-content': { margin: '8px 0' },
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <ScriptIcon sx={{ ...iconStyles.medium, color: colors.accent.greenDark }} />
            <Typography sx={{ fontSize: fontSizes.sm, fontWeight: 600, color: colors.text.secondary }}>
              トークスクリプト
            </Typography>
          </Box>
        </AccordionSummary>
        <AccordionDetails sx={{ pt: 0, pb: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
            <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
              {talkScriptTemplates.map((template) => {
                const isSelected = selectedScriptId === template.id;
                return (
                  <Chip
                    key={template.id}
                    label={template.label}
                    size="small"
                    icon={<PhoneIcon sx={iconStyles.small} />}
                    onClick={() => selectScriptTemplate(template.id)}
                    sx={{
                      ...chipStyles.medium,
                      fontWeight: isSelected ? 600 : 400,
                      backgroundColor: isSelected ? 'rgba(5, 150, 105, 0.1)' : 'transparent',
                      color: isSelected ? colors.accent.greenDark : colors.text.muted,
                      border: `1px solid ${isSelected ? colors.accent.greenDark : colors.border.main}`,
                      cursor: 'pointer',
                      '& .MuiChip-icon': {
                        color: isSelected ? colors.accent.greenDark : colors.text.muted,
                      },
                    }}
                  />
                );
              })}
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <PersonIcon sx={{ ...iconStyles.small, color: colors.accent.blue }} />
              <FormControl size="small">
                <Select
                  value={scriptAssignees[selectedScriptId] || ''}
                  onChange={(event) => onScriptAssigneeChange(selectedScriptId, event.target.value)}
                  displayEmpty
                  sx={staffSelectStyles}
                  renderValue={(value) => {
                    if (!value) {
                      return <span style={{ color: colors.text.light, fontSize: fontSizes.xs }}>未割当</span>;
                    }
                    const staffMember = findById(value);
                    return <span style={{ fontSize: fontSizes.xs }}>{staffMember?.name || '未割当'}</span>;
                  }}
                >
                  <MenuItem value="">
                    <em style={{ color: colors.text.light, fontSize: fontSizes.xs }}>未割当</em>
                  </MenuItem>
                  {staff.map((member) => (
                    <MenuItem key={member.id} value={member.id} sx={{ fontSize: fontSizes.xs }}>
                      {member.name}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Box>
          </Box>

          <TextField
            value={displayScriptContent}
            onChange={(event) => setEditedScriptContent(event.target.value)}
            fullWidth
            multiline
            minRows={10}
            sx={{ ...sectionStyles.textField, mb: 1.5 }}
          />

          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            <Button size="small" onClick={resetScript} disabled={editedScriptContent === null}>
              テンプレートに戻す
            </Button>
            <Button
              size="small"
              variant="outlined"
              onClick={() => navigator.clipboard.writeText(displayScriptContent)}
            >
              コピー
            </Button>
          </Box>
        </AccordionDetails>
      </Accordion>

      {!showMemoInput && (
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
          <Button
            size="small"
            startIcon={sortType === 'category' ? <SortIcon /> : sortType === 'newest' ? <ArrowDownIcon /> : <ArrowUpIcon />}
            onClick={() => setSortType(getNextSortType(sortType))}
            sx={{ ...buttonStyles.small, color: colors.text.muted }}
          >
            {getSortLabel(sortType)}
          </Button>
          <Button
            size="small"
            startIcon={<AddIcon />}
            onClick={() => setShowMemoInput(true)}
            sx={{ ...buttonStyles.small, color: colors.accent.blue }}
          >
            追加
          </Button>
        </Box>
      )}

      {showMemoInput && (
        <Box sx={{ mb: 2 }}>
          <Box sx={{ display: 'flex', gap: 0.5, mb: 1, flexWrap: 'wrap' }}>
            {(Object.entries(MEMO_TAGS) as [MemoTag, MemoTagConfig][])
              .filter(([key]) => key !== 'answer' && key !== 'evaluation')
              .map(([key, config]) => {
                const isSelected = newMemoTag === key;
                const IconComponent = config.icon;
                return (
                  <Button
                    key={key}
                    size="small"
                    startIcon={<IconComponent sx={iconStyles.small} />}
                    onClick={() => setNewMemoTag(key)}
                    sx={{
                      ...STYLES.tagButton,
                      backgroundColor: isSelected ? config.bgColor : 'transparent',
                      color: isSelected ? config.color : colors.text.muted,
                      border: `1px solid ${isSelected ? config.color : colors.border.main}`,
                      '&:hover': { backgroundColor: config.bgColor, color: config.color },
                    }}
                  >
                    {config.label}
                  </Button>
                );
              })}
          </Box>
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
            <TextField
              value={newMemo}
              onChange={(event) => setNewMemo(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && event.ctrlKey && newMemo.trim()) {
                  event.preventDefault();
                  void addMemo();
                }
              }}
              placeholder="コメント / 確認事項 / 気づきを入力..."
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
                onClick={() => void addMemo()}
                disabled={!newMemo.trim() || isWorkflowLoading}
                sx={{ minWidth: 80, backgroundColor: colors.accent.blue, ...buttonStyles.small, '&:hover': { backgroundColor: colors.accent.blueHover } }}
              >
                記録
              </Button>
              <Button
                size="small"
                onClick={() => {
                  setShowMemoInput(false);
                  setNewMemo('');
                  setNewMemoTag('memo');
                }}
                sx={{ ...buttonStyles.small, color: colors.text.muted }}
              >
                キャンセル
              </Button>
            </Box>
          </Box>
        </Box>
      )}

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        {primaryMemos.length === 0 && !showMemoInput ? (
          <Typography sx={{ fontSize: fontSizes.sm, color: colors.text.muted, textAlign: 'center', py: 4 }}>
            記録はまだありません
          </Typography>
        ) : (
          primaryMemos.map((memo) => {
            const answers = workflowState.callMemos.filter((item) => item.parentId === memo.id);
            const isQuestion = memo.tag === 'question';

            return (
              <Box key={memo.id}>
                <MemoCard
                  memo={memo}
                  isEditing={editingMemoId === memo.id}
                  editText={editMemoText}
                  onEditTextChange={setEditMemoText}
                  onStartEdit={() => startEditingMemo(memo)}
                  onSaveEdit={() => void saveMemo(memo.id)}
                  onCancelEdit={cancelEditingMemo}
                  onDelete={() => void deleteMemo(memo.id)}
                >
                  {isQuestion && !answerTargetId && editingMemoId !== memo.id && (
                    <Button
                      variant="contained"
                      size="small"
                      onClick={() => setAnswerTargetId(memo.id)}
                      sx={{ mt: 1.5, py: 0.75, px: 2, backgroundColor: MEMO_TAGS.answer.color, color: colors.text.white, fontWeight: 600, fontSize: fontSizes.sm, borderRadius: borderRadius.xs, '&:hover': { backgroundColor: colors.accent.greenDark } }}
                    >
                      回答を追加
                    </Button>
                  )}
                  {answerTargetId === memo.id && (
                    <Box sx={{ mt: 1.5, display: 'flex', gap: 1, alignItems: 'flex-start' }}>
                      <TextField
                        value={answerText}
                        onChange={(event) => setAnswerText(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' && event.ctrlKey && answerText.trim()) {
                            event.preventDefault();
                            void addAnswer(memo.id);
                          }
                        }}
                        placeholder="回答を入力..."
                        size="small"
                        fullWidth
                        multiline
                        minRows={2}
                        autoFocus
                        sx={sectionStyles.textField}
                      />
                      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                        <Button
                          variant="contained"
                          onClick={() => void addAnswer(memo.id)}
                          disabled={!answerText.trim()}
                          sx={{ minWidth: 60, backgroundColor: MEMO_TAGS.answer.color, ...buttonStyles.small, '&:hover': { backgroundColor: colors.accent.greenDark } }}
                        >
                          記録
                        </Button>
                        <Button
                          size="small"
                          onClick={() => {
                            setAnswerTargetId(null);
                            setAnswerText('');
                          }}
                          sx={{ ...buttonStyles.small, color: colors.text.muted, minWidth: 60 }}
                        >
                          取消
                        </Button>
                      </Box>
                    </Box>
                  )}
                </MemoCard>

                {answers.length > 0 && (
                  <Box sx={{ ml: 3, mt: 0.5, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                    {sortByCreatedAt(answers, true).map((answer) => (
                      <MemoCard
                        key={answer.id}
                        memo={answer}
                        isEditing={editingMemoId === answer.id}
                        editText={editMemoText}
                        onEditTextChange={setEditMemoText}
                        onStartEdit={() => startEditingMemo(answer)}
                        onSaveEdit={() => void saveMemo(answer.id)}
                        onCancelEdit={cancelEditingMemo}
                        onDelete={() => void deleteMemo(answer.id)}
                        variant="answer"
                      />
                    ))}
                  </Box>
                )}
              </Box>
            );
          })
        )}
      </Box>
    </Box>
  );
}
