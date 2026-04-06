/**
 * 落札結果セクション
 * 落札金額、落札会社、参加企業、連絡メール機能を表示
 */
import { useState, useEffect, useMemo } from 'react';
import {
  Box,
  Typography,
  TextField,
  Paper,
  Chip,
  Avatar,
  Button,
  Tabs,
  Tab,
  Select,
  MenuItem,
  FormControl,
} from '@mui/material';
import {
  EmojiEvents as TrophyIcon,
  Email as EmailIcon,
  Phone as PhoneIcon,
  Business as BusinessIcon,
  Groups as GroupsIcon,
} from '@mui/icons-material';
import {
  colors,
  fontSizes,
  borderRadius,
  sectionStyles,
  avatarStyles,
  iconStyles,
  chipStyles,
  staffSelectStyles,
} from '../../../constants/styles';
import {
  awardEmailTemplates,
  replacePlaceholders,
} from '../../../constants/emailTemplates';
import { fetchCompanyList, type CompanyWithDetails } from '../../../data/companies';
import { PersonIcon } from '../../../constants/icons';
import { useStaffDirectory } from '../../../contexts/StaffContext';
import type {
  BidEvaluation,
  CompanyCandidate,
  EmailTemplate,
  CompetingCompany,
  Announcement,
} from '../../../types';

// ============================================================================
// 型定義
// ============================================================================

export interface AwardSectionProps {
  evaluation?: BidEvaluation;
  partners?: CompanyCandidate[];
  /** ワークフロー（落札タブ）の担当者ID */
  workflowAssigneeId?: string;
}

// 参加企業の型（落札結果用）
interface ParticipantCompany {
  id: string;
  name: string;
  contactPerson: string;
  phone: string;
  email: string;
  bidAmount?: number;
  isWinner: boolean;
}

// 送信先カテゴリ
type RecipientCategory = 'requester' | 'adopted_partner';

// ============================================================================
// スタイル定数
// ============================================================================

const STYLES = {
  resultCard: {
    p: 2.5,
    backgroundColor: colors.status.warning.bg,
    borderRadius: borderRadius.xs,
    border: `1px solid ${colors.status.warning.border}`,
  },
  participantCard: {
    p: 1.5,
    borderRadius: borderRadius.xs,
    border: `1px solid ${colors.border.main}`,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  emptyState: {
    p: 3,
    backgroundColor: colors.text.white,
    borderRadius: borderRadius.xs,
    border: `1px dashed ${colors.border.main}`,
    textAlign: 'center',
  },
  infoRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 0.5,
    color: colors.text.muted,
  },
} as const;

const AWARD_COLORS = {
  main: colors.status.warning.main,
  light: '#b45309',
  dark: '#92400e',
  bg: 'rgba(217, 119, 6, 0.15)',
} as const;

// ============================================================================
// コンポーネント
// ============================================================================

export function AwardSection({ evaluation, partners = [], workflowAssigneeId }: AwardSectionProps) {
  const { staff, findById } = useStaffDirectory();
  // 案件情報
  const projectName = evaluation?.announcement?.title || '';
  const requesterCompany = evaluation?.company;
  const requesterCompanyId = requesterCompany?.id;
  // 依頼元企業の詳細情報を取得（非同期）
  const [requesterCompanyDetails, setRequesterCompanyDetails] = useState<CompanyWithDetails | undefined>(undefined);

  useEffect(() => {
    if (!requesterCompanyId) return;
    let isMounted = true;
    fetchCompanyList().then((list) => {
      if (isMounted) setRequesterCompanyDetails(list.find(c => c.id === requesterCompanyId));
    });
    return () => { isMounted = false; };
  }, [requesterCompanyId]);

  // 自社情報（実際はログイン企業情報から取得）
  const defaultCompanyName = evaluation?.company?.name || '（自社名）';
  const myCompanyName = defaultCompanyName;
  const myNameFallback = '担当者';

  type AnnouncementWithExtras = Announcement & {
    actualAmount?: number;
    winningCompanyName?: string;
    competingCompanies?: CompetingCompanyCandidate[];
  };

  const announcementExtras = evaluation?.announcement as AnnouncementWithExtras | undefined;

  const competingCompanies = useMemo(
    () => announcementExtras?.competingCompanies ?? [],
    [announcementExtras?.competingCompanies]
  );

  const participants: ParticipantCompanyCandidate[] = useMemo(() => {
    return competingCompanies.map((company: CompetingCompany, index: number) => {
      const bidAmounts = (company.bidAmounts || []).filter(
        (amount): amount is number => typeof amount === 'number'
      );
      const latestBidAmount =
        bidAmounts.length > 0 ? bidAmounts[bidAmounts.length - 1] : undefined;
      return {
        id: `participant-${index}`,
        name: company.name,
        contactPerson: '担当者情報なし',
        phone: '',
        email: '',
        bidAmount: latestBidAmount,
        isWinner: !!company.isWinner,
      };
    });
  }, [competingCompanies]);

  const winner = useMemo<CompetingCompany | undefined>(() => {
    return competingCompanies.find((company: CompetingCompany) => company.isWinner);
  }, [competingCompanies]);

  const awardedCompany = winner?.name || announcementExtras?.winningCompanyName || '';
  const awardedAmount = announcementExtras?.actualAmount;

  // 見積採用した協力会社
  const adoptedPartners = partners.filter(p => p.status === 'estimate_adopted');

  // タブ管理
  const [activeTab, setActiveTab] = useState(0);

  // メール関連状態
  const [recipientCategory, setRecipientCategory] = useState<RecipientCategory>('requester');
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('award-won-requester');
  const [selectedRecipientId, setSelectedRecipientId] = useState<string | null>(null);
  const [editedSubject, setEditedSubject] = useState<string | null>(null);
  const [editedBody, setEditedBody] = useState<string | null>(null);

  // 送信先カテゴリ×テンプレートごとの担当者 (key: `${category}-${templateId}`)
  const [manualTemplateAssignees, setManualTemplateAssignees] = useState<Record<string, string>>({});
  const getAssigneeKey = (category: RecipientCategory, templateId: string) => `${category}-${templateId}`;
  const handleTemplateAssigneeChange = (staffId: string) => {
    const key = getAssigneeKey(recipientCategory, selectedTemplateId);
    setManualTemplateAssignees((prev) => ({ ...prev, [key]: staffId }));
  };
  const templateAssignees = useMemo(() => {
    const categories: RecipientCategory[] = ['requester', 'adopted_partner'];
    const templateIds = awardEmailTemplates.map(t => t.id);
    const filled = { ...manualTemplateAssignees };
    if (workflowAssigneeId) {
      categories.forEach((category) => {
        templateIds.forEach((templateId) => {
          const key = getAssigneeKey(category, templateId);
          if (filled[key] === undefined) {
            filled[key] = workflowAssigneeId;
          }
        });
      });
    }
    return filled;
  }, [manualTemplateAssignees, workflowAssigneeId]);
  const currentAssignee = templateAssignees[getAssigneeKey(recipientCategory, selectedTemplateId)] || '';
  const currentStaffMember = currentAssignee ? findById(currentAssignee) : undefined;
  const myName = currentStaffMember?.name || myNameFallback;
  const effectiveCompanyName = currentStaffMember?.companyName || myCompanyName;

  // テンプレートフィルター
  const getFilteredTemplates = (): EmailTemplate[] => {
    switch (recipientCategory) {
      case 'requester':
        return awardEmailTemplates.filter(t => t.recipientType === 'requester');
      case 'adopted_partner':
        return awardEmailTemplates.filter(t => t.recipientType === 'adopted_partner');
      default:
        return [];
    }
  };

  // 送信先企業リスト
  const getRecipientList = () => {
    switch (recipientCategory) {
      case 'requester':
        return requesterCompany ? [{
          id: 'requester',
          name: requesterCompany.name,
          contactPerson: requesterCompanyDetails?.representative || '担当者',
          email: requesterCompanyDetails?.email || '',
          phone: requesterCompanyDetails?.phone || '',
        }] : [];
      case 'adopted_partner':
        return adoptedPartners.map(p => ({
          id: p.id,
          name: p.name,
          contactPerson: p.contactPerson,
          email: p.email,
          phone: p.phone,
        }));
      default:
        return [];
    }
  };

  const filteredTemplates = getFilteredTemplates();
  const recipientList = getRecipientList();
  const selectedRecipient = recipientList.find(r => r.id === selectedRecipientId);
  const selectedTemplate = awardEmailTemplates.find(t => t.id === selectedTemplateId);

  // 表示用テキスト（実際の値で置換済み）
  const getDisplayTexts = () => {
    if (!selectedTemplate) {
      return { subject: '', body: '' };
    }

    // 利用可能な情報は常に置換（送信先が選択されていなくても）
    const data: Record<string, string> = {
      '案件名': projectName,
      '自社名': effectiveCompanyName,
      '自社担当者': myName,
      '企業名': selectedRecipient?.name || requesterCompany?.name || '',
      '担当者名': selectedRecipient?.contactPerson || requesterCompanyDetails?.representative || '',
      '落札企業': awardedCompany || '',
      '落札金額': awardedAmount != null ? `¥${awardedAmount.toLocaleString()}` : '未定',
    };

    return {
      subject: editedSubject ?? replacePlaceholders(selectedTemplate.subject, data),
      body: editedBody ?? replacePlaceholders(selectedTemplate.body, data),
    };
  };

  const { subject: displaySubject, body: displayBody } = getDisplayTexts();

  // ハンドラー
  const handleCategoryChange = (category: RecipientCategory) => {
    setRecipientCategory(category);
    setSelectedRecipientId(null);
    setEditedSubject(null);
    setEditedBody(null);
    // カテゴリに応じたデフォルトテンプレートを選択
    const templates = category === 'requester'
      ? awardEmailTemplates.filter(t => t.recipientType === 'requester')
      : awardEmailTemplates.filter(t => t.recipientType === 'adopted_partner');
    if (templates.length > 0) {
      setSelectedTemplateId(templates[0].id);
    }
  };

  const handleTemplateSelect = (templateId: string) => {
    setSelectedTemplateId(templateId);
    setEditedSubject(null);
    setEditedBody(null);
  };

  const handleRecipientSelect = (recipientId: string) => {
    setSelectedRecipientId(recipientId);
    setEditedSubject(null);
    setEditedBody(null);
  };

  const resetToTemplate = () => {
    setEditedSubject(null);
    setEditedBody(null);
  };

  const isAwardDecided = Boolean(awardedCompany && awardedAmount != null);

  // 落札結果タブ
  const renderResultTab = () => (
    <Box>
      {/* 落札結果 */}
      {isAwardDecided ? (
        <Paper elevation={0} sx={{ ...STYLES.resultCard, mb: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Avatar
              sx={{
                ...avatarStyles.large,
                backgroundColor: AWARD_COLORS.main,
                color: colors.text.white,
              }}
            >
              <TrophyIcon />
            </Avatar>
            <Box>
              <Typography sx={{ fontSize: fontSizes.xs, color: AWARD_COLORS.light, fontWeight: 500 }}>
                落札企業
              </Typography>
              <Typography sx={{ fontSize: fontSizes.lg, fontWeight: 700, color: AWARD_COLORS.dark }}>
                {awardedCompany}
              </Typography>
              <Typography sx={{ fontSize: fontSizes.xl, fontWeight: 700, color: AWARD_COLORS.main, mt: 0.5 }}>
                {awardedAmount != null ? `¥${awardedAmount.toLocaleString()}` : '金額未定'}
              </Typography>
            </Box>
          </Box>
        </Paper>
      ) : (
        <Box sx={{ ...STYLES.emptyState, mb: 2 }}>
          <Typography sx={{ fontSize: fontSizes.sm, color: colors.text.light }}>
            落札結果は開札後に自動反映されます
          </Typography>
        </Box>
      )}

      {/* 参加企業 */}
      <Box>
        <Typography sx={{ ...sectionStyles.title, mb: 1 }}>
          <GroupsIcon sx={{ ...iconStyles.medium, color: colors.text.muted }} />
          参加企業 ({participants.length}社)
        </Typography>

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {participants.map((participant, index) => (
            <Paper
              key={participant.id}
              elevation={0}
              sx={{
                ...STYLES.participantCard,
                backgroundColor: participant.isWinner ? colors.status.warning.bg : colors.text.white,
                border: participant.isWinner ? `1px solid ${colors.status.warning.border}` : `1px solid ${colors.border.main}`,
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                <Avatar
                  sx={{
                    ...avatarStyles.small,
                    backgroundColor: participant.isWinner ? AWARD_COLORS.main : 'rgba(148, 163, 184, 0.15)',
                    color: participant.isWinner ? colors.text.white : colors.text.muted,
                  }}
                >
                  {participant.isWinner ? <TrophyIcon sx={iconStyles.medium} /> : index + 1}
                </Avatar>
                <Box>
                  <Typography sx={{ fontSize: fontSizes.md, fontWeight: 500, color: colors.text.secondary }}>
                    {participant.name}
                  </Typography>
                  {participant.bidAmount && (
                    <Typography sx={{ fontSize: fontSizes.xs, color: colors.text.muted }}>
                      ¥{participant.bidAmount.toLocaleString()}
                    </Typography>
                  )}
                </Box>
              </Box>
              {participant.isWinner && (
                <Chip
                  size="small"
                  label="落札"
                  sx={{
                    height: 20,
                    fontSize: fontSizes.xs,
                    backgroundColor: AWARD_COLORS.bg,
                    color: AWARD_COLORS.main,
                    fontWeight: 600,
                  }}
                />
              )}
            </Paper>
          ))}
        </Box>

        {participants.length === 0 && (
          <Box sx={STYLES.emptyState}>
            <Typography sx={{ fontSize: fontSizes.sm, color: colors.text.light }}>
              参加企業は開札後に自動反映されます
            </Typography>
          </Box>
        )}
      </Box>
    </Box>
  );

  // 連絡メールタブ
  const renderEmailTab = () => (
    <Box>
      {/* 送信ボタン */}
      <Button
        variant="contained"
        fullWidth
        startIcon={<EmailIcon />}
        disabled={!selectedRecipient}
        onClick={() => {
          if (selectedRecipient) {
            window.location.href = `mailto:${selectedRecipient.email}?subject=${encodeURIComponent(displaySubject)}&body=${encodeURIComponent(displayBody)}`;
          }
        }}
        sx={{
          mb: 2,
          py: 1.5,
          backgroundColor: colors.accent.blue,
          fontWeight: 600,
          fontSize: fontSizes.sm,
          '&:hover': { backgroundColor: colors.accent.blueHover },
          '&.Mui-disabled': { backgroundColor: colors.border.main },
        }}
      >
        メールを送信
      </Button>

      {/* メールフォーム */}
      <Box sx={{ p: 2, backgroundColor: colors.text.white, borderRadius: borderRadius.xs, border: `1px solid ${colors.border.main}` }}>
        {/* 送信先カテゴリ選択 + 担当者 */}
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.5 }}>
          <Typography sx={{ fontSize: fontSizes.xs, color: colors.text.muted }}>
            送信先カテゴリ
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <PersonIcon sx={{ ...iconStyles.small, color: colors.accent.blue }} />
            <FormControl size="small">
              <Select
                value={currentAssignee}
                onChange={(e) => handleTemplateAssigneeChange(e.target.value)}
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
        </Box>
        <Box sx={{ display: 'flex', gap: 1, mb: 2, flexWrap: 'wrap' }}>
          <Chip
            icon={<BusinessIcon sx={iconStyles.small} />}
            label="依頼元企業"
            size="small"
            onClick={() => handleCategoryChange('requester')}
            sx={{
              ...chipStyles.medium,
              fontWeight: recipientCategory === 'requester' ? 600 : 400,
              backgroundColor: recipientCategory === 'requester' ? colors.accent.blueBg : 'transparent',
              color: recipientCategory === 'requester' ? colors.accent.blue : colors.text.muted,
              border: `1px solid ${recipientCategory === 'requester' ? colors.accent.blue : colors.border.main}`,
              cursor: 'pointer',
              '& .MuiChip-icon': {
                color: recipientCategory === 'requester' ? colors.accent.blue : colors.text.muted,
              },
            }}
          />
          <Chip
            icon={<GroupsIcon sx={iconStyles.small} />}
            label="見積採用協力会社"
            size="small"
            onClick={() => handleCategoryChange('adopted_partner')}
            sx={{
              ...chipStyles.medium,
              fontWeight: recipientCategory === 'adopted_partner' ? 600 : 400,
              backgroundColor: recipientCategory === 'adopted_partner' ? colors.accent.greenBg : 'transparent',
              color: recipientCategory === 'adopted_partner' ? colors.status.success.main : colors.text.muted,
              border: `1px solid ${recipientCategory === 'adopted_partner' ? colors.status.success.main : colors.border.main}`,
              cursor: 'pointer',
              '& .MuiChip-icon': {
                color: recipientCategory === 'adopted_partner' ? colors.status.success.main : colors.text.muted,
              },
            }}
          />
        </Box>

        {/* テンプレート選択 */}
        <Typography sx={{ fontSize: fontSizes.xs, color: colors.text.muted, mb: 0.5 }}>
          テンプレート
        </Typography>
        <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mb: 2 }}>
          {filteredTemplates.map((template) => (
            <Chip
              key={template.id}
              label={template.label}
              size="small"
              icon={<EmailIcon sx={iconStyles.small} />}
              onClick={() => handleTemplateSelect(template.id)}
              sx={{
                ...chipStyles.medium,
                fontWeight: selectedTemplateId === template.id ? 600 : 400,
                backgroundColor: selectedTemplateId === template.id
                  ? colors.accent.blueBg
                  : 'transparent',
                color: selectedTemplateId === template.id
                  ? colors.accent.blue
                  : colors.text.muted,
                border: `1px solid ${selectedTemplateId === template.id
                  ? colors.accent.blue
                  : colors.border.main}`,
                cursor: 'pointer',
                '& .MuiChip-icon': {
                  color: selectedTemplateId === template.id
                    ? colors.accent.blue
                    : colors.text.muted,
                },
              }}
            />
          ))}
        </Box>

        {/* 送信先企業選択 */}
        <Typography sx={{ fontSize: fontSizes.xs, color: colors.text.muted, mb: 0.5 }}>
          送信先
        </Typography>
        <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mb: 2 }}>
          {recipientList.length > 0 ? (
            recipientList.map((recipient) => (
              <Chip
                key={recipient.id}
                label={recipient.name}
                size="small"
                onClick={() => handleRecipientSelect(recipient.id)}
                sx={{
                  ...chipStyles.medium,
                  fontWeight: selectedRecipientId === recipient.id ? 600 : 400,
                  backgroundColor: selectedRecipientId === recipient.id
                    ? colors.accent.blueBg
                    : 'transparent',
                  color: selectedRecipientId === recipient.id
                    ? colors.accent.blue
                    : colors.text.muted,
                  border: `1px solid ${selectedRecipientId === recipient.id
                    ? colors.accent.blue
                    : colors.border.main}`,
                  cursor: 'pointer',
                }}
              />
            ))
          ) : (
            <Typography sx={{ fontSize: fontSizes.sm, color: colors.text.light }}>
              {recipientCategory === 'adopted_partner'
                ? '見積採用した協力会社がありません'
                : '依頼元企業が設定されていません'}
            </Typography>
          )}
        </Box>

        {/* 選択中の連絡先 */}
        {selectedRecipient && (
          <Box sx={{ display: 'flex', gap: 2, mb: 2, flexWrap: 'wrap' }}>
            <Box sx={STYLES.infoRow}>
              <PhoneIcon sx={iconStyles.small} />
              <Typography sx={{ fontSize: fontSizes.sm }}>{selectedRecipient.phone}</Typography>
            </Box>
            <Box sx={STYLES.infoRow}>
              <EmailIcon sx={iconStyles.small} />
              <Typography sx={{ fontSize: fontSizes.sm }}>{selectedRecipient.email}</Typography>
            </Box>
          </Box>
        )}

        {/* 件名 */}
        <Box sx={{ mb: 2 }}>
          <Typography sx={{ fontSize: fontSizes.xs, color: colors.text.muted, mb: 0.5 }}>
            件名
          </Typography>
          <TextField
            value={displaySubject}
            onChange={(e) => setEditedSubject(e.target.value)}
            size="small"
            fullWidth
            sx={sectionStyles.textField}
          />
        </Box>

        {/* 本文 */}
        <Box sx={{ mb: 2 }}>
          <Typography sx={{ fontSize: fontSizes.xs, color: colors.text.muted, mb: 0.5 }}>
            本文
          </Typography>
          <TextField
            value={displayBody}
            onChange={(e) => setEditedBody(e.target.value)}
            fullWidth
            multiline
            minRows={12}
            sx={sectionStyles.textField}
          />
        </Box>

        {/* アクションボタン */}
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
          <Button
            size="small"
            onClick={resetToTemplate}
            disabled={editedSubject === null && editedBody === null}
          >
            テンプレートに戻す
          </Button>
          <Button
            size="small"
            variant="outlined"
            onClick={() => navigator.clipboard.writeText(displayBody)}
          >
            本文をコピー
          </Button>
        </Box>
      </Box>
    </Box>
  );

  return (
    <Box>
      {/* タブ */}
      <Tabs
        value={activeTab}
        onChange={(_, newValue) => setActiveTab(newValue)}
        sx={{
          minHeight: 32,
          mb: 2,
          '& .MuiTab-root': { fontSize: fontSizes.sm, minHeight: 32, py: 0.5, textTransform: 'none' },
          '& .MuiTabs-indicator': { backgroundColor: colors.accent.blue },
          '& .Mui-selected': { color: colors.accent.blue },
        }}
      >
        <Tab icon={<TrophyIcon sx={iconStyles.small} />} iconPosition="start" label="落札結果" />
        <Tab icon={<EmailIcon sx={iconStyles.small} />} iconPosition="start" label="連絡メール" />
      </Tabs>

      {/* タブコンテンツ */}
      <Box>
        {activeTab === 0 && renderResultTab()}
        {activeTab === 1 && renderEmailTab()}
      </Box>
    </Box>
  );
}
