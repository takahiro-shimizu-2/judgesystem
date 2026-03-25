/**
 * 協力会社セクション（候補者リスト）
 * 企業情報、ステータス管理、メモ、文字起こし、トークスクリプトを表示
 */
import { useState, useMemo, useCallback, useEffect } from 'react';
import {
  Box,
  Typography,
  Button,
  Chip,
  IconButton,
  Paper,
  TextField,
  Menu,
  MenuItem,
  FormControlLabel,
  Checkbox,
  Tabs,
  Tab,
  Collapse,
  Select,
  FormControl,
} from '@mui/material';
import {
  Business as BusinessIcon,
  Add as AddIcon,
  Phone as PhoneIcon,
  Email as EmailIcon,
  CheckCircle as CheckCircleIcon,
  RadioButtonUnchecked as UncheckedIcon,
  FilterAlt as FilterIcon,
  KeyboardArrowDown as ArrowDownIcon,
  Mic as MicIcon,
  MenuBook as ScriptIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Close as CloseIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
  AttachFile as AttachFileIcon,
  Check as CheckIcon,
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
import type { Partner, PartnerStatus, PartnerDocument } from '../../../types';
import { partnerStatusLabels, partnerStatusColors, partnerStatusPriority } from '../../../constants/partnerStatus';
import { ContactInfo, ContactActions } from '../../common/ContactInfo';
import { useStaffDirectory } from '../../../contexts/StaffContext';
import { PersonIcon } from '../../../constants/icons';

// RecordMemoをCallMemoとして使用
type CallMemo = RecordMemo;

// ============================================================================
// テンプレート定義
// ============================================================================

interface ScriptTemplate {
  id: string;
  label: string;
  type: 'talk' | 'email';
  subject?: string; // メールの場合の件名
  content: string;
}

// プレースホルダー: {{企業名}}, {{担当者名}}, {{電話番号}}, {{案件名}}, {{自社名}}, {{自社担当者}}
const SCRIPT_TEMPLATES: ScriptTemplate[] = [
  {
    id: 'talk-intro',
    label: '初回架電',
    type: 'talk',
    content: `【挨拶】
お世話になっております。{{自社名}}の{{自社担当者}}と申します。

【用件】
本日は「{{案件名}}」の件でご連絡させていただきました。
{{企業名}}様にぜひご協力いただきたく、お電話いたしました。

【確認事項】
・本案件へのご参加は可能でしょうか？
・現地調査のご対応は可能でしょうか？
・概算見積のご提出は可能でしょうか？

【クロージング】
ありがとうございます。それでは詳細資料をお送りさせていただきます。
{{担当者名}}様、よろしくお願いいたします。`,
  },
  {
    id: 'talk-followup',
    label: 'フォローアップ',
    type: 'talk',
    content: `【挨拶】
お世話になっております。{{自社名}}の{{自社担当者}}です。

【用件】
先日ご連絡させていただいた「{{案件名}}」の件で、
その後のご検討状況をお伺いしたくお電話いたしました。

【確認事項】
・ご検討いただけましたでしょうか？
・ご不明点などございますか？
・見積書のご提出予定はいつ頃になりそうでしょうか？

【クロージング】
ありがとうございます。引き続きよろしくお願いいたします。`,
  },
  {
    id: 'email-request',
    label: '資料送付依頼',
    type: 'email',
    subject: '【{{案件名}}】資料送付のお願い',
    content: `{{企業名}}
{{担当者名}} 様

お世話になっております。
{{自社名}}の{{自社担当者}}でございます。

「{{案件名}}」につきまして、
下記資料のご送付をお願いしたく、ご連絡いたしました。

【ご依頼資料】
・会社概要
・工事実績一覧
・技術者名簿

ご多忙のところ恐れ入りますが、
ご対応のほどよろしくお願いいたします。

――――――――――――――――
{{自社名}}
{{自社担当者}}
――――――――――――――――`,
  },
  {
    id: 'email-estimate',
    label: '見積依頼',
    type: 'email',
    subject: '【{{案件名}}】見積書作成のお願い',
    content: `{{企業名}}
{{担当者名}} 様

お世話になっております。
{{自社名}}の{{自社担当者}}でございます。

「{{案件名}}」につきまして、
見積書の作成をお願いしたく、ご連絡いたしました。

【案件概要】
・案件名：{{案件名}}
・提出期限：○月○日

詳細は添付資料をご確認ください。
ご不明点がございましたら、お気軽にお問い合わせください。

何卒よろしくお願いいたします。

――――――――――――――――
{{自社名}}
{{自社担当者}}
――――――――――――――――`,
  },
];

// プレースホルダーを置換する関数
const replacePlaceholders = (
  template: string,
  partner: Partner,
  projectName: string,
  companyName: string,
  myName: string
): string => {
  return template
    .replace(/\{\{企業名\}\}/g, partner.name)
    .replace(/\{\{担当者名\}\}/g, partner.contactPerson)
    .replace(/\{\{電話番号\}\}/g, partner.phone)
    .replace(/\{\{案件名\}\}/g, projectName)
    .replace(/\{\{自社名\}\}/g, companyName)
    .replace(/\{\{自社担当者\}\}/g, myName);
};

// ============================================================================
// スタイル定数
// ============================================================================

const STYLES = {
  partnerCard: {
    p: 2,
    backgroundColor: colors.text.white,
    borderRadius: borderRadius.xs,
    border: `1px solid ${colors.border.main}`,
    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)',
  },
  infoRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 0.5,
    color: colors.text.muted,
  },
} as const;

// ============================================================================
// サブコンポーネント
// ============================================================================

// ステータスチップ（クリックで変更可能）
function StatusChip({
  status,
  onStatusChange,
}: {
  status: PartnerStatus;
  onStatusChange: (newStatus: PartnerStatus) => void;
}) {
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const config = partnerStatusColors[status];

  const handleClick = (event: React.MouseEvent<HTMLElement>) => {
    event.stopPropagation();
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => setAnchorEl(null);

  const handleSelect = (newStatus: PartnerStatus) => {
    onStatusChange(newStatus);
    handleClose();
  };

  const allStatuses: PartnerStatus[] = [
    'not_called', 'waiting_documents', 'waiting_response',
    'estimate_in_progress', 'estimate_completed', 'estimate_adopted', 'unavailable',
  ];

  return (
    <>
      <Chip
        label={partnerStatusLabels[status]}
        size="small"
        onClick={handleClick}
        deleteIcon={<ArrowDownIcon sx={iconStyles.small} />}
        onDelete={handleClick}
        sx={{
          ...chipStyles.medium,
          backgroundColor: config.bgColor,
          color: config.color,
          cursor: 'pointer',
          '& .MuiChip-deleteIcon': { color: config.color, ...iconStyles.small },
        }}
      />
      <Menu anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={handleClose}>
        {allStatuses.map((s) => {
          const sConfig = partnerStatusColors[s];
          return (
            <MenuItem
              key={s}
              onClick={() => handleSelect(s)}
              selected={s === status}
              sx={{ fontSize: fontSizes.sm, color: sConfig.color, '&.Mui-selected': { backgroundColor: sConfig.bgColor } }}
            >
              {partnerStatusLabels[s]}
            </MenuItem>
          );
        })}
      </Menu>
    </>
  );
}

// 現地調査OKボタン
function SurveyApprovedButton({ approved, onToggle }: { approved: boolean; onToggle: () => void }) {
  return (
    <Chip
      icon={approved ? <CheckCircleIcon sx={iconStyles.small} /> : <UncheckedIcon sx={iconStyles.small} />}
      label="現地調査OK"
      size="small"
      onClick={(e) => { e.stopPropagation(); onToggle(); }}
      sx={{
        ...chipStyles.medium,
        backgroundColor: approved ? 'rgba(16, 185, 129, 0.1)' : 'transparent',
        color: approved ? colors.accent.green : colors.text.muted,
        border: `1px solid ${approved ? colors.accent.green : colors.border.main}`,
        cursor: 'pointer',
        '& .MuiChip-icon': { color: approved ? colors.accent.green : colors.text.muted },
      }}
    />
  );
}

// フィルターチップ
function FilterChips({
  selectedStatuses,
  showUnavailable,
  onToggleStatus,
  onToggleShowUnavailable,
}: {
  selectedStatuses: PartnerStatus[];
  showUnavailable: boolean;
  onToggleStatus: (status: PartnerStatus) => void;
  onToggleShowUnavailable: () => void;
}) {
  const allStatuses: PartnerStatus[] = ['not_called', 'waiting_documents', 'waiting_response', 'estimate_in_progress', 'estimate_completed', 'estimate_adopted'];

  return (
    <Box sx={{ display: 'flex', gap: 0.75, alignItems: 'center', flexWrap: 'wrap', mb: 1 }}>
      <FilterIcon sx={{ ...iconStyles.medium, color: colors.text.muted }} />
      {allStatuses.map((status) => {
        const isSelected = selectedStatuses.includes(status);
        const config = partnerStatusColors[status];
        return (
          <Chip
            key={status}
            label={partnerStatusLabels[status]}
            size="small"
            onClick={() => onToggleStatus(status)}
            sx={{
              ...chipStyles.medium,
              backgroundColor: isSelected ? config.bgColor : colors.background.paper,
              color: isSelected ? config.color : colors.text.muted,
              cursor: 'pointer',
              '&:hover': {
                backgroundColor: isSelected ? config.bgColor : colors.border.light,
              },
            }}
          />
        );
      })}
      <FormControlLabel
        control={<Checkbox checked={showUnavailable} onChange={onToggleShowUnavailable} size="small" sx={{ p: 0.5 }} />}
        label={<Typography sx={{ fontSize: fontSizes.sm, color: colors.text.muted }}>対応不可</Typography>}
        sx={{ ml: 1, mr: 0 }}
      />
    </Box>
  );
}

// パートナーカード
function PartnerCard({
  partner,
  isExpanded,
  onToggleExpand,
  onStatusChange,
  onToggleSurvey,
  projectName,
  companyName,
  myName,
  workflowAssigneeId,
}: {
  partner: Partner;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onStatusChange: (status: PartnerStatus) => void;
  onToggleSurvey: () => void;
  projectName: string;
  companyName: string;
  myName: string;
  workflowAssigneeId?: string;
}) {
  const { staff, findById } = useStaffDirectory();
  const [activeTab, setActiveTab] = useState(0);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('talk-intro');
  const [editedContent, setEditedContent] = useState<string | null>(null);

  // テンプレートごとの担当者
  const [templateAssignees, setTemplateAssignees] = useState<Record<string, string>>({});

  // 受信資料の担当者
  const [receivedDocsAssignee, setReceivedDocsAssignee] = useState<string>('');

  // メールタブ用
  const [selectedEmailTemplateId, setSelectedEmailTemplateId] = useState<string>('email-request');
  const [editedEmailSubject, setEditedEmailSubject] = useState<string | null>(null);
  const [editedEmailContent, setEditedEmailContent] = useState<string | null>(null);
  const [emailAssignees, setEmailAssignees] = useState<Record<string, string>>({});

  // テンプレートIDの定数
  const TALK_TEMPLATE_IDS = ['talk-intro', 'talk-followup'];
  const EMAIL_TEMPLATE_IDS = ['email-request', 'email-estimate'];

  // ワークフロー担当者が変更されたら、空の担当者欄を自動で埋める
  useEffect(() => {
    if (!workflowAssigneeId) return;

    // templateAssignees: 各トークスクリプトテンプレートの空のところを更新
    setTemplateAssignees((prev) => {
      const updated = { ...prev };
      TALK_TEMPLATE_IDS.forEach((id) => {
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

    // receivedDocsAssignee: 空なら更新
    setReceivedDocsAssignee((prev) => (prev === '' ? workflowAssigneeId : prev));
  }, [workflowAssigneeId]);

  // 架電記録メモ（タグ付き）
  const [callMemos, setCallMemos] = useState<CallMemo[]>([]);
  const [newCallMemo, setNewCallMemo] = useState('');
  const [newMemoTag, setNewMemoTag] = useState<MemoTag>('memo');
  const [showCallMemoInput, setShowCallMemoInput] = useState(false);
  const [editingCallMemoId, setEditingCallMemoId] = useState<string | null>(null);
  const [editCallMemoText, setEditCallMemoText] = useState('');
  const [answerTargetId, setAnswerTargetId] = useState<string | null>(null);
  const [answerText, setAnswerText] = useState('');

  const getDateStr = () => {
    const now = new Date();
    return `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}/${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  };

  // 架電記録メモ操作
  const addCallMemo = () => {
    if (!newCallMemo.trim()) return;
    setCallMemos((prev) => [
      { id: Date.now().toString(), createdAt: getDateStr(), content: newCallMemo, tag: newMemoTag },
      ...prev,
    ]);
    setNewCallMemo('');
    setNewMemoTag('memo');
    setShowCallMemoInput(false);
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

  const saveCallMemo = (id: string) => {
    if (!editCallMemoText.trim()) return;
    setCallMemos((prev) =>
      prev.map((m) => (m.id === id ? { ...m, content: editCallMemoText, updatedAt: getDateStr() } : m))
    );
    setEditingCallMemoId(null);
    setEditCallMemoText('');
  };

  const deleteCallMemo = (id: string) => {
    setCallMemos((prev) => prev.filter((m) => m.id !== id && m.parentId !== id));
  };

  // 選択中のテンプレート（スクリプトタブ用）
  const selectedTemplate = SCRIPT_TEMPLATES.find((t) => t.id === selectedTemplateId) || SCRIPT_TEMPLATES[0];
  const renderedContent = replacePlaceholders(selectedTemplate.content, partner, projectName, companyName, myName);

  // 表示用（編集済みならその内容、なければテンプレートから生成）
  const displayContent = editedContent !== null ? editedContent : renderedContent;

  // テンプレート選択時（テンプレートからリセット）
  const handleTemplateSelect = (templateId: string) => {
    setSelectedTemplateId(templateId);
    setEditedContent(null);
  };

  // テンプレートにリセット
  const resetToTemplate = () => {
    setEditedContent(null);
  };

  return (
    <Paper elevation={0} sx={STYLES.partnerCard}>
      {/* ヘッダー: クリックで展開/折りたたみ */}
      <Box
        onClick={onToggleExpand}
        sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', mb: 1.5 }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontSize: fontSizes.md, fontWeight: 600, color: colors.text.secondary, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {partner.name}
          </Typography>
          <StatusChip status={partner.status} onStatusChange={onStatusChange} />
          <SurveyApprovedButton approved={partner.surveyApproved} onToggle={onToggleSurvey} />
        </Box>
        <IconButton size="small">
          {isExpanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
        </IconButton>
      </Box>

      {/* 電話・メールボタン */}
      <Box sx={{ mb: 1 }}>
        <ContactActions phone={partner.phone} email={partner.email} size="small" />
      </Box>

      {/* 展開時のコンテンツ */}
      <Collapse in={isExpanded}>
        <Box sx={{ mt: 1.5, pt: 1.5, borderTop: `1px solid ${colors.border.light}` }}>
          {/* 連絡先情報 */}
          <Box sx={{ mb: 1.5 }}>
            <ContactInfo
              contactPerson={partner.contactPerson}
              phone={partner.phone}
              email={partner.email}
              fax={partner.fax}
              layout="row"
            />
          </Box>

          {/* タブ: スクリプト・メール・文字起こし・受信資料 */}
          <Tabs
            value={activeTab}
            onChange={(_, v) => setActiveTab(v)}
            sx={{ minHeight: 36, mb: 2, '& .MuiTab-root': { minHeight: 36, py: 0.5, px: 1.5, fontSize: fontSizes.sm, textTransform: 'none' }, '& .MuiTabs-indicator': { backgroundColor: colors.accent.blue }, '& .Mui-selected': { color: colors.accent.blue } }}
          >
            <Tab icon={<ScriptIcon sx={iconStyles.small} />} iconPosition="start" label="スクリプト" />
            <Tab icon={<EmailIcon sx={iconStyles.small} />} iconPosition="start" label="メール" />
            <Tab icon={<AttachFileIcon sx={iconStyles.small} />} iconPosition="start" label={`受信資料(${partner.receivedDocuments.length})`} />
            <Tab icon={<MicIcon sx={iconStyles.small} />} iconPosition="start" label={`文字起こし(${partner.transcriptions.length})`} />
          </Tabs>

          {/* スクリプトタブ（talkタイプのみ） */}
          {activeTab === 0 && (
            <Box>
              {/* テンプレート選択 + 担当者 */}
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
                <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                  {SCRIPT_TEMPLATES.filter((t) => t.type === 'talk').map((template) => (
                    <Chip
                      key={template.id}
                      label={template.label}
                      size="small"
                      icon={<PhoneIcon sx={iconStyles.small} />}
                      onClick={() => handleTemplateSelect(template.id)}
                      sx={{
                        ...chipStyles.medium,
                        fontWeight: selectedTemplateId === template.id ? 600 : 400,
                        backgroundColor: selectedTemplateId === template.id
                          ? 'rgba(5, 150, 105, 0.1)'
                          : 'transparent',
                        color: selectedTemplateId === template.id
                          ? colors.accent.greenDark
                          : colors.text.muted,
                        border: `1px solid ${selectedTemplateId === template.id
                          ? colors.accent.greenDark
                          : colors.border.main}`,
                        cursor: 'pointer',
                        '& .MuiChip-icon': {
                          color: selectedTemplateId === template.id
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
                      value={templateAssignees[selectedTemplateId] || ''}
                      onChange={(e) => setTemplateAssignees(prev => ({ ...prev, [selectedTemplateId]: e.target.value }))}
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
              <Typography sx={{ fontSize: fontSizes.xs, color: colors.text.muted, mb: 0.5 }}>本文</Typography>
              <TextField
                value={displayContent}
                onChange={(e) => setEditedContent(e.target.value)}
                fullWidth
                multiline
                minRows={12}
                sx={{ ...sectionStyles.textField, mb: 1.5 }}
              />

              {/* アクションボタン */}
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2 }}>
                <Button
                  size="small"
                  onClick={resetToTemplate}
                  disabled={editedContent === null}
                >
                  テンプレートに戻す
                </Button>
                <Button
                  size="small"
                  variant="outlined"
                  onClick={() => navigator.clipboard.writeText(displayContent)}
                >
                  本文をコピー
                </Button>
              </Box>

              {/* 記録セクション */}
              <Box sx={{ borderTop: `1px solid ${colors.border.light}`, pt: 2 }}>
                {/* ヘッダー */}
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                  <Typography sx={{ fontSize: fontSizes.sm, fontWeight: 600, color: colors.text.secondary }}>
                    記録 {callMemos.length > 0 && `(${callMemos.filter(m => !m.parentId).length})`}
                  </Typography>
                  {!showCallMemoInput && (
                    <Button
                      size="small"
                      startIcon={<AddIcon />}
                      onClick={() => setShowCallMemoInput(true)}
                      sx={{ ...buttonStyles.small, color: colors.accent.blue }}
                    >
                      追加
                    </Button>
                  )}
                </Box>

                {/* 入力欄 */}
                {showCallMemoInput && (
                  <Box sx={{ mb: 1.5 }}>
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
                                minWidth: 'auto',
                                px: 1.5,
                                py: 0.5,
                                fontSize: fontSizes.xs,
                                borderRadius: borderRadius.xs,
                                textTransform: 'none',
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
                        value={newCallMemo}
                        onChange={(e) => setNewCallMemo(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && e.ctrlKey && newCallMemo.trim()) {
                            e.preventDefault();
                            addCallMemo();
                          }
                        }}
                        placeholder="内容を入力... (Ctrl+Enterで記録)"
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
                          onClick={addCallMemo}
                          disabled={!newCallMemo.trim()}
                          sx={{ minWidth: 60, backgroundColor: colors.accent.blue, ...buttonStyles.small, '&:hover': { backgroundColor: colors.accent.blueHover } }}
                        >
                          記録
                        </Button>
                        <Button
                          size="small"
                          onClick={() => { setShowCallMemoInput(false); setNewCallMemo(''); setNewMemoTag('memo'); }}
                          sx={{ ...buttonStyles.small, color: colors.text.muted }}
                        >
                          取消
                        </Button>
                      </Box>
                    </Box>
                  </Box>
                )}

                {/* メモ一覧 */}
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, maxHeight: 300, overflow: 'auto' }}>
                  {callMemos.filter((m) => !m.parentId).map((memo) => {
                    const tagConfig = MEMO_TAGS[memo.tag];
                    const TagIcon = tagConfig.icon;
                    const isEditing = editingCallMemoId === memo.id;
                    const answers = callMemos.filter((m) => m.parentId === memo.id);
                    const isQuestion = memo.tag === 'question';

                    return (
                      <Box key={memo.id}>
                        <Paper
                          elevation={0}
                          sx={{
                            p: 1.5,
                            backgroundColor: colors.text.white,
                            borderRadius: borderRadius.xs,
                            border: `1px solid ${colors.border.main}`,
                          }}
                        >
                          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.5 }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              <Chip
                                size="small"
                                icon={<TagIcon sx={iconStyles.small} />}
                                label={tagConfig.label}
                                sx={{
                                  ...chipStyles.small,
                                  backgroundColor: tagConfig.bgColor,
                                  color: tagConfig.color,
                                  '& .MuiChip-icon': { color: tagConfig.color },
                                }}
                              />
                              <Typography sx={{ fontSize: fontSizes.xs, color: colors.text.muted }}>{memo.createdAt}</Typography>
                            </Box>
                            {!isEditing && (
                              <Box sx={{ display: 'flex', gap: 0.5 }}>
                                <IconButton size="small" onClick={() => { setEditingCallMemoId(memo.id); setEditCallMemoText(memo.content); }} sx={{ p: 0.5 }}>
                                  <EditIcon sx={{ ...iconStyles.small, color: colors.text.muted }} />
                                </IconButton>
                                <IconButton size="small" onClick={() => deleteCallMemo(memo.id)} sx={{ p: 0.5 }}>
                                  <DeleteIcon sx={{ ...iconStyles.small, color: colors.status.error.main }} />
                                </IconButton>
                              </Box>
                            )}
                          </Box>
                          {isEditing ? (
                            <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
                              <TextField
                                value={editCallMemoText}
                                onChange={(e) => setEditCallMemoText(e.target.value)}
                                size="small"
                                fullWidth
                                multiline
                                autoFocus
                                sx={sectionStyles.textField}
                              />
                              <IconButton size="small" onClick={() => saveCallMemo(memo.id)} color="primary">
                                <CheckIcon sx={iconStyles.medium} />
                              </IconButton>
                              <IconButton size="small" onClick={() => setEditingCallMemoId(null)}>
                                <CloseIcon sx={{ ...iconStyles.medium, color: colors.text.muted }} />
                              </IconButton>
                            </Box>
                          ) : (
                            <Typography sx={{ fontSize: fontSizes.sm, color: colors.text.secondary }}>{memo.content}</Typography>
                          )}

                          {/* 回答追加ボタン（確認事項の場合） */}
                          {isQuestion && !answerTargetId && !isEditing && (
                            <Button
                              size="small"
                              onClick={() => setAnswerTargetId(memo.id)}
                              sx={{ mt: 1, py: 0.5, px: 1.5, backgroundColor: MEMO_TAGS.answer.bgColor, color: MEMO_TAGS.answer.color, fontWeight: 600, fontSize: fontSizes.xs, borderRadius: borderRadius.xs, '&:hover': { backgroundColor: 'rgba(16, 185, 129, 0.2)' } }}
                            >
                              回答を追加
                            </Button>
                          )}

                          {/* 回答入力欄 */}
                          {answerTargetId === memo.id && (
                            <Box sx={{ mt: 1, display: 'flex', gap: 1, alignItems: 'flex-start' }}>
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
                                minRows={1}
                                autoFocus
                                sx={sectionStyles.textField}
                              />
                              <Button variant="contained" onClick={() => addAnswer(memo.id)} disabled={!answerText.trim()} sx={{ minWidth: 50, backgroundColor: MEMO_TAGS.answer.color, ...buttonStyles.small, '&:hover': { backgroundColor: colors.accent.greenDark } }}>
                                記録
                              </Button>
                              <Button size="small" onClick={() => { setAnswerTargetId(null); setAnswerText(''); }} sx={{ ...buttonStyles.small, color: colors.text.muted, minWidth: 40 }}>
                                取消
                              </Button>
                            </Box>
                          )}
                        </Paper>

                        {/* 回答一覧 */}
                        {answers.length > 0 && (
                          <Box sx={{ ml: 2, mt: 0.5, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                            {answers.map((answer) => {
                              const answerConfig = MEMO_TAGS.answer;
                              const AnswerTagIcon = answerConfig.icon;
                              const isAnswerEditing = editingCallMemoId === answer.id;
                              return (
                                <Paper
                                  key={answer.id}
                                  elevation={0}
                                  sx={{
                                    p: 1,
                                    backgroundColor: answerConfig.bgColor,
                                    border: `1px solid ${answerConfig.color}20`,
                                    borderRadius: borderRadius.xs,
                                  }}
                                >
                                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.5 }}>
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                      <AnswerTagIcon sx={{ ...iconStyles.small, color: answerConfig.color }} />
                                      <Typography sx={{ fontSize: fontSizes.xs, color: colors.text.muted }}>{answer.createdAt}</Typography>
                                    </Box>
                                    {!isAnswerEditing && (
                                      <Box sx={{ display: 'flex', gap: 0.5 }}>
                                        <IconButton size="small" onClick={() => { setEditingCallMemoId(answer.id); setEditCallMemoText(answer.content); }} sx={{ p: 0.25 }}>
                                          <EditIcon sx={{ ...iconStyles.small, color: colors.text.muted }} />
                                        </IconButton>
                                        <IconButton size="small" onClick={() => deleteCallMemo(answer.id)} sx={{ p: 0.25 }}>
                                          <DeleteIcon sx={{ ...iconStyles.small, color: colors.status.error.main }} />
                                        </IconButton>
                                      </Box>
                                    )}
                                  </Box>
                                  {isAnswerEditing ? (
                                    <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
                                      <TextField
                                        value={editCallMemoText}
                                        onChange={(e) => setEditCallMemoText(e.target.value)}
                                        size="small"
                                        fullWidth
                                        autoFocus
                                        sx={sectionStyles.textField}
                                      />
                                      <IconButton size="small" onClick={() => saveCallMemo(answer.id)} color="primary">
                                        <CheckIcon sx={iconStyles.medium} />
                                      </IconButton>
                                      <IconButton size="small" onClick={() => setEditingCallMemoId(null)}>
                                        <CloseIcon sx={{ ...iconStyles.medium, color: colors.text.muted }} />
                                      </IconButton>
                                    </Box>
                                  ) : (
                                    <Typography sx={{ fontSize: fontSizes.sm, color: colors.text.secondary }}>{answer.content}</Typography>
                                  )}
                                </Paper>
                              );
                            })}
                          </Box>
                        )}
                      </Box>
                    );
                  })}
                </Box>

                {callMemos.length === 0 && !showCallMemoInput && (
                  <Typography sx={{ fontSize: fontSizes.sm, color: colors.text.muted, textAlign: 'center', py: 2 }}>
                    記録がありません
                  </Typography>
                )}
              </Box>
            </Box>
          )}

          {/* メールタブ（emailタイプのみ） */}
          {activeTab === 1 && (
            <Box>
              {/* テンプレート選択 + 担当者 */}
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
                <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                  {SCRIPT_TEMPLATES.filter((t) => t.type === 'email').map((template) => (
                    <Chip
                      key={template.id}
                      label={template.label}
                      size="small"
                      icon={<EmailIcon sx={iconStyles.small} />}
                      onClick={() => {
                        setSelectedEmailTemplateId(template.id);
                        setEditedEmailSubject(null);
                        setEditedEmailContent(null);
                      }}
                      sx={{
                        ...chipStyles.medium,
                        fontWeight: selectedEmailTemplateId === template.id ? 600 : 400,
                        backgroundColor: selectedEmailTemplateId === template.id
                          ? colors.accent.blueBg
                          : 'transparent',
                        color: selectedEmailTemplateId === template.id
                          ? colors.accent.blue
                          : colors.text.muted,
                        border: `1px solid ${selectedEmailTemplateId === template.id
                          ? colors.accent.blue
                          : colors.border.main}`,
                        cursor: 'pointer',
                        '& .MuiChip-icon': {
                          color: selectedEmailTemplateId === template.id
                            ? colors.accent.blue
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
                      value={emailAssignees[selectedEmailTemplateId] || ''}
                      onChange={(e) => setEmailAssignees(prev => ({ ...prev, [selectedEmailTemplateId]: e.target.value }))}
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
              {(() => {
                const emailTemplate = SCRIPT_TEMPLATES.find((t) => t.id === selectedEmailTemplateId);
                const renderedEmailSubject = emailTemplate?.subject
                  ? replacePlaceholders(emailTemplate.subject, partner, projectName, companyName, myName)
                  : '';
                const renderedEmailContent = emailTemplate
                  ? replacePlaceholders(emailTemplate.content, partner, projectName, companyName, myName)
                  : '';
                const displayEmailSubject = editedEmailSubject !== null ? editedEmailSubject : renderedEmailSubject;
                const displayEmailContent = editedEmailContent !== null ? editedEmailContent : renderedEmailContent;

                return (
                  <>
                    <Box sx={{ mb: 1.5 }}>
                      <Typography sx={{ fontSize: fontSizes.xs, color: colors.text.muted, mb: 0.5 }}>件名</Typography>
                      <TextField
                        value={displayEmailSubject}
                        onChange={(e) => setEditedEmailSubject(e.target.value)}
                        size="small"
                        fullWidth
                        sx={sectionStyles.textField}
                      />
                    </Box>

                    {/* 本文 */}
                    <Typography sx={{ fontSize: fontSizes.xs, color: colors.text.muted, mb: 0.5 }}>本文</Typography>
                    <TextField
                      value={displayEmailContent}
                      onChange={(e) => setEditedEmailContent(e.target.value)}
                      fullWidth
                      multiline
                      minRows={10}
                      sx={{ ...sectionStyles.textField, mb: 1.5 }}
                    />

                    {/* アクションボタン */}
                    <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                      <Button
                        size="small"
                        onClick={() => {
                          setEditedEmailSubject(null);
                          setEditedEmailContent(null);
                        }}
                        disabled={editedEmailSubject === null && editedEmailContent === null}
                      >
                        テンプレートに戻す
                      </Button>
                      <Button
                        size="small"
                        variant="outlined"
                        onClick={() => navigator.clipboard.writeText(displayEmailContent)}
                      >
                        本文をコピー
                      </Button>
                      <Button
                        size="small"
                        variant="contained"
                        startIcon={<EmailIcon />}
                        onClick={() => window.location.href = `mailto:${partner.email}?subject=${encodeURIComponent(displayEmailSubject)}&body=${encodeURIComponent(displayEmailContent)}`}
                        sx={{
                          backgroundColor: colors.accent.blue,
                          '&:hover': { backgroundColor: colors.accent.blueHover },
                        }}
                      >
                        メール作成
                      </Button>
                    </Box>
                  </>
                );
              })()}
            </Box>
          )}

          {/* 受信資料タブ */}
          {activeTab === 2 && (
            <Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <PersonIcon sx={{ ...iconStyles.small, color: colors.accent.blue }} />
                  <FormControl size="small">
                    <Select
                      value={receivedDocsAssignee}
                      onChange={(e) => setReceivedDocsAssignee(e.target.value)}
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
                  startIcon={<AddIcon />}
                  sx={{ ...buttonStyles.small, color: colors.accent.blue, fontSize: fontSizes.xs }}
                >
                  ファイルを追加
                </Button>
              </Box>
              {partner.receivedDocuments.length === 0 ? (
                <Typography sx={{ fontSize: fontSizes.sm, color: colors.text.muted, textAlign: 'center', py: 2 }}>受信資料がありません</Typography>
              ) : (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                  {partner.receivedDocuments.map((doc) => (
                    <Box
                      key={doc.id}
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 1,
                        p: 1,
                        borderRadius: borderRadius.xs,
                        backgroundColor: 'rgba(16, 185, 129, 0.05)',
                        border: '1px solid rgba(16, 185, 129, 0.2)',
                      }}
                    >
                      <input
                        type="checkbox"
                        id={`doc-${partner.id}-${doc.id}`}
                        defaultChecked
                        style={{ cursor: 'pointer' }}
                      />
                      <AttachFileIcon sx={{ ...iconStyles.medium, color: colors.status.success.main }} />
                      <Box sx={{ flex: 1 }}>
                        <Typography
                          component="label"
                          htmlFor={`doc-${partner.id}-${doc.id}`}
                          sx={{ fontSize: fontSizes.sm, color: colors.text.secondary, cursor: 'pointer', display: 'block' }}
                        >
                          {doc.name}
                        </Typography>
                        <Typography sx={{ fontSize: fontSizes.xs, color: colors.text.muted }}>
                          受信日: {doc.date}
                        </Typography>
                      </Box>
                      <IconButton size="small">
                        <DeleteIcon sx={{ ...iconStyles.small, color: colors.text.light, '&:hover': { color: colors.status.error.main } }} />
                      </IconButton>
                    </Box>
                  ))}
                </Box>
              )}
            </Box>
          )}

          {/* 文字起こしタブ */}
          {activeTab === 3 && (
            <Box>
              {partner.transcriptions.length === 0 ? (
                <Typography sx={{ fontSize: fontSizes.md, color: colors.text.muted, textAlign: 'center', py: 2 }}>文字起こしデータなし</Typography>
              ) : (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, maxHeight: 200, overflow: 'auto' }}>
                  {partner.transcriptions.map((trans) => (
                    <Box key={trans.id} sx={{ p: 1.5, backgroundColor: 'rgba(37, 99, 235, 0.05)', borderRadius: borderRadius.xs, border: '1px solid rgba(37, 99, 235, 0.15)' }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
                        <MicIcon sx={{ ...iconStyles.small, color: colors.accent.blue }} />
                        <Typography sx={{ fontSize: fontSizes.sm, color: colors.text.muted }}>{trans.date}</Typography>
                      </Box>
                      <Typography sx={{ fontSize: fontSizes.md, fontStyle: 'italic', color: colors.text.secondary }}>{trans.content}</Typography>
                    </Box>
                  ))}
                </Box>
              )}
            </Box>
          )}
        </Box>
      </Collapse>
    </Paper>
  );
}

// ============================================================================
// Props
// ============================================================================

interface PartnerSectionProps {
  evaluation?: import('../../../types').BidEvaluation;
  partners: Partner[];
  onPartnersChange: (partners: Partner[]) => void;
  /** ワークフロー（協力会社タブ）の担当者ID */
  workflowAssigneeId?: string;
}

// ============================================================================
// メインコンポーネント
// ============================================================================

export function PartnerSection({ evaluation, partners, onPartnersChange, workflowAssigneeId }: PartnerSectionProps) {
  const { staff, findById } = useStaffDirectory();
  // 案件・自社情報をevaluationから取得
  const projectName = evaluation?.announcement?.title || '（案件名）';
  const companyName = evaluation?.company?.name || '（自社名）';
  // 自社担当者は仮で設定（実際はログインユーザー情報などから取得）
  const myName = '営業担当';

  // 展開状態
  const [expandedPartnerId, setExpandedPartnerId] = useState<string | null>(null);

  // 送付資料
  const [documents] = useState<PartnerDocument[]>([
    { id: '1', name: '見積依頼書', type: 'sent', date: '2024/01/15' },
  ]);

  // 送付資料の担当者
  const [sentDocsAssignee, setSentDocsAssignee] = useState<string>('');

  // ワークフロー担当者が変更されたら、空の担当者欄を自動で埋める
  useEffect(() => {
    if (!workflowAssigneeId) return;
    setSentDocsAssignee((prev) => (prev === '' ? workflowAssigneeId : prev));
  }, [workflowAssigneeId]);

  // フィルター状態
  const [selectedStatuses, setSelectedStatuses] = useState<PartnerStatus[]>([
    'not_called', 'waiting_documents', 'waiting_response', 'estimate_in_progress', 'estimate_completed', 'estimate_adopted',
  ]);
  const [showUnavailable, setShowUnavailable] = useState(false);

  // コールバック
  const changeStatus = useCallback((id: string, newStatus: PartnerStatus) => {
    onPartnersChange(partners.map((p) => p.id === id ? { ...p, status: newStatus } : p));
  }, [partners, onPartnersChange]);

  const toggleSurvey = useCallback((id: string) => {
    onPartnersChange(partners.map((p) => p.id === id ? { ...p, surveyApproved: !p.surveyApproved } : p));
  }, [partners, onPartnersChange]);

  // フィルター + ソート
  const filteredAndSortedPartners = useMemo(() => {
    const filtered = partners.filter((p) => {
      if (p.status === 'unavailable') return showUnavailable;
      return selectedStatuses.includes(p.status);
    });
    return filtered.sort((a, b) => partnerStatusPriority[a.status] - partnerStatusPriority[b.status]);
  }, [partners, selectedStatuses, showUnavailable]);

  const toggleStatus = (status: PartnerStatus) => {
    setSelectedStatuses((prev) => prev.includes(status) ? prev.filter((s) => s !== status) : [...prev, status]);
  };

  return (
    <Box sx={sectionStyles.container}>
      {/* 候補者リストセクション */}
      <Box>
        {/* ヘッダー */}
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
          <Typography sx={{ ...sectionStyles.title, mb: 0 }}>
            <BusinessIcon sx={{ ...iconStyles.medium, color: colors.text.muted }} />
            候補者リスト ({filteredAndSortedPartners.length}社)
          </Typography>
          <Button size="small" startIcon={<AddIcon />} sx={{ ...buttonStyles.small, color: colors.accent.blue }}>
            追加
          </Button>
        </Box>

        {/* フィルター */}
        <FilterChips
          selectedStatuses={selectedStatuses}
          showUnavailable={showUnavailable}
          onToggleStatus={toggleStatus}
          onToggleShowUnavailable={() => setShowUnavailable(!showUnavailable)}
        />

        {/* リスト */}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        {filteredAndSortedPartners.map((partner) => (
          <PartnerCard
            key={partner.id}
            partner={partner}
            isExpanded={expandedPartnerId === partner.id}
            onToggleExpand={() => setExpandedPartnerId(expandedPartnerId === partner.id ? null : partner.id)}
            onStatusChange={(s) => changeStatus(partner.id, s)}
            onToggleSurvey={() => toggleSurvey(partner.id)}
            projectName={projectName}
            companyName={companyName}
            myName={myName}
            workflowAssigneeId={workflowAssigneeId}
          />
        ))}
        </Box>
      </Box>

      {/* 送付資料セクション */}
      <Box>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
          <Typography sx={sectionStyles.title}>
            <AttachFileIcon sx={{ ...iconStyles.medium, color: colors.accent.blue }} />
            送付資料
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <PersonIcon sx={{ ...iconStyles.small, color: colors.accent.blue }} />
              <FormControl size="small">
                <Select
                  value={sentDocsAssignee}
                  onChange={(e) => setSentDocsAssignee(e.target.value)}
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
              startIcon={<AddIcon />}
              sx={{ ...buttonStyles.small, color: colors.accent.blue, fontSize: fontSizes.xs }}
            >
              ファイルを追加
            </Button>
          </Box>
        </Box>

        {(() => {
          const sentDocs = documents.filter((d: PartnerDocument) => d.type === 'sent');
          return (
            <>
              {sentDocs.length > 0 ? (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                  {sentDocs.map((doc: PartnerDocument) => (
                    <Box
                      key={doc.id}
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 1,
                        p: 1,
                        borderRadius: borderRadius.xs,
                        backgroundColor: 'rgba(59, 130, 246, 0.05)',
                        border: '1px solid rgba(59, 130, 246, 0.2)',
                      }}
                    >
                      <input
                        type="checkbox"
                        id={`sent-doc-${doc.id}`}
                        defaultChecked
                        style={{ cursor: 'pointer' }}
                      />
                      <AttachFileIcon sx={{ ...iconStyles.medium, color: colors.accent.blue }} />
                      <Box sx={{ flex: 1 }}>
                        <Typography
                          component="label"
                          htmlFor={`sent-doc-${doc.id}`}
                          sx={{ fontSize: fontSizes.sm, color: colors.text.secondary, cursor: 'pointer', display: 'block' }}
                        >
                          {doc.name}
                        </Typography>
                        <Typography sx={{ fontSize: fontSizes.xs, color: colors.text.muted }}>
                          送付日: {doc.date}
                        </Typography>
                      </Box>
                      <IconButton size="small">
                        <DeleteIcon sx={{ ...iconStyles.small, color: colors.text.light, '&:hover': { color: colors.status.error.main } }} />
                      </IconButton>
                    </Box>
                  ))}
                </Box>
              ) : (
                <Typography sx={{ fontSize: fontSizes.sm, color: colors.text.light }}>
                  送付資料がありません
                </Typography>
              )}
            </>
          );
        })()}
      </Box>
    </Box>
  );
}
