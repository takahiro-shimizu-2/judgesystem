/**
 * 依頼元企業セクション
 * 企業情報、依頼状況、メモを表示
 */
import { useState } from 'react';
import {
  Box,
  Typography,
  Divider,
  Button,
  Chip,
  Paper,
  Avatar,
  TextField,
  IconButton,
} from '@mui/material';
import {
  Business as BusinessIcon,
  LocationOn as LocationOnIcon,
  Description as DescriptionIcon,
  Upload as UploadIcon,
  Download as DownloadIcon,
  Send as SendIcon,
  Check as CheckIcon,
  Schedule as ScheduleIcon,
  Edit as EditIcon,
} from '@mui/icons-material';
import {
  colors,
  fontSizes,
  borderRadius,
  sectionStyles,
  statusColors,
  avatarStyles,
  chipStyles,
  buttonStyles,
  iconStyles,
} from '../../../constants/styles';
import type { Company, Branch, RequestDocument } from '../../../types';

// ============================================================================
// 型定義
// ============================================================================

export interface ClientSectionProps {
  company: Company;
  branch: Branch;
}

// ============================================================================
// スタイル定数
// ============================================================================

const STYLES = {
  companyCard: {
    p: 2.5,
    backgroundColor: colors.text.white,
    borderRadius: borderRadius.xs,
    border: `1px solid ${colors.border.main}`,
    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)',
  },
  requestCard: {
    p: 2,
    borderRadius: borderRadius.xs,
    border: `1px solid ${colors.border.main}`,
    transition: 'border-color 0.2s',
    '&:hover': { borderColor: colors.border.dark },
  },
  typeIcon: {
    width: 36,
    height: 36,
    borderRadius: borderRadius.xs,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(30, 58, 95, 0.1)',
    color: colors.primary.main,
    fontWeight: 700,
    fontSize: fontSizes.md,
  },
} as const;

const STATUS_ICONS: Record<string, React.ComponentType<{ sx?: object }>> = {
  submitted: CheckIcon,
  approved: CheckIcon,
  reviewing: ScheduleIcon,
  draft: EditIcon,
  pending: ScheduleIcon,
  uploaded: CheckIcon,
};

// ============================================================================
// ヘルパー関数
// ============================================================================

const getStatusInfo = (status: RequestDocument['status']) => {
  const info = statusColors.document[status] || statusColors.document.pending;
  const IconComponent = STATUS_ICONS[status] || ScheduleIcon;
  return { ...info, icon: IconComponent };
};

const getTypeIcon = (type: RequestDocument['type']): string => {
  const icons: Record<string, string> = { estimate: '¥', bid: '札', result: '報' };
  return icons[type] || '?';
};

// ============================================================================
// コンポーネント
// ============================================================================

export function ClientSection({ company, branch }: ClientSectionProps) {
  const [requests] = useState<RequestDocument[]>([
    { id: '1', type: 'estimate', name: '見積書', status: 'reviewing', dueDate: '2024/01/25', updatedAt: '2024/01/20' },
    { id: '2', type: 'bid', name: '入札書', status: 'pending', dueDate: '2024/01/30' },
    { id: '3', type: 'result', name: '結果報告', status: 'pending' },
  ]);
  const [memo, setMemo] = useState('');

  return (
    <Box sx={sectionStyles.container}>
      {/* 企業情報 */}
      <Box>
        <Typography sx={sectionStyles.title}>
          <BusinessIcon sx={{ ...iconStyles.medium, color: colors.text.muted }} />
          企業情報
        </Typography>

        <Paper elevation={0} sx={STYLES.companyCard}>
          <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2 }}>
            <Avatar sx={{ ...avatarStyles.large, ...avatarStyles.primary }}>
              <BusinessIcon />
            </Avatar>
            <Box sx={{ flex: 1 }}>
              <Typography sx={{ fontSize: fontSizes.lg, fontWeight: 700, color: colors.text.secondary, mb: 0.5 }}>
                {company.name}
              </Typography>
              <Chip
                size="small"
                label={branch.name}
                sx={{
                  ...chipStyles.small,
                  backgroundColor: colors.accent.blueBg,
                  color: colors.accent.blue,
                  mb: 1.5,
                }}
              />
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
                <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 0.75 }}>
                  <LocationOnIcon sx={{ ...iconStyles.small, color: colors.text.muted, mt: 0.25 }} />
                  <Typography sx={{ fontSize: fontSizes.sm, color: colors.text.muted }}>
                    {company.address}
                  </Typography>
                </Box>
                <Chip
                  size="small"
                  label={`等級: ${company.grade}`}
                  sx={{
                    height: 20,
                    fontSize: fontSizes.xs,
                    backgroundColor: 'rgba(148, 163, 184, 0.15)',
                    color: colors.text.muted,
                  }}
                />
              </Box>
            </Box>
          </Box>
        </Paper>
      </Box>

      <Divider />

      {/* 依頼 */}
      <Box>
        <Typography sx={sectionStyles.title}>
          <DescriptionIcon sx={{ ...iconStyles.medium, color: colors.text.muted }} />
          依頼
        </Typography>

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {requests.map((request) => {
            const statusInfo = getStatusInfo(request.status);
            const StatusIcon = statusInfo.icon;

            return (
              <Paper key={request.id} elevation={0} sx={STYLES.requestCard}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    <Box sx={STYLES.typeIcon}>{getTypeIcon(request.type)}</Box>
                    <Box>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Typography sx={{ fontSize: fontSizes.md, fontWeight: 600, color: colors.text.secondary }}>
                          {request.name}
                        </Typography>
                        <Chip
                          size="small"
                          icon={<StatusIcon sx={{ fontSize: '14px !important' }} />}
                          label={statusInfo.label}
                          sx={{
                            ...chipStyles.small,
                            backgroundColor: statusInfo.bgColor,
                            color: statusInfo.color,
                            fontWeight: 600,
                            '& .MuiChip-icon': { color: statusInfo.color },
                          }}
                        />
                      </Box>
                      {request.dueDate && (
                        <Typography sx={{ fontSize: fontSizes.xs, color: colors.text.muted, mt: 0.25 }}>
                          期限: {request.dueDate}
                          {request.updatedAt && ` / 更新: ${request.updatedAt}`}
                        </Typography>
                      )}
                    </Box>
                  </Box>

                  {/* アクションボタン */}
                  <Box sx={{ display: 'flex', gap: 0.5 }}>
                    {request.status === 'pending' && (
                      <Button size="small" variant="outlined" startIcon={<EditIcon />} sx={buttonStyles.action}>
                        作成
                      </Button>
                    )}
                    {(request.status === 'draft' || request.status === 'reviewing') && (
                      <>
                        <IconButton size="small" sx={{ color: colors.text.muted }}>
                          <DownloadIcon fontSize="small" />
                        </IconButton>
                        <IconButton size="small" sx={{ color: colors.text.muted }}>
                          <UploadIcon fontSize="small" />
                        </IconButton>
                      </>
                    )}
                    {request.status === 'approved' && (
                      <Button
                        size="small"
                        variant="contained"
                        startIcon={<SendIcon />}
                        sx={{ ...buttonStyles.small, ...buttonStyles.primary }}
                      >
                        提出
                      </Button>
                    )}
                    {request.status === 'submitted' && (
                      <IconButton size="small" sx={{ color: colors.text.muted }}>
                        <DownloadIcon fontSize="small" />
                      </IconButton>
                    )}
                  </Box>
                </Box>
              </Paper>
            );
          })}
        </Box>
      </Box>

      <Divider />

      {/* メモ */}
      <Box>
        <Typography sx={{ fontSize: fontSizes.sm, fontWeight: 600, color: colors.text.secondary, mb: 1 }}>
          メモ
        </Typography>
        <TextField
          multiline
          rows={3}
          value={memo}
          onChange={(e) => setMemo(e.target.value)}
          placeholder="依頼元企業に関するメモを入力..."
          size="small"
          fullWidth
          sx={sectionStyles.textField}
        />
      </Box>
    </Box>
  );
}
