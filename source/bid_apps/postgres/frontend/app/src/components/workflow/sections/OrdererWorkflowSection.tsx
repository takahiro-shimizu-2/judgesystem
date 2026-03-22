/**
 * 発注者ワークフローセクション
 * 架電記録、事前提出資料を表示
 */
import { useState, useEffect } from 'react';
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
import { MEMO_TAGS, type MemoTag, type MemoTagConfig, type RecordMemo } from '../../../constants/memoTags';
import type { PreSubmitDocument, BidEvaluation } from '../../../types';
import { useStaffDirectory } from '../../../contexts/StaffContext';
import { PersonIcon } from '../../../constants/icons';

// RecordMemoをCallMemoとして使用（後方互換性のため）
type CallMemo = RecordMemo;

// ============================================================================
// Props
// ============================================================================

interface OrdererWorkflowSectionProps {
  evaluation?: BidEvaluation;
  /** ワークフロー（発注者タブ）の担当者ID */
  workflowAssigneeId?: string;
}

// ============================================================================
// スタイル定数
// ============================================================================

const STYLES = {
  callLogCard: {
    p: 2,
    backgroundColor: colors.text.white,
    borderRadius: borderRadius.xs,
    border: `1px solid ${colors.border.main}`,
    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)',
  },
  documentCard: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    p: 1.5,
    borderRadius: borderRadius.xs,
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

// ============================================================================
// メモカードコンポーネント（共通）
// ============================================================================

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
              (更新: {memo.updatedAt})
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
            onChange={(e) => onEditTextChange(e.target.value)}
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
        <Typography sx={{ fontSize: fontSizes.md, color: colors.text.secondary }}>
          {memo.content}
        </Typography>
      )}
      {children}
    </Paper>
  );
}

// ============================================================================
// メインコンポーネント
// ============================================================================

export function OrdererWorkflowSection({ evaluation, workflowAssigneeId }: OrdererWorkflowSectionProps) {
  const { staff, findById } = useStaffDirectory();
  // 案件・発注者・自社情報
  const projectName = evaluation?.announcement?.title || '（案件名）';
  const ordererOrg = evaluation?.announcement?.organization || '（発注機関）';
  const ordererContact = evaluation?.announcement?.department?.contactPerson || '担当者';
  const companyName = evaluation?.company?.name || '（自社名）';
  // 自社担当者は仮で設定（実際はログインユーザー情報などから取得）
  const myName = '営業担当';

  // 架電記録
  const [callMemos, setCallMemos] = useState<CallMemo[]>([
    { id: '1', createdAt: '2024/01/15 09:00', content: '工期が厳しいので、協力会社の確保を優先する必要あり', tag: 'question' },
    { id: '2', createdAt: '2024/01/15 10:30', content: '担当者不在。折り返し依頼済み。', tag: 'memo' },
    { id: '3', createdAt: '2024/01/15 14:00', updatedAt: '2024/01/15 15:30', content: '3月末完成予定で変更なし。協力会社は早めに確保する。', tag: 'answer', parentId: '1' },
    { id: '4', createdAt: '2024/01/15 14:10', content: '発注者は現場説明会を重視している印象。参加必須かも。', tag: 'idea' },
    { id: '5', createdAt: '2024/01/16 09:30', content: '本案件の技術者要件について確認したい。特に監理技術者の資格要件と、現場代理人との兼任可否について。また、配置予定技術者の経験年数の算定基準（実務経験のカウント方法）も確認が必要。過去の類似案件では厳格に審査された経緯あり。', tag: 'question' },
    { id: '6', createdAt: '2024/01/16 11:00', content: '監理技術者は1級土木施工管理技士が必須。現場代理人との兼任は原則不可だが、工事規模によっては協議可能とのこと。経験年数は、資格取得後の実務経験を基本とするが、資格取得前の経験も一定条件下で算入可能。詳細は入札説明書の別紙3を参照。担当者から「過去に兼任を認めた事例もあるので、個別相談してほしい」とのコメントあり。', tag: 'answer', parentId: '5' },
    { id: '7', createdAt: '2024/01/16 14:00', content: '入札説明書を精読したところ、地元企業との JV 構成について言及あり。地元企業の定義は「本店所在地が〇〇県内にある企業」とのこと。当社は該当しないため、地元企業とのJV構成を検討する必要がある。候補企業として、A建設（過去に2回JV経験あり、関係良好）、B工業（技術力高いが過去取引なし）、C組（地元では最大手、ただし他案件でバッティングの可能性）の3社をリストアップ。来週中に各社へのアプローチ方針を決定予定。', tag: 'memo' },
  ]);

  // 録音文字起こし（自動入力想定）
  const [transcriptions] = useState<{ id: string; date: string; content: string }[]>([
    { id: '1', date: '2024/01/15 14:00', content: '「はい、工期については3月末の予定で変更ありません。現場説明会は来週の月曜日に予定しております。参加をお願いいたします。」' },
  ]);

  // トークスクリプトテンプレート
  const talkScriptTemplates = [
    {
      id: 'intro',
      label: '初回架電',
      content: `【挨拶】
お世話になっております。${companyName}の${myName}と申します。

【用件】
本日は「${projectName}」の件でご連絡させていただきました。
入札参加を検討しておりまして、いくつか確認させていただきたい点がございます。

【確認事項】
・現場説明会の日程について
・入札参加資格の確認
・質問書の提出期限について

【クロージング】
ご確認いただきありがとうございます。
また何かございましたらご連絡させていただきます。
失礼いたします。`,
    },
    {
      id: 'followup',
      label: 'フォローアップ',
      content: `【挨拶】
お世話になっております。${companyName}の${myName}です。

【用件】
先日ご質問させていただいた「${projectName}」の件で、
ご回答の状況を確認させていただきたくお電話いたしました。

【確認事項】
・質問への回答予定について
・追加で必要な情報があるか

【クロージング】
お忙しいところ恐れ入ります。
ご対応いただけますと幸いです。`,
    },
  ];

  // スクリプト関連の状態
  const [selectedScriptId, setSelectedScriptId] = useState<string>('intro');
  const [editedScriptContent, setEditedScriptContent] = useState<string | null>(null);

  // 選択中のスクリプト
  const selectedScript = talkScriptTemplates.find((t) => t.id === selectedScriptId) || talkScriptTemplates[0];
  const displayScriptContent = editedScriptContent !== null ? editedScriptContent : selectedScript.content;

  // スクリプト選択時
  const handleScriptSelect = (scriptId: string) => {
    setSelectedScriptId(scriptId);
    setEditedScriptContent(null);
  };

  // テンプレートにリセット
  const resetScript = () => {
    setEditedScriptContent(null);
  };

  // 評価記録
  const [evaluations, setEvaluations] = useState<CallMemo[]>([
    { id: '1', createdAt: '2024/01/15 14:30', content: '発注者の対応は協力的。追加情報も積極的に提供してくれた。', tag: 'evaluation' },
  ]);

  const [preSubmitDocs, setPreSubmitDocs] = useState<PreSubmitDocument[]>([
    { id: '1', name: '参加資格確認申請書', status: 'submitted', dueDate: '2024/01/20' },
    { id: '2', name: '技術者配置予定表', status: 'pending', dueDate: '2024/01/22' },
  ]);

  const deleteDoc = (id: string) => {
    setPreSubmitDocs((prev) => prev.filter((d) => d.id !== id));
  };

  const [newMemo, setNewMemo] = useState('');
  const [newMemoTag, setNewMemoTag] = useState<MemoTag>('memo');
  const [newEvaluationText, setNewEvaluationText] = useState('');

  // 入力欄の表示状態
  const [showMemoInput, setShowMemoInput] = useState(false);
  const [showEvaluationInput, setShowEvaluationInput] = useState(false);

  // 回答入力対象の確認事項ID
  const [answerTargetId, setAnswerTargetId] = useState<string | null>(null);
  const [answerText, setAnswerText] = useState('');

  // 編集中のメモID
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');

  const getDateStr = () => {
    const now = new Date();
    return `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}/${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  };

  const addMemo = () => {
    if (!newMemo.trim()) return;
    setCallMemos((prev) => [
      { id: Date.now().toString(), createdAt: getDateStr(), content: newMemo, tag: newMemoTag },
      ...prev,
    ]);
    setNewMemo('');
    setNewMemoTag('memo');
    setShowMemoInput(false);
  };

  const addAnswer = (parentId: string) => {
    if (!answerText.trim()) return;
    setCallMemos((prev) => [
      { id: Date.now().toString(), createdAt: getDateStr(), content: answerText, tag: 'answer', parentId },
      ...prev,
    ]);
    setAnswerText('');
    setAnswerTargetId(null);
  };

  const startEdit = (memo: CallMemo) => {
    setEditingId(memo.id);
    setEditText(memo.content);
  };

  const saveEdit = (id: string) => {
    if (!editText.trim()) return;
    setCallMemos((prev) =>
      prev.map((m) => (m.id === id ? { ...m, content: editText, updatedAt: getDateStr() } : m))
    );
    setEditingId(null);
    setEditText('');
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditText('');
  };

  const deleteMemo = (id: string) => {
    // 紐づく回答も一緒に削除
    setCallMemos((prev) => prev.filter((m) => m.id !== id && m.parentId !== id));
  };

  const addEvaluation = () => {
    if (!newEvaluationText.trim()) return;
    setEvaluations((prev) => [
      { id: Date.now().toString(), createdAt: getDateStr(), content: newEvaluationText, tag: 'evaluation' },
      ...prev,
    ]);
    setNewEvaluationText('');
    setShowEvaluationInput(false);
  };

  // 評価用の編集
  const [editingEvalId, setEditingEvalId] = useState<string | null>(null);
  const [editEvalText, setEditEvalText] = useState('');

  const startEditEval = (eval_: CallMemo) => {
    setEditingEvalId(eval_.id);
    setEditEvalText(eval_.content);
  };

  const saveEditEval = (id: string) => {
    if (!editEvalText.trim()) return;
    setEvaluations((prev) =>
      prev.map((e) => (e.id === id ? { ...e, content: editEvalText, updatedAt: getDateStr() } : e))
    );
    setEditingEvalId(null);
    setEditEvalText('');
  };

  const cancelEditEval = () => {
    setEditingEvalId(null);
    setEditEvalText('');
  };

  const deleteEval = (id: string) => {
    setEvaluations((prev) => prev.filter((e) => e.id !== id));
  };

  // タブ管理
  const [activeTab, setActiveTab] = useState(0);

  // タブごとの担当者（記録、提出書類、評価、文字起こし）
  const [tabAssignees, setTabAssignees] = useState<string[]>(['', '', '', '']);
  const handleTabAssigneeChange = (tabIndex: number, staffId: string) => {
    setTabAssignees((prev) => {
      const newAssignees = [...prev];
      newAssignees[tabIndex] = staffId;
      return newAssignees;
    });
  };

  // トークスクリプトテンプレートごとの担当者
  const [scriptAssignees, setScriptAssignees] = useState<Record<string, string>>({});
  const handleScriptAssigneeChange = (scriptId: string, staffId: string) => {
    setScriptAssignees((prev) => ({ ...prev, [scriptId]: staffId }));
  };

  // メールテンプレートごとの担当者
  const [emailAssignees, setEmailAssignees] = useState<Record<string, string>>({});
  const handleEmailAssigneeChange = (templateId: string, staffId: string) => {
    setEmailAssignees((prev) => ({ ...prev, [templateId]: staffId }));
  };

  // 提出書類アップロードの担当者
  const [docsAssignee, setDocsAssignee] = useState<string>('');

  // テンプレートIDの定数（useEffect内で参照するため）
  const SCRIPT_TEMPLATE_IDS = ['intro', 'followup'];
  const EMAIL_TEMPLATE_IDS = ['1', '2', '3'];

  // ワークフロー担当者が変更されたら、空の担当者欄を自動で埋める
  useEffect(() => {
    if (!workflowAssigneeId) return;

    // tabAssignees: 空のところだけ更新
    setTabAssignees((prev) => prev.map((val) => (val === '' ? workflowAssigneeId : val)));

    // scriptAssignees: 各トークスクリプトテンプレートの空のところを更新
    setScriptAssignees((prev) => {
      const updated = { ...prev };
      SCRIPT_TEMPLATE_IDS.forEach((id) => {
        if (!updated[id]) {
          updated[id] = workflowAssigneeId;
        }
      });
      return updated;
    });

    // emailAssignees: 各メールテンプレートの空のところを更新
    setEmailAssignees((prev) => {
      const updated = { ...prev };
      EMAIL_TEMPLATE_IDS.forEach((id) => {
        if (!updated[id]) {
          updated[id] = workflowAssigneeId;
        }
      });
      return updated;
    });

    // docsAssignee: 空なら更新
    setDocsAssignee((prev) => (prev === '' ? workflowAssigneeId : prev));
  }, [workflowAssigneeId]);

  // 並び替え
  type SortType = 'newest' | 'oldest' | 'category';
  const [sortType, setSortType] = useState<SortType>('newest');
  const [evalSortNewest, setEvalSortNewest] = useState(true);

  // カテゴリーの並び順
  const CATEGORY_ORDER: Record<MemoTag, number> = {
    question: 1,
    answer: 2,
    memo: 3,
    idea: 4,
    evaluation: 5,
  };

  // ソート関数
  const sortMemos = (items: CallMemo[], type: SortType): CallMemo[] => {
    return [...items].sort((a, b) => {
      if (type === 'category') {
        const catDiff = CATEGORY_ORDER[a.tag] - CATEGORY_ORDER[b.tag];
        if (catDiff !== 0) return catDiff;
        // 同じカテゴリー内は新しい順
        const dateA = new Date(a.createdAt.replace(/\//g, '-')).getTime();
        const dateB = new Date(b.createdAt.replace(/\//g, '-')).getTime();
        return dateB - dateA;
      }
      const dateA = new Date(a.createdAt.replace(/\//g, '-')).getTime();
      const dateB = new Date(b.createdAt.replace(/\//g, '-')).getTime();
      return type === 'newest' ? dateB - dateA : dateA - dateB;
    });
  };

  const sortByDate = <T extends { createdAt: string }>(items: T[], newest: boolean): T[] => {
    return [...items].sort((a, b) => {
      const dateA = new Date(a.createdAt.replace(/\//g, '-')).getTime();
      const dateB = new Date(b.createdAt.replace(/\//g, '-')).getTime();
      return newest ? dateB - dateA : dateA - dateB;
    });
  };

  const getSortLabel = (type: SortType) => {
    switch (type) {
      case 'newest': return '新しい順';
      case 'oldest': return '古い順';
      case 'category': return 'カテゴリー順';
    }
  };

  const nextSortType = (current: SortType): SortType => {
    switch (current) {
      case 'newest': return 'oldest';
      case 'oldest': return 'category';
      case 'category': return 'newest';
    }
  };

  // スクリプト開閉状態
  const [scriptOpen, setScriptOpen] = useState(true);

  // 架電記録タブのコンテンツ
  const renderCallLogTab = () => (
    <Box>
      {/* アクションボタン: 電話 */}
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

      {/* トークスクリプト（アコーディオン） */}
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
          {/* テンプレート選択 + 担当者 */}
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
            <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
              {talkScriptTemplates.map((template) => (
                <Chip
                  key={template.id}
                  label={template.label}
                  size="small"
                  icon={<PhoneIcon sx={iconStyles.small} />}
                  onClick={() => handleScriptSelect(template.id)}
                  sx={{
                    ...chipStyles.medium,
                    fontWeight: selectedScriptId === template.id ? 600 : 400,
                    backgroundColor: selectedScriptId === template.id
                      ? 'rgba(5, 150, 105, 0.1)'
                      : 'transparent',
                    color: selectedScriptId === template.id
                      ? colors.accent.greenDark
                      : colors.text.muted,
                    border: `1px solid ${selectedScriptId === template.id
                      ? colors.accent.greenDark
                      : colors.border.main}`,
                    cursor: 'pointer',
                    '& .MuiChip-icon': {
                      color: selectedScriptId === template.id
                        ? colors.accent.greenDark
                        : colors.text.muted,
                    },
                  }}
                />
              ))}
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <PersonIcon sx={{ ...iconStyles.small, color: colors.accent.blue }} />
              <FormControl size="small">
                <Select
                  value={scriptAssignees[selectedScriptId] || ''}
                  onChange={(e) => handleScriptAssigneeChange(selectedScriptId, e.target.value)}
                  displayEmpty
                  sx={staffSelectStyles}
                  renderValue={(value) => {
                    if (!value) return <span style={{ color: colors.text.light, fontSize: fontSizes.xs }}>未割当</span>;
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

          {/* 本文 */}
          <TextField
            value={displayScriptContent}
            onChange={(e) => setEditedScriptContent(e.target.value)}
            fullWidth
            multiline
            minRows={10}
            sx={{ ...sectionStyles.textField, mb: 1.5 }}
          />

          {/* アクションボタン */}
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            <Button
              size="small"
              onClick={resetScript}
              disabled={editedScriptContent === null}
            >
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

      {/* ヘッダー：並び替え＆追加ボタン */}
      {!showMemoInput && (
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
          <Button
            size="small"
            startIcon={sortType === 'category' ? <SortIcon /> : sortType === 'newest' ? <ArrowDownIcon /> : <ArrowUpIcon />}
            onClick={() => setSortType(nextSortType(sortType))}
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

      {/* 入力欄 */}
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
              onChange={(e) => setNewMemo(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && e.ctrlKey && newMemo.trim()) {
                  e.preventDefault();
                  addMemo();
                }
              }}
              placeholder="内容を入力... (Ctrl+Enterで記録)"
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
                onClick={addMemo}
                disabled={!newMemo.trim()}
                sx={{ minWidth: 80, backgroundColor: colors.accent.blue, ...buttonStyles.small, '&:hover': { backgroundColor: colors.accent.blueHover } }}
              >
                記録
              </Button>
              <Button
                size="small"
                onClick={() => { setShowMemoInput(false); setNewMemo(''); setNewMemoTag('memo'); }}
                sx={{ ...buttonStyles.small, color: colors.text.muted }}
              >
                キャンセル
              </Button>
            </Box>
          </Box>
        </Box>
      )}

      {/* メモ一覧 */}
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        {sortMemos(callMemos.filter((m: CallMemo) => !m.parentId), sortType).map((memo: CallMemo) => {
          const isEditing = editingId === memo.id;
          const answers = callMemos.filter((m: CallMemo) => m.parentId === memo.id);
          const isQuestion = memo.tag === 'question';

          return (
            <Box key={memo.id}>
              <MemoCard
                memo={memo}
                isEditing={isEditing}
                editText={editText}
                onEditTextChange={setEditText}
                onStartEdit={() => startEdit(memo)}
                onSaveEdit={() => saveEdit(memo.id)}
                onCancelEdit={cancelEdit}
                onDelete={() => deleteMemo(memo.id)}
              >
                {isQuestion && !answerTargetId && (
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
                      onChange={(e) => setAnswerText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && e.ctrlKey && answerText.trim()) {
                          e.preventDefault();
                          addAnswer(memo.id);
                        }
                      }}
                      placeholder="回答を入力... (Ctrl+Enterで記録)"
                      size="small"
                      fullWidth
                      multiline
                      minRows={2}
                      autoFocus
                      sx={sectionStyles.textField}
                    />
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                      <Button variant="contained" onClick={() => addAnswer(memo.id)} disabled={!answerText.trim()} sx={{ minWidth: 60, backgroundColor: MEMO_TAGS.answer.color, ...buttonStyles.small, '&:hover': { backgroundColor: colors.accent.greenDark } }}>
                        記録
                      </Button>
                      <Button size="small" onClick={() => { setAnswerTargetId(null); setAnswerText(''); }} sx={{ ...buttonStyles.small, color: colors.text.muted, minWidth: 60 }}>
                        取消
                      </Button>
                    </Box>
                  </Box>
                )}
              </MemoCard>
              {answers.length > 0 && (
                <Box sx={{ ml: 3, mt: 0.5, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                  {answers.map((answer: CallMemo) => (
                    <MemoCard
                      key={answer.id}
                      memo={answer}
                      isEditing={editingId === answer.id}
                      editText={editText}
                      onEditTextChange={setEditText}
                      onStartEdit={() => startEdit(answer)}
                      onSaveEdit={() => saveEdit(answer.id)}
                      onCancelEdit={cancelEdit}
                      onDelete={() => deleteMemo(answer.id)}
                      variant="answer"
                    />
                  ))}
                </Box>
              )}
            </Box>
          );
        })}
      </Box>
    </Box>
  );

  // 評価タブのコンテンツ
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
          <Button size="small" startIcon={<AddIcon />} onClick={() => setShowEvaluationInput(true)} sx={{ ...buttonStyles.small, color: colors.accent.blue }}>
            追加
          </Button>
        </Box>
      )}
      {showEvaluationInput && (
        <Box sx={{ display: 'flex', gap: 1, mb: 2, alignItems: 'flex-start' }}>
          <TextField
            value={newEvaluationText}
            onChange={(e) => setNewEvaluationText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && e.ctrlKey && newEvaluationText.trim()) {
                e.preventDefault();
                addEvaluation();
              }
            }}
            placeholder="評価内容を入力... (Ctrl+Enterで記録)"
            size="small"
            fullWidth
            multiline
            minRows={3}
            autoFocus
            sx={sectionStyles.textField}
          />
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
            <Button variant="contained" onClick={addEvaluation} disabled={!newEvaluationText.trim()} sx={{ minWidth: 80, backgroundColor: colors.accent.blue, ...buttonStyles.small, '&:hover': { backgroundColor: colors.accent.blueHover } }}>
              記録
            </Button>
            <Button size="small" onClick={() => { setShowEvaluationInput(false); setNewEvaluationText(''); }} sx={{ ...buttonStyles.small, color: colors.text.muted }}>
              キャンセル
            </Button>
          </Box>
        </Box>
      )}
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        {sortByDate(evaluations, evalSortNewest).map((eval_: CallMemo) => (
          <MemoCard
            key={eval_.id}
            memo={eval_}
            isEditing={editingEvalId === eval_.id}
            editText={editEvalText}
            onEditTextChange={setEditEvalText}
            onStartEdit={() => startEditEval(eval_)}
            onSaveEdit={() => saveEditEval(eval_.id)}
            onCancelEdit={cancelEditEval}
            onDelete={() => deleteEval(eval_.id)}
          />
        ))}
      </Box>
    </Box>
  );

  // 録音文字起こしタブのコンテンツ
  const renderTranscriptionTab = () => (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      {transcriptions.length === 0 ? (
        <Typography sx={{ fontSize: fontSizes.sm, color: colors.text.muted, textAlign: 'center', py: 4 }}>
          録音データはありません
        </Typography>
      ) : (
        transcriptions.map((t) => (
          <Paper
            key={t.id}
            elevation={0}
            sx={{ p: 2, backgroundColor: 'rgba(37, 99, 235, 0.05)', border: '1px solid rgba(37, 99, 235, 0.15)', borderRadius: borderRadius.xs }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
              <MicIcon sx={{ ...iconStyles.small, color: colors.accent.blue }} />
              <Typography sx={{ fontSize: fontSizes.xs, color: colors.text.muted }}>{t.date}</Typography>
            </Box>
            <Typography sx={{ fontSize: fontSizes.sm, color: colors.text.secondary, fontStyle: 'italic' }}>
              {t.content}
            </Typography>
          </Paper>
        ))
      )}
    </Box>
  );

  // メールテンプレート
  const emailTemplates = [
    {
      id: '1',
      label: '資料請求',
      subject: `【資料請求】${projectName}に関する入札資料のご送付のお願い`,
      body: `${ordererOrg}
${ordererContact}様

お世話になっております。
${companyName}の${myName}でございます。

貴機関が公告されております「${projectName}」につきまして、
入札参加を検討しております。

つきましては、下記資料のご送付をお願いできますでしょうか。

・入札説明書
・設計図書
・その他関連資料

ご多忙のところ恐れ入りますが、
何卒よろしくお願いいたします。

─────────────────────
${companyName}
${myName}
─────────────────────`,
    },
    {
      id: '2',
      label: '質問送付',
      subject: `【質問】${projectName}入札に関するご質問`,
      body: `${ordererOrg}
${ordererContact}様

お世話になっております。
${companyName}の${myName}でございます。

貴機関が公告されております「${projectName}」につきまして、
下記の点についてご質問させていただきます。

【質問事項】
1.

ご回答いただけますと幸いです。
何卒よろしくお願いいたします。

─────────────────────
${companyName}
${myName}
─────────────────────`,
    },
    {
      id: '3',
      label: '書類提出',
      subject: `【書類提出】${projectName} 参加資格確認申請書の提出`,
      body: `${ordererOrg}
${ordererContact}様

お世話になっております。
${companyName}の${myName}でございます。

貴機関が公告されております「${projectName}」につきまして、
参加資格確認申請書を提出させていただきます。

添付書類：
・参加資格確認申請書
・技術者配置予定表
・その他必要書類

ご査収のほど、よろしくお願いいたします。

─────────────────────
${companyName}
${myName}
─────────────────────`,
    },
  ];

  // 選択中のテンプレート（デフォルトで最初のテンプレートを選択）
  const [selectedTemplate, setSelectedTemplate] = useState<string>('1');
  const [editSubject, setEditSubject] = useState(emailTemplates[0]?.subject || '');
  const [editBody, setEditBody] = useState(emailTemplates[0]?.body || '');

  // アコーディオン開閉状態
  const [textAccordionOpen, setTextAccordionOpen] = useState(true);
  const [docsAccordionOpen, setDocsAccordionOpen] = useState(true);

  // テンプレート選択時に編集用stateを初期化
  const selectTemplate = (templateId: string) => {
    const template = emailTemplates.find((t) => t.id === templateId);
    setSelectedTemplate(templateId);
    setEditSubject(template?.subject || '');
    setEditBody(template?.body || '');
  };

  // 提出書類タブのコンテンツ
  const renderDocumentsTab = () => {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        {/* 送信ボタン（アコーディオンの外） */}
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

        {/* 文章 アコーディオン */}
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
            {/* テンプレート選択 + 担当者 */}
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
                      onClick={() => selectTemplate(template.id)}
                      sx={{
                        ...chipStyles.medium,
                        fontWeight: isSelected ? 600 : 400,
                        backgroundColor: isSelected
                          ? colors.accent.blueBg
                          : 'transparent',
                        color: isSelected
                          ? colors.accent.blue
                          : colors.text.muted,
                        border: `1px solid ${isSelected
                          ? colors.accent.blue
                          : colors.border.main}`,
                        cursor: 'pointer',
                        '& .MuiChip-icon': {
                          color: isSelected
                            ? colors.accent.blue
                            : colors.text.muted,
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
                    onChange={(e) => handleEmailAssigneeChange(selectedTemplate, e.target.value)}
                    displayEmpty
                    sx={staffSelectStyles}
                    renderValue={(value) => {
                      if (!value) return <span style={{ color: colors.text.light, fontSize: fontSizes.xs }}>未割当</span>;
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

            {/* 件名 */}
            <Box sx={{ mb: 2 }}>
              <Typography sx={{ fontSize: fontSizes.xs, color: colors.text.muted, mb: 0.5 }}>
                件名
              </Typography>
              <TextField
                value={editSubject}
                onChange={(e) => setEditSubject(e.target.value)}
                size="small"
                fullWidth
                sx={sectionStyles.textField}
              />
            </Box>

            {/* 本文 */}
            <Box>
              <Typography sx={{ fontSize: fontSizes.xs, color: colors.text.muted, mb: 0.5 }}>
                本文
              </Typography>
              <TextField
                value={editBody}
                onChange={(e) => setEditBody(e.target.value)}
                size="small"
                fullWidth
                multiline
                minRows={8}
                sx={sectionStyles.textField}
              />
            </Box>
          </AccordionDetails>
        </Accordion>

        {/* 提出書類 アコーディオン */}
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
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <PersonIcon sx={{ ...iconStyles.small, color: colors.accent.blue }} />
                <FormControl size="small">
                <Select
                  value={docsAssignee}
                  onChange={(e) => setDocsAssignee(e.target.value)}
                  displayEmpty
                  sx={staffSelectStyles}
                  renderValue={(value) => {
                    if (!value) return <span style={{ color: colors.text.light, fontSize: fontSizes.xs }}>未割当</span>;
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
                sx={{ ...buttonStyles.small, color: colors.accent.blue, fontSize: fontSizes.xs }}
              >
                ファイルを追加
              </Button>
            </Box>
            {preSubmitDocs.length === 0 ? (
              <Typography sx={{ fontSize: fontSizes.xs, color: colors.text.muted, textAlign: 'center', py: 2 }}>
                提出書類がありません
              </Typography>
            ) : (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                {preSubmitDocs.map((doc) => {
                  const isUploaded = doc.status === 'submitted';
                  return (
                    <Box
                      key={doc.id}
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 1,
                        p: 1,
                        borderRadius: borderRadius.xs,
                        backgroundColor: isUploaded ? 'rgba(5, 150, 105, 0.05)' : colors.text.white,
                        border: `1px solid ${isUploaded ? 'rgba(5, 150, 105, 0.2)' : colors.border.main}`,
                      }}
                    >
                      <input
                        type="checkbox"
                        id={`attach-${doc.id}`}
                        defaultChecked={isUploaded}
                        disabled={!isUploaded}
                        style={{ cursor: isUploaded ? 'pointer' : 'not-allowed' }}
                      />
                      <AttachFileIcon sx={{ ...iconStyles.medium, color: isUploaded ? colors.status.success.main : colors.text.muted }} />
                      <Box sx={{ flex: 1 }}>
                        <Typography
                          component="label"
                          htmlFor={`attach-${doc.id}`}
                          sx={{ fontSize: fontSizes.sm, color: colors.text.secondary, cursor: isUploaded ? 'pointer' : 'default', display: 'block' }}
                        >
                          {doc.name}
                        </Typography>
                        {doc.dueDate && (
                          <Typography sx={{ fontSize: fontSizes.xs, color: colors.text.muted }}>
                            期限: {doc.dueDate}
                          </Typography>
                        )}
                      </Box>
                      {isUploaded ? (
                        <Chip
                          size="small"
                          label="アップロード済"
                          sx={{ ...chipStyles.small, backgroundColor: 'rgba(5, 150, 105, 0.15)', color: colors.status.success.main }}
                        />
                      ) : (
                        <Button
                          size="small"
                          startIcon={<UploadIcon sx={iconStyles.small} />}
                          sx={{ ...buttonStyles.small, fontSize: fontSizes.xs, color: colors.accent.blue }}
                        >
                          アップロード
                        </Button>
                      )}
                      <IconButton size="small" onClick={() => deleteDoc(doc.id)}>
                        <DeleteIcon sx={{ ...iconStyles.small, color: colors.text.light, '&:hover': { color: colors.status.error.main } }} />
                      </IconButton>
                    </Box>
                  );
                })}
              </Box>
            )}
          </AccordionDetails>
        </Accordion>
      </Box>
    );
  };

  return (
    <Box>
      {/* タブ + 担当者選択 */}
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
                onChange={(e) => handleTabAssigneeChange(activeTab, e.target.value)}
                displayEmpty
                sx={staffSelectStyles}
                renderValue={(value) => {
                  if (!value) return <span style={{ color: colors.text.light, fontSize: fontSizes.xs }}>担当者</span>;
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

      {/* タブコンテンツ */}
      <Box>
        {activeTab === 0 && renderCallLogTab()}
        {activeTab === 1 && renderDocumentsTab()}
        {activeTab === 2 && renderEvaluationTab()}
        {activeTab === 3 && renderTranscriptionTab()}
      </Box>
    </Box>
  );
}
