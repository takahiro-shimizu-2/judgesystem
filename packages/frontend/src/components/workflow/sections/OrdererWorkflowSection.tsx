/**
 * 発注者ワークフローセクション
 * 架電記録、提出書類、評価、文字起こしを表示
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Box,
  Typography,
  Button,
  Chip,
  TextField,
  Paper,
  IconButton,
  Tabs,
  Tab,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Select,
  MenuItem,
  FormControl,
  CircularProgress,
} from '@mui/material';
import {
  Phone as PhoneIcon,
  Add as AddIcon,
  AttachFile as AttachFileIcon,
  Upload as UploadIcon,
  Mic as MicIcon,
  Edit as EditIcon,
  Check as CheckIcon,
  Close as CloseIcon,
  Delete as DeleteIcon,
  StarOutline as EvaluationIcon,
  ArrowUpward as ArrowUpIcon,
  ArrowDownward as ArrowDownIcon,
  Sort as SortIcon,
  Email as EmailIcon,
  ExpandMore as ExpandMoreIcon,
  MenuBook as ScriptIcon,
  Download as DownloadIcon,
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
import {
  createEmptyOrdererWorkflowState,
  fetchOrdererWorkflowState,
  updateOrdererWorkflowState,
} from '../../../data/evaluations';
import type {
  PreSubmitDocument,
  BidEvaluation,
  OrdererWorkflowState,
  WorkflowRecordMemo,
  WorkflowTranscription,
} from '../../../types';
import { useStaffDirectory } from '../../../contexts/StaffContext';
import { PersonIcon } from '../../../constants/icons';

type CallMemo = WorkflowRecordMemo;
type EvaluationMemo = WorkflowRecordMemo;

interface OrdererWorkflowSectionProps {
  evaluation?: BidEvaluation;
  workflowAssigneeId?: string;
}

interface MemoCardProps {
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

const STYLES = {
  callLogCard: {
    p: 2,
    backgroundColor: colors.text.white,
    borderRadius: borderRadius.xs,
    border: `1px solid ${colors.border.main}`,
    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)',
  },
  tagButton: {
    minWidth: 'auto',
    px: 1.5,
    py: 0.5,
    fontSize: fontSizes.xs,
    borderRadius: borderRadius.xs,
    textTransform: 'none' as const,
  },
} as const;

const CATEGORY_ORDER: Record<MemoTag, number> = {
  question: 1,
  answer: 2,
  memo: 3,
  idea: 4,
  evaluation: 5,
};

const SCRIPT_TEMPLATE_IDS = ['intro', 'followup'] as const;
const EMAIL_TEMPLATE_IDS = ['1', '2', '3'] as const;

function MemoCard({
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

const createId = (prefix: string): string =>
  `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;

const formatTimestamp = (date: Date = new Date()): string =>
  `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;

const parseTimestamp = (value: string): number =>
  new Date(value.replace(/\//g, '-')).getTime();

const sortMemos = (items: CallMemo[], type: 'newest' | 'oldest' | 'category'): CallMemo[] => {
  return [...items].sort((a, b) => {
    if (type === 'category') {
      const categoryDiff = CATEGORY_ORDER[a.tag] - CATEGORY_ORDER[b.tag];
      if (categoryDiff !== 0) {
        return categoryDiff;
      }
      return parseTimestamp(b.createdAt) - parseTimestamp(a.createdAt);
    }

    const aTime = parseTimestamp(a.createdAt);
    const bTime = parseTimestamp(b.createdAt);
    return type === 'newest' ? bTime - aTime : aTime - bTime;
  });
};

const sortByCreatedAt = <T extends { createdAt: string }>(items: T[], newest: boolean): T[] =>
  [...items].sort((a, b) => {
    const aTime = parseTimestamp(a.createdAt);
    const bTime = parseTimestamp(b.createdAt);
    return newest ? bTime - aTime : aTime - bTime;
  });

const getSortLabel = (type: 'newest' | 'oldest' | 'category'): string => {
  if (type === 'oldest') {
    return '古い順';
  }
  if (type === 'category') {
    return 'カテゴリー順';
  }
  return '新しい順';
};

const getNextSortType = (current: 'newest' | 'oldest' | 'category'): 'newest' | 'oldest' | 'category' => {
  if (current === 'newest') {
    return 'oldest';
  }
  if (current === 'oldest') {
    return 'category';
  }
  return 'newest';
};

const readFileAsDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });

const triggerDownload = (doc: PreSubmitDocument) => {
  if (!doc.dataUrl) {
    return;
  }

  const link = document.createElement('a');
  link.href = doc.dataUrl;
  link.download = doc.fileName || doc.name;
  link.click();
};

export function OrdererWorkflowSection({ evaluation, workflowAssigneeId }: OrdererWorkflowSectionProps) {
  const { staff, findById } = useStaffDirectory();
  const evaluationNo = evaluation?.evaluationNo ?? '';
  const projectName = evaluation?.announcement?.title || '（案件名）';
  const ordererOrg = evaluation?.announcement?.organization || '（発注機関）';
  const ordererContact = evaluation?.announcement?.department?.contactPerson || '担当者';
  const defaultStaffMember = workflowAssigneeId ? findById(workflowAssigneeId) : undefined;
  const companyName = defaultStaffMember?.companyName || evaluation?.company?.name || '（自社名）';
  const myName = defaultStaffMember?.name || '営業担当';

  const [workflowState, setWorkflowState] = useState<OrdererWorkflowState>(createEmptyOrdererWorkflowState);
  const workflowStateRef = useRef<OrdererWorkflowState>(createEmptyOrdererWorkflowState());
  const saveRequestIdRef = useRef(0);
  const docsInputRef = useRef<HTMLInputElement>(null);

  const [isWorkflowLoading, setIsWorkflowLoading] = useState(false);
  const [isWorkflowSaving, setIsWorkflowSaving] = useState(false);
  const [workflowError, setWorkflowError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState(0);
  const [sortType, setSortType] = useState<'newest' | 'oldest' | 'category'>('newest');
  const [evalSortNewest, setEvalSortNewest] = useState(true);

  const [showMemoInput, setShowMemoInput] = useState(false);
  const [newMemo, setNewMemo] = useState('');
  const [newMemoTag, setNewMemoTag] = useState<MemoTag>('memo');
  const [editingMemoId, setEditingMemoId] = useState<string | null>(null);
  const [editMemoText, setEditMemoText] = useState('');
  const [answerTargetId, setAnswerTargetId] = useState<string | null>(null);
  const [answerText, setAnswerText] = useState('');

  const [showEvaluationInput, setShowEvaluationInput] = useState(false);
  const [newEvaluationText, setNewEvaluationText] = useState('');
  const [editingEvaluationId, setEditingEvaluationId] = useState<string | null>(null);
  const [editEvaluationText, setEditEvaluationText] = useState('');

  const [showTranscriptionInput, setShowTranscriptionInput] = useState(false);
  const [newTranscription, setNewTranscription] = useState('');
  const [editingTranscriptionId, setEditingTranscriptionId] = useState<string | null>(null);
  const [editTranscriptionText, setEditTranscriptionText] = useState('');

  const [tabAssignees, setTabAssignees] = useState<string[]>(['', '', '', '']);
  const [scriptAssignees, setScriptAssignees] = useState<Record<string, string>>({});
  const [emailAssignees, setEmailAssignees] = useState<Record<string, string>>({});
  const [docsAssignee, setDocsAssignee] = useState('');

  const [scriptOpen, setScriptOpen] = useState(true);
  const [textAccordionOpen, setTextAccordionOpen] = useState(true);
  const [docsAccordionOpen, setDocsAccordionOpen] = useState(true);

  const talkScriptTemplates = [
    {
      id: 'intro',
      label: '初回架電',
      content: `【挨拶】
お世話になっております。${companyName}の${myName}と申します。

【用件】
本日は「${projectName}」の件でご連絡しました。
入札参加を検討しており、確認させていただきたい点がございます。

【確認事項】
・現場説明会の日程
・入札参加資格
・質問書の提出期限

【クロージング】
ご確認ありがとうございます。よろしくお願いいたします。`,
    },
    {
      id: 'followup',
      label: 'フォローアップ',
      content: `【挨拶】
お世話になっております。${companyName}の${myName}です。

【用件】
先日ご相談した「${projectName}」について追加で確認のためお電話しました。

【確認事項】
・前回質問への回答状況
・追加で必要な情報

【クロージング】
お忙しいところ恐れ入りますが、よろしくお願いいたします。`,
    },
  ];
  const [selectedScriptId, setSelectedScriptId] = useState<string>('intro');
  const [editedScriptContent, setEditedScriptContent] = useState<string | null>(null);

  const selectedScript = talkScriptTemplates.find((template) => template.id === selectedScriptId) || talkScriptTemplates[0];
  const displayScriptContent = editedScriptContent ?? selectedScript.content;

  const emailTemplates = [
    {
      id: '1',
      label: '資料請求',
      subject: `【資料請求】${projectName}に関する資料のご送付のお願い`,
      body: `${ordererOrg}
${ordererContact}様

お世話になっております。
${companyName}の${myName}でございます。

「${projectName}」について入札参加を検討しております。
関連資料のご送付をお願いできますと幸いです。

よろしくお願いいたします。`,
    },
    {
      id: '2',
      label: '質問送付',
      subject: `【質問】${projectName}について`,
      body: `${ordererOrg}
${ordererContact}様

お世話になっております。
${companyName}の${myName}でございます。

「${projectName}」について確認事項がございます。

1.

ご回答いただけますと幸いです。`,
    },
    {
      id: '3',
      label: '書類提出',
      subject: `【書類提出】${projectName}`,
      body: `${ordererOrg}
${ordererContact}様

お世話になっております。
${companyName}の${myName}でございます。

「${projectName}」の提出書類をお送りいたします。
ご査収のほどよろしくお願いいたします。`,
    },
  ];
  const [selectedTemplate, setSelectedTemplate] = useState<string>('1');
  const [editSubject, setEditSubject] = useState(emailTemplates[0]?.subject || '');
  const [editBody, setEditBody] = useState(emailTemplates[0]?.body || '');

  useEffect(() => {
    workflowStateRef.current = workflowState;
  }, [workflowState]);

  useEffect(() => {
    let isCancelled = false;

    const loadWorkflow = async () => {
      if (!evaluationNo) {
        const emptyState = createEmptyOrdererWorkflowState();
        workflowStateRef.current = emptyState;
        setWorkflowState(emptyState);
        setIsWorkflowLoading(false);
        return;
      }

      setIsWorkflowLoading(true);
      setWorkflowError(null);

      const state = await fetchOrdererWorkflowState(evaluationNo);
      if (!isCancelled) {
        workflowStateRef.current = state;
        setWorkflowState(state);
        setIsWorkflowLoading(false);
      }
    };

    loadWorkflow();

    return () => {
      isCancelled = true;
    };
  }, [evaluationNo]);

  useEffect(() => {
    if (!workflowAssigneeId) {
      return;
    }

    setTabAssignees((prev) => prev.map((value) => (value === '' ? workflowAssigneeId : value)));

    setScriptAssignees((prev) => {
      const next = { ...prev };
      SCRIPT_TEMPLATE_IDS.forEach((templateId) => {
        if (!next[templateId]) {
          next[templateId] = workflowAssigneeId;
        }
      });
      return next;
    });

    setEmailAssignees((prev) => {
      const next = { ...prev };
      EMAIL_TEMPLATE_IDS.forEach((templateId) => {
        if (!next[templateId]) {
          next[templateId] = workflowAssigneeId;
        }
      });
      return next;
    });

    setDocsAssignee((prev) => (prev === '' ? workflowAssigneeId : prev));
  }, [workflowAssigneeId]);

  const persistWorkflowState = useCallback(async (
    updater: (prev: OrdererWorkflowState) => OrdererWorkflowState
  ): Promise<boolean> => {
    const previousState = workflowStateRef.current;
    const nextState = updater(previousState);
    workflowStateRef.current = nextState;
    setWorkflowState(nextState);
    setWorkflowError(null);

    if (!evaluationNo) {
      return true;
    }

    const requestId = ++saveRequestIdRef.current;
    setIsWorkflowSaving(true);
    const savedState = await updateOrdererWorkflowState(evaluationNo, nextState);

    if (requestId !== saveRequestIdRef.current) {
      return savedState !== null;
    }

    setIsWorkflowSaving(false);

    if (!savedState) {
      workflowStateRef.current = previousState;
      setWorkflowState(previousState);
      setWorkflowError('DB 保存に失敗しました。時間をおいて再度お試しください。');
      return false;
    }

    workflowStateRef.current = savedState;
    setWorkflowState(savedState);
    return true;
  }, [evaluationNo]);

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
          tag: 'evaluation',
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

  const handleAddDocument = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    try {
      const dataUrl = await readFileAsDataUrl(file);
      const uploadedAt = formatTimestamp();
      await persistWorkflowState((prev) => ({
        ...prev,
        preSubmitDocs: [
          {
            id: createId('document'),
            name: file.name,
            status: 'submitted',
            uploadedAt,
            fileName: file.name,
            contentType: file.type || 'application/octet-stream',
            dataUrl,
            size: file.size,
          },
          ...prev.preSubmitDocs,
        ],
      }));
    } catch (error) {
      console.error('Failed to read file:', error);
      setWorkflowError('ファイルの読み込みに失敗しました。');
    } finally {
      event.target.value = '';
    }
  };

  const deleteDocument = async (id: string) => {
    await persistWorkflowState((prev) => ({
      ...prev,
      preSubmitDocs: prev.preSubmitDocs.filter((doc) => doc.id !== id),
    }));
  };

  const handleTabAssigneeChange = (tabIndex: number, staffId: string) => {
    setTabAssignees((prev) => {
      const next = [...prev];
      next[tabIndex] = staffId;
      return next;
    });
  };

  const handleScriptAssigneeChange = (scriptId: string, staffId: string) => {
    setScriptAssignees((prev) => ({ ...prev, [scriptId]: staffId }));
  };

  const handleEmailAssigneeChange = (templateId: string, staffId: string) => {
    setEmailAssignees((prev) => ({ ...prev, [templateId]: staffId }));
  };

  const selectScriptTemplate = (scriptId: string) => {
    setSelectedScriptId(scriptId);
    setEditedScriptContent(null);
  };

  const resetScript = () => {
    setEditedScriptContent(null);
  };

  const selectEmailTemplate = (templateId: string) => {
    const template = emailTemplates.find((item) => item.id === templateId);
    setSelectedTemplate(templateId);
    setEditSubject(template?.subject || '');
    setEditBody(template?.body || '');
  };

  const primaryMemos = sortMemos(
    workflowState.callMemos.filter((memo) => !memo.parentId),
    sortType
  );
  const sortedEvaluations = sortByCreatedAt(workflowState.evaluations, evalSortNewest);
  const sortedTranscriptions = sortByCreatedAt(workflowState.transcriptions, true);

  const renderStatusLine = () => (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2, minHeight: 20 }}>
      {isWorkflowLoading && (
        <>
          <CircularProgress size={14} />
          <Typography sx={{ fontSize: fontSizes.xs, color: colors.text.muted }}>
            DB から読み込み中...
          </Typography>
        </>
      )}
      {!isWorkflowLoading && isWorkflowSaving && (
        <Typography sx={{ fontSize: fontSizes.xs, color: colors.accent.blue }}>
          保存中...
        </Typography>
      )}
      {workflowError && (
        <Typography sx={{ fontSize: fontSizes.xs, color: colors.status.error.main }}>
          {workflowError}
        </Typography>
      )}
    </Box>
  );

  const renderCallLogTab = () => (
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
                  onChange={(event) => handleScriptAssigneeChange(selectedScriptId, event.target.value)}
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

  const renderDocumentsTab = () => (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      <Button
        variant="contained"
        fullWidth
        startIcon={<EmailIcon />}
        sx={{
          py: 1.5,
          backgroundColor: colors.accent.blue,
          fontWeight: 600,
          fontSize: fontSizes.sm,
          '&:hover': { backgroundColor: colors.accent.blueHover },
        }}
      >
        メールを送信
      </Button>

      <Accordion
        expanded={textAccordionOpen}
        onChange={() => setTextAccordionOpen(!textAccordionOpen)}
        elevation={0}
        sx={{
          border: `1px solid ${colors.border.main}`,
          borderRadius: `${borderRadius.xs} !important`,
          '&:before': { display: 'none' },
          '&.Mui-expanded': { margin: 0 },
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
            <EmailIcon sx={{ ...iconStyles.medium, color: colors.accent.blue }} />
            <Typography sx={{ fontSize: fontSizes.sm, fontWeight: 600, color: colors.text.secondary }}>
              文章
            </Typography>
          </Box>
        </AccordionSummary>
        <AccordionDetails sx={{ pt: 0, pb: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
            <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
              {emailTemplates.map((template) => {
                const isSelected = selectedTemplate === template.id;
                return (
                  <Chip
                    key={template.id}
                    label={template.label}
                    size="small"
                    icon={<EmailIcon sx={iconStyles.small} />}
                    onClick={() => selectEmailTemplate(template.id)}
                    sx={{
                      ...chipStyles.medium,
                      fontWeight: isSelected ? 600 : 400,
                      backgroundColor: isSelected ? colors.accent.blueBg : 'transparent',
                      color: isSelected ? colors.accent.blue : colors.text.muted,
                      border: `1px solid ${isSelected ? colors.accent.blue : colors.border.main}`,
                      cursor: 'pointer',
                      '& .MuiChip-icon': {
                        color: isSelected ? colors.accent.blue : colors.text.muted,
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
                  value={emailAssignees[selectedTemplate] || ''}
                  onChange={(event) => handleEmailAssigneeChange(selectedTemplate, event.target.value)}
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

          <Box sx={{ mb: 2 }}>
            <Typography sx={{ fontSize: fontSizes.xs, color: colors.text.muted, mb: 0.5 }}>
              件名
            </Typography>
            <TextField
              value={editSubject}
              onChange={(event) => setEditSubject(event.target.value)}
              size="small"
              fullWidth
              sx={sectionStyles.textField}
            />
          </Box>

          <Box>
            <Typography sx={{ fontSize: fontSizes.xs, color: colors.text.muted, mb: 0.5 }}>
              本文
            </Typography>
            <TextField
              value={editBody}
              onChange={(event) => setEditBody(event.target.value)}
              size="small"
              fullWidth
              multiline
              minRows={8}
              sx={sectionStyles.textField}
            />
          </Box>
        </AccordionDetails>
      </Accordion>

      <Accordion
        expanded={docsAccordionOpen}
        onChange={() => setDocsAccordionOpen(!docsAccordionOpen)}
        elevation={0}
        sx={{
          border: `1px solid ${colors.border.main}`,
          borderRadius: `${borderRadius.xs} !important`,
          '&:before': { display: 'none' },
          '&.Mui-expanded': { margin: 0 },
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
            <AttachFileIcon sx={{ ...iconStyles.medium, color: colors.status.success.main }} />
            <Typography sx={{ fontSize: fontSizes.sm, fontWeight: 600, color: colors.text.secondary }}>
              提出書類
            </Typography>
          </Box>
        </AccordionSummary>
        <AccordionDetails sx={{ pt: 0, pb: 2 }}>
          <input
            ref={docsInputRef}
            type="file"
            style={{ display: 'none' }}
            onChange={(event) => void handleAddDocument(event)}
          />
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <PersonIcon sx={{ ...iconStyles.small, color: colors.accent.blue }} />
              <FormControl size="small">
                <Select
                  value={docsAssignee}
                  onChange={(event) => setDocsAssignee(event.target.value)}
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
            <Button
              size="small"
              startIcon={<UploadIcon sx={iconStyles.small} />}
              onClick={() => docsInputRef.current?.click()}
              sx={{ ...buttonStyles.small, color: colors.accent.blue, fontSize: fontSizes.xs }}
            >
              ファイルを追加
            </Button>
          </Box>

          {workflowState.preSubmitDocs.length === 0 ? (
            <Typography sx={{ fontSize: fontSizes.xs, color: colors.text.muted, textAlign: 'center', py: 2 }}>
              提出書類がありません
            </Typography>
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
              {workflowState.preSubmitDocs.map((doc) => (
                <Box
                  key={doc.id}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1,
                    p: 1,
                    borderRadius: borderRadius.xs,
                    backgroundColor: 'rgba(5, 150, 105, 0.05)',
                    border: '1px solid rgba(5, 150, 105, 0.2)',
                  }}
                >
                  <AttachFileIcon sx={{ ...iconStyles.medium, color: colors.status.success.main }} />
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography sx={{ fontSize: fontSizes.sm, color: colors.text.secondary }}>
                      {doc.name}
                    </Typography>
                    <Typography sx={{ fontSize: fontSizes.xs, color: colors.text.muted }}>
                      保存日時: {doc.uploadedAt || '未設定'}
                    </Typography>
                  </Box>
                  <Chip
                    size="small"
                    label="保存済"
                    sx={{ ...chipStyles.small, backgroundColor: 'rgba(5, 150, 105, 0.15)', color: colors.status.success.main }}
                  />
                  <IconButton size="small" onClick={() => triggerDownload(doc)} disabled={!doc.dataUrl}>
                    <DownloadIcon sx={{ ...iconStyles.small, color: colors.accent.blue }} />
                  </IconButton>
                  <IconButton size="small" onClick={() => void deleteDocument(doc.id)}>
                    <DeleteIcon sx={{ ...iconStyles.small, color: colors.text.light, '&:hover': { color: colors.status.error.main } }} />
                  </IconButton>
                </Box>
              ))}
            </Box>
          )}
        </AccordionDetails>
      </Accordion>
    </Box>
  );

  const renderEvaluationTab = () => (
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

  const renderTranscriptionTab = () => (
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

  return (
    <Box>
      {renderStatusLine()}

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
        <Tabs
          value={activeTab}
          onChange={(_, newValue) => setActiveTab(newValue)}
          variant="scrollable"
          scrollButtons="auto"
          sx={{
            minHeight: 32,
            flex: 1,
            '& .MuiTab-root': { fontSize: fontSizes.sm, minHeight: 32, py: 0.5, textTransform: 'none' },
            '& .MuiTabs-indicator': { backgroundColor: colors.accent.blue },
            '& .Mui-selected': { color: colors.accent.blue },
          }}
        >
          <Tab icon={<PhoneIcon sx={iconStyles.small} />} iconPosition="start" label="記録" />
          <Tab icon={<AttachFileIcon sx={iconStyles.small} />} iconPosition="start" label="提出書類" />
          <Tab icon={<EvaluationIcon sx={iconStyles.small} />} iconPosition="start" label="評価" />
          <Tab icon={<MicIcon sx={iconStyles.small} />} iconPosition="start" label="文字起こし" />
        </Tabs>
        {activeTab === 2 && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <PersonIcon sx={{ ...iconStyles.small, color: colors.accent.blue }} />
            <FormControl size="small">
              <Select
                value={tabAssignees[activeTab] || ''}
                onChange={(event) => handleTabAssigneeChange(activeTab, event.target.value)}
                displayEmpty
                sx={staffSelectStyles}
                renderValue={(value) => {
                  if (!value) {
                    return <span style={{ color: colors.text.light, fontSize: fontSizes.xs }}>担当者</span>;
                  }
                  const staffMember = findById(value);
                  return <span style={{ fontSize: fontSizes.xs }}>{staffMember?.name || '担当者'}</span>;
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
        )}
      </Box>

      <Box>
        {activeTab === 0 && renderCallLogTab()}
        {activeTab === 1 && renderDocumentsTab()}
        {activeTab === 2 && renderEvaluationTab()}
        {activeTab === 3 && renderTranscriptionTab()}
      </Box>
    </Box>
  );
}
