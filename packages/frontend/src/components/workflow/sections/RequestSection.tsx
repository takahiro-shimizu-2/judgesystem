/**
 * 依頼セクション
 * 依頼元企業・協力会社への連絡メール機能を提供
 * 入札書確認依頼時に入札書のアップロードが可能
 */
import { useState, useRef, useEffect } from 'react';
import {
  Box,
  Typography,
  Button,
  Chip,
  TextField,
  IconButton,
  Select,
  MenuItem,
  FormControl,
} from '@mui/material';
import {
  Email as EmailIcon,
  Business as BusinessIcon,
  Groups as GroupsIcon,
  Phone as PhoneIcon,
  CloudUpload as UploadIcon,
  AttachFile as AttachFileIcon,
  Download as DownloadIcon,
  Delete as DeleteIcon,
  Info as InfoIcon,
} from '@mui/icons-material';
import {
  colors,
  fontSizes,
  borderRadius,
  sectionStyles,
  iconStyles,
  chipStyles,
  staffSelectStyles,
} from '../../../constants/styles';
import {
  requestEmailTemplates,
  replacePlaceholders,
} from '../../../constants/emailTemplates';
import { findCompanyById } from '../../../data/companies';
import { PersonIcon } from '../../../constants/icons';
import type { Partner, BidEvaluation } from '../../../types';
import { useStaffDirectory } from '../../../contexts/StaffContext';

// ============================================================================
// 型定義
// ============================================================================

export interface RequestSectionProps {
  evaluation?: BidEvaluation;
  partners?: Partner[];
  /** ワークフロー（確認依頼タブ）の担当者ID */
  workflowAssigneeId?: string;
}

// 送信先カテゴリ
type RecipientCategory = 'requester' | 'partner';

// アップロードされた入札書
interface UploadedBidDocument {
  name: string;
  uploadedAt: string;
}

// ============================================================================
// スタイル定数
// ============================================================================

const STYLES = {
  infoRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 0.5,
    color: colors.text.muted,
  },
  uploadBox: {
    border: `2px dashed ${colors.border.main}`,
    borderRadius: borderRadius.xs,
    p: 4,
    textAlign: 'center',
    cursor: 'pointer',
    backgroundColor: colors.text.white,
    transition: 'border-color 0.2s, background-color 0.2s',
    '&:hover': {
      borderColor: colors.accent.blue,
      backgroundColor: 'rgba(59, 130, 246, 0.05)',
    },
  },
  fileBox: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    p: 2,
    backgroundColor: colors.text.white,
    borderRadius: borderRadius.xs,
    border: `1px solid ${colors.border.main}`,
    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)',
  },
} as const;

// ============================================================================
// コンポーネント
// ============================================================================

export function RequestSection({ evaluation, partners = [], workflowAssigneeId }: RequestSectionProps) {
  const { staff, findById } = useStaffDirectory();
  // 入札書アップロード状態
  const [uploadedBid, setUploadedBid] = useState<UploadedBidDocument | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // メール関連状態
  const [recipientCategory, setRecipientCategory] = useState<RecipientCategory>('requester');
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('estimate-confirmation');
  const [selectedPartnerId, setSelectedPartnerId] = useState<string | null>(null);
  const [editedSubject, setEditedSubject] = useState<string | null>(null);
  const [editedBody, setEditedBody] = useState<string | null>(null);

  // 送信先カテゴリ×テンプレートごとの担当者 (key: `${category}-${templateId}`)
  const [templateAssignees, setTemplateAssignees] = useState<Record<string, string>>({});
  const getAssigneeKey = (category: RecipientCategory, templateId: string) => `${category}-${templateId}`;
  const handleTemplateAssigneeChange = (staffId: string) => {
    const key = getAssigneeKey(recipientCategory, selectedTemplateId);
    setTemplateAssignees((prev) => ({ ...prev, [key]: staffId }));
  };
  const currentAssignee = templateAssignees[getAssigneeKey(recipientCategory, selectedTemplateId)] || '';

  // ワークフロー担当者が変更されたら、空の担当者欄を自動で埋める
  useEffect(() => {
    if (!workflowAssigneeId) return;

    // すべての送信先カテゴリ×テンプレートの組み合わせの空のところを更新
    const categories: RecipientCategory[] = ['requester', 'partner'];
    const templateIds = requestEmailTemplates.map(t => t.id);

    setTemplateAssignees((prev) => {
      const updated = { ...prev };
      categories.forEach((category) => {
        templateIds.forEach((templateId) => {
          const key = getAssigneeKey(category, templateId);
          if (!updated[key]) {
            updated[key] = workflowAssigneeId;
          }
        });
      });
      return updated;
    });
  }, [workflowAssigneeId]);

  // 案件・企業情報
  const projectName = evaluation?.announcement?.title || '';
  const requesterCompany = evaluation?.company;
  // 依頼元企業の詳細情報を取得
  const requesterCompanyDetails = requesterCompany ? findCompanyById(requesterCompany.id) : undefined;
  // 自社情報（実際はログイン企業情報から取得）
  const myCompanyName = '株式会社サンプル建設';
  const myName = '田中一郎';

  // 見積採用した協力会社
  const adoptedPartners = partners.filter(p => p.status === 'estimate_adopted');
  // 見積書受領のみの協力会社（採用されなかった）
  const nonAdoptedPartners = partners.filter(p => p.status === 'estimate_completed');

  // ファイルアップロード処理
  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const now = new Date();
      const dateStr = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}/${String(now.getDate()).padStart(2, '0')}`;
      setUploadedBid({
        name: file.name,
        uploadedAt: dateStr,
      });
    }
  };

  const handleRemoveFile = () => {
    setUploadedBid(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // テンプレートフィルター
  const getFilteredTemplates = () => {
    if (recipientCategory === 'requester') {
      return requestEmailTemplates.filter(t => t.recipientType === 'requester');
    } else {
      return requestEmailTemplates.filter(t =>
        t.recipientType === 'adopted_partner' || t.recipientType === 'non_adopted_partner'
      );
    }
  };

  // 送信先企業リスト
  const getRecipientList = () => {
    if (recipientCategory === 'requester') {
      return requesterCompany ? [{
        id: 'requester',
        name: requesterCompany.name,
        contactPerson: requesterCompanyDetails?.representative || '担当者',
        email: requesterCompanyDetails?.email || '',
        phone: requesterCompanyDetails?.phone || '',
        type: 'requester' as const,
      }] : [];
    } else {
      const selectedTemplate = requestEmailTemplates.find(t => t.id === selectedTemplateId);
      if (selectedTemplate?.recipientType === 'adopted_partner') {
        return adoptedPartners.map(p => ({
          id: p.id,
          name: p.name,
          contactPerson: p.contactPerson,
          email: p.email,
          phone: p.phone,
          type: 'adopted_partner' as const,
        }));
      } else {
        return nonAdoptedPartners.map(p => ({
          id: p.id,
          name: p.name,
          contactPerson: p.contactPerson,
          email: p.email,
          phone: p.phone,
          type: 'non_adopted_partner' as const,
        }));
      }
    }
  };

  const filteredTemplates = getFilteredTemplates();
  const recipientList = getRecipientList();
  const selectedRecipient = recipientList.find(r => r.id === selectedPartnerId);
  const selectedTemplate = requestEmailTemplates.find(t => t.id === selectedTemplateId);

  // 表示用テキスト（実際の値で置換済み）
  const getDisplayTexts = () => {
    if (!selectedTemplate) {
      return { subject: '', body: '' };
    }

    // 利用可能な情報は常に置換（送信先が選択されていなくても）
    const data: Record<string, string> = {
      '案件名': projectName,
      '自社名': myCompanyName,
      '自社担当者': myName,
      '企業名': selectedRecipient?.name || requesterCompany?.name || '',
      '担当者名': selectedRecipient?.contactPerson || requesterCompanyDetails?.representative || '',
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
    setSelectedPartnerId(null);
    setEditedSubject(null);
    setEditedBody(null);
    const templates = category === 'requester'
      ? requestEmailTemplates.filter(t => t.recipientType === 'requester')
      : requestEmailTemplates.filter(t => t.recipientType === 'adopted_partner' || t.recipientType === 'non_adopted_partner');
    if (templates.length > 0) {
      setSelectedTemplateId(templates[0].id);
    }
  };

  const handleTemplateSelect = (templateId: string) => {
    setSelectedTemplateId(templateId);
    setSelectedPartnerId(null);
    setEditedSubject(null);
    setEditedBody(null);
  };

  const handleRecipientSelect = (recipientId: string) => {
    setSelectedPartnerId(recipientId);
    setEditedSubject(null);
    setEditedBody(null);
  };

  const resetToTemplate = () => {
    setEditedSubject(null);
    setEditedBody(null);
  };

  // 入札書確認依頼テンプレートが選択されているかどうか
  const isBidConfirmationSelected = selectedTemplateId === 'bid-confirmation';

  // ============================================================================
  // 入札書アップロードセクション（入札書確認依頼選択時のみ表示）
  // ============================================================================
  const renderBidUploadSection = () => (
    <Box sx={{
      mb: 3,
      p: 2,
      backgroundColor: 'rgba(59, 130, 246, 0.05)',
      borderRadius: borderRadius.xs,
      border: `1px solid ${colors.accent.blue}`,
    }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
        <AttachFileIcon sx={{ ...iconStyles.medium, color: colors.accent.blue }} />
        <Typography sx={{ fontSize: fontSizes.sm, fontWeight: 600, color: colors.accent.blue }}>
          入札書を添付
        </Typography>
      </Box>

      {uploadedBid ? (
        <>
          <Box sx={STYLES.fileBox}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <AttachFileIcon sx={{ ...iconStyles.medium, color: colors.accent.blue }} />
              <Box>
                <Typography sx={{ fontSize: fontSizes.sm, fontWeight: 500, color: colors.text.secondary }}>
                  {uploadedBid.name}
                </Typography>
                <Typography sx={{ fontSize: fontSizes.xs, color: colors.text.muted }}>
                  アップロード日: {uploadedBid.uploadedAt}
                </Typography>
              </Box>
            </Box>
            <Box sx={{ display: 'flex', gap: 0.5 }}>
              <IconButton size="small">
                <DownloadIcon sx={{ ...iconStyles.medium, color: colors.accent.blue }} />
              </IconButton>
              <IconButton size="small" onClick={handleRemoveFile}>
                <DeleteIcon sx={{ ...iconStyles.medium, color: colors.status.error.main }} />
              </IconButton>
            </Box>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 0.5, mt: 1.5, color: colors.text.muted }}>
            <InfoIcon sx={{ ...iconStyles.small, mt: 0.2 }} />
            <Typography sx={{ fontSize: fontSizes.xs }}>
              mailto:は添付に対応していません。ファイルをダウンロードして手動で添付してください。
            </Typography>
          </Box>
        </>
      ) : (
        <Box
          sx={{
            ...STYLES.uploadBox,
            p: 2.5,
            border: `1px dashed ${colors.border.main}`,
          }}
          onClick={() => fileInputRef.current?.click()}
        >
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileUpload}
            style={{ display: 'none' }}
            accept=".pdf,.doc,.docx"
          />
          <UploadIcon sx={{ ...iconStyles.large, color: colors.text.light, mb: 0.5 }} />
          <Typography sx={{ fontSize: fontSizes.sm, color: colors.text.muted }}>
            クリックしてファイルを選択
          </Typography>
          <Typography sx={{ fontSize: fontSizes.xs, color: colors.text.light }}>
            PDF, DOC, DOCX形式
          </Typography>
        </Box>
      )}
    </Box>
  );

  // ============================================================================
  // メールUI
  // ============================================================================
  const renderEmailContent = () => (
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
        <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
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
            label="協力会社"
            size="small"
            onClick={() => handleCategoryChange('partner')}
            sx={{
              ...chipStyles.medium,
              fontWeight: recipientCategory === 'partner' ? 600 : 400,
              backgroundColor: recipientCategory === 'partner' ? colors.accent.greenBg : 'transparent',
              color: recipientCategory === 'partner' ? colors.status.success.main : colors.text.muted,
              border: `1px solid ${recipientCategory === 'partner' ? colors.status.success.main : colors.border.main}`,
              cursor: 'pointer',
              '& .MuiChip-icon': {
                color: recipientCategory === 'partner' ? colors.status.success.main : colors.text.muted,
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
                backgroundColor: selectedTemplateId === template.id ? colors.accent.blueBg : 'transparent',
                color: selectedTemplateId === template.id ? colors.accent.blue : colors.text.muted,
                border: `1px solid ${selectedTemplateId === template.id ? colors.accent.blue : colors.border.main}`,
                cursor: 'pointer',
                '& .MuiChip-icon': {
                  color: selectedTemplateId === template.id ? colors.accent.blue : colors.text.muted,
                },
              }}
            />
          ))}
        </Box>

        {/* 入札書アップロード（入札書確認依頼選択時のみ） */}
        {isBidConfirmationSelected && renderBidUploadSection()}

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
                  fontWeight: selectedPartnerId === recipient.id ? 600 : 400,
                  backgroundColor: selectedPartnerId === recipient.id ? colors.accent.blueBg : 'transparent',
                  color: selectedPartnerId === recipient.id ? colors.accent.blue : colors.text.muted,
                  border: `1px solid ${selectedPartnerId === recipient.id ? colors.accent.blue : colors.border.main}`,
                  cursor: 'pointer',
                }}
              />
            ))
          ) : (
            <Typography sx={{ fontSize: fontSizes.sm, color: colors.text.light }}>
              {recipientCategory === 'partner' ? '該当する協力会社がありません' : '依頼元企業が設定されていません'}
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

  // ============================================================================
  // メインレンダリング
  // ============================================================================
  return (
    <Box sx={sectionStyles.container}>
      {renderEmailContent()}
    </Box>
  );
}
