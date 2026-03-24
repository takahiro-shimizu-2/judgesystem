/**
 * DocumentsSection - 提出書類関連のUI・ロジック
 * メールテンプレート・文章編集、提出書類のアップロード・ダウンロード・削除を含む
 */
import { useRef, useState } from 'react';
import {
  Box,
  Typography,
  Button,
  Chip,
  TextField,
  IconButton,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Select,
  MenuItem,
  FormControl,
} from '@mui/material';
import {
  AttachFile as AttachFileIcon,
  Upload as UploadIcon,
  Delete as DeleteIcon,
  Email as EmailIcon,
  ExpandMore as ExpandMoreIcon,
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
import type { OrdererWorkflowState } from '../../../types';
import type { Staff } from '../../../types';
import { PersonIcon } from '../../../constants/icons';
import {
  createId,
  formatTimestamp,
  readFileAsDataUrl,
  triggerDownload,
} from './ordererWorkflowUtils';

interface EmailTemplate {
  id: string;
  label: string;
  subject: string;
  body: string;
}

export interface DocumentsSectionProps {
  workflowState: OrdererWorkflowState;
  persistWorkflowState: (updater: (prev: OrdererWorkflowState) => OrdererWorkflowState) => Promise<boolean>;
  setWorkflowError: (error: string | null) => void;
  emailTemplates: EmailTemplate[];
  staff: Staff[];
  findById: (id: string) => Staff | undefined;
  emailAssignees: Record<string, string>;
  onEmailAssigneeChange: (templateId: string, staffId: string) => void;
  docsAssignee: string;
  onDocsAssigneeChange: (staffId: string) => void;
}

export function DocumentsSection({
  workflowState,
  persistWorkflowState,
  setWorkflowError,
  emailTemplates,
  staff,
  findById,
  emailAssignees,
  onEmailAssigneeChange,
  docsAssignee,
  onDocsAssigneeChange,
}: DocumentsSectionProps) {
  const docsInputRef = useRef<HTMLInputElement>(null);
  const [textAccordionOpen, setTextAccordionOpen] = useState(true);
  const [docsAccordionOpen, setDocsAccordionOpen] = useState(true);
  const [selectedTemplate, setSelectedTemplate] = useState<string>('1');
  const [editSubject, setEditSubject] = useState(emailTemplates[0]?.subject || '');
  const [editBody, setEditBody] = useState(emailTemplates[0]?.body || '');

  const selectEmailTemplate = (templateId: string) => {
    const template = emailTemplates.find((item) => item.id === templateId);
    setSelectedTemplate(templateId);
    setEditSubject(template?.subject || '');
    setEditBody(template?.body || '');
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

  return (
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
                  onChange={(event) => onEmailAssigneeChange(selectedTemplate, event.target.value)}
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
                  onChange={(event) => onDocsAssigneeChange(event.target.value)}
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
}
