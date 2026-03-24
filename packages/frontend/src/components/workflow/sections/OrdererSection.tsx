/**
 * 発注者確認セクション
 * 発注者連絡先、確認事項、事前提出資料を表示
 */
import { useState } from 'react';
import {
  Box,
  Typography,
  Divider,
  Button,
  Chip,
  IconButton,
  Collapse,
  Paper,
} from '@mui/material';
import {
  Add as AddIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
  CheckCircle as CheckCircleIcon,
  RadioButtonUnchecked as UncheckedIcon,
  AttachFile as AttachFileIcon,
  Upload as UploadIcon,
} from '@mui/icons-material';
import {
  colors,
  fontSizes,
  borderRadius,
  sectionStyles,
  statusColors,
  categoryColors,
  chipStyles,
  buttonStyles,
  iconStyles,
} from '../../../constants/styles';
import type { Department, CheckItem, PreSubmitDocument } from '../../../types';
import { ContactInfo } from '../../common/ContactInfo';

// ============================================================================
// 型定義
// ============================================================================

export interface OrdererSectionProps {
  department: Department;
}

type CategoryType = 'frequent' | 'similar' | 'case';

// ============================================================================
// スタイル定数
// ============================================================================

const STYLES = {
  contactCard: {
    p: 2,
    backgroundColor: colors.text.white,
    borderRadius: borderRadius.xs,
    border: `1px solid ${colors.border.main}`,
    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)',
  },
  categoryHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    p: 1.5,
    borderRadius: borderRadius.xs,
    cursor: 'pointer',
    transition: 'background-color 0.2s',
  },
  checkItem: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 1,
    py: 1,
    px: 1,
    cursor: 'pointer',
    borderRadius: borderRadius.xs,
    '&:hover': { backgroundColor: 'rgba(0,0,0,0.02)' },
  },
  documentItem: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    p: 1.5,
    backgroundColor: colors.text.white,
    borderRadius: borderRadius.xs,
    border: `1px solid ${colors.border.main}`,
  },
} as const;

// ============================================================================
// ヘルパー関数
// ============================================================================

const getCategoryLabel = (category: CategoryType): string => {
  return categoryColors.checkItem[category]?.label || category;
};

const getDocumentStatusInfo = (status: PreSubmitDocument['status']) => {
  if (status === 'submitted') {
    return statusColors.document.submitted;
  }
  return { label: '未アップロード', color: colors.text.muted, bgColor: 'rgba(148, 163, 184, 0.15)' };
};

// ============================================================================
// コンポーネント
// ============================================================================

export function OrdererSection({ department }: OrdererSectionProps) {
  const [checkItems, setCheckItems] = useState<CheckItem[]>([
    { id: '1', content: '入札参加資格の有効期限を確認', checked: false, category: 'frequent' },
    { id: '2', content: '保証金の要否を確認', checked: false, category: 'frequent' },
    { id: '3', content: '類似工事の実績要件を満たしているか', checked: false, category: 'similar' },
    { id: '4', content: '配置予定技術者の資格確認', checked: false, category: 'case' },
  ]);

  const [documents] = useState<PreSubmitDocument[]>([
    { id: '1', name: '競争参加資格確認申請書', status: 'pending' },
    { id: '2', name: '技術資料', status: 'pending' },
    { id: '3', name: '工事実績調書', status: 'pending' },
  ]);

  const [expandedCategories, setExpandedCategories] = useState<Record<CategoryType, boolean>>({
    frequent: true,
    similar: false,
    case: false,
  });

  const toggleCategory = (category: CategoryType) => {
    setExpandedCategories((prev) => ({ ...prev, [category]: !prev[category] }));
  };

  const toggleCheckItem = (id: string) => {
    setCheckItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, checked: !item.checked } : item))
    );
  };

  const getItemsByCategory = (category: CategoryType) =>
    checkItems.filter((item) => item.category === category);

  const getCheckedCount = (category: CategoryType) => {
    const items = getItemsByCategory(category);
    return { checked: items.filter((i) => i.checked).length, total: items.length };
  };

  return (
    <Box sx={sectionStyles.container}>
      {/* 発注者連絡先 */}
      <Box>
        <Typography sx={sectionStyles.title}>発注者連絡先</Typography>
        <Paper elevation={0} sx={STYLES.contactCard}>
          <Typography sx={{ fontSize: fontSizes.md, fontWeight: 600, color: colors.text.secondary, mb: 1 }}>
            {department.name}
          </Typography>
          <Typography sx={{ fontSize: fontSizes.sm, color: colors.text.muted, mb: 0.5 }}>
            {department.contactPerson}
          </Typography>
          <Box sx={{ mt: 1 }}>
            <ContactInfo
              phone={department.phone}
              email={department.email}
              layout="column"
              iconSize={14}
            />
          </Box>
        </Paper>
      </Box>

      <Divider />

      {/* 発注者確認事項 */}
      <Box>
        <Typography sx={sectionStyles.title}>発注者確認事項</Typography>

        {(['frequent', 'similar', 'case'] as const).map((category) => {
          const { checked, total } = getCheckedCount(category);
          const items = getItemsByCategory(category);
          const isExpanded = expandedCategories[category];
          const isComplete = checked === total && total > 0;

          return (
            <Box key={category} sx={{ mb: 1.5 }}>
              <Box
                onClick={() => toggleCategory(category)}
                sx={{
                  ...STYLES.categoryHeader,
                  backgroundColor: isExpanded ? 'rgba(59, 130, 246, 0.05)' : colors.text.white,
                  '&:hover': { backgroundColor: 'rgba(59, 130, 246, 0.08)' },
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Typography sx={{ fontSize: fontSizes.sm, fontWeight: 500, color: colors.text.secondary }}>
                    {getCategoryLabel(category)}
                  </Typography>
                  <Chip
                    size="small"
                    label={`${checked}/${total}`}
                    sx={{
                      height: 20,
                      fontSize: fontSizes.xs,
                      backgroundColor: isComplete ? 'rgba(5, 150, 105, 0.15)' : 'rgba(148, 163, 184, 0.15)',
                      color: isComplete ? colors.status.success.main : colors.text.muted,
                    }}
                  />
                </Box>
                <IconButton size="small" sx={{ p: 0.5 }}>
                  {isExpanded ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
                </IconButton>
              </Box>

              <Collapse in={isExpanded}>
                <Box sx={{ pl: 1, pt: 1 }}>
                  {items.map((item) => (
                    <Box key={item.id} onClick={() => toggleCheckItem(item.id)} sx={STYLES.checkItem}>
                      {item.checked ? (
                        <CheckCircleIcon sx={{ ...iconStyles.medium, color: colors.status.success.main, mt: 0.25 }} />
                      ) : (
                        <UncheckedIcon sx={{ ...iconStyles.medium, color: colors.text.light, mt: 0.25 }} />
                      )}
                      <Typography
                        sx={{
                          fontSize: fontSizes.sm,
                          color: item.checked ? colors.text.muted : colors.text.secondary,
                          textDecoration: item.checked ? 'line-through' : 'none',
                          flex: 1,
                        }}
                      >
                        {item.content}
                      </Typography>
                    </Box>
                  ))}
                  <Button size="small" startIcon={<AddIcon />} sx={{ ...buttonStyles.small, mt: 1, color: colors.text.muted }}>
                    確認事項を追加
                  </Button>
                </Box>
              </Collapse>
            </Box>
          );
        })}
      </Box>

      <Divider />

      {/* 事前提出資料 */}
      <Box>
        <Typography sx={sectionStyles.title}>
          <AttachFileIcon sx={{ ...iconStyles.medium, color: colors.text.muted }} />
          事前提出資料
        </Typography>

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {documents.map((doc) => {
            const statusInfo = getDocumentStatusInfo(doc.status);
            return (
              <Box key={doc.id} sx={STYLES.documentItem}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <AttachFileIcon sx={{ ...iconStyles.small, color: colors.text.muted }} />
                  <Typography sx={{ fontSize: fontSizes.sm, color: colors.text.secondary }}>
                    {doc.name}
                  </Typography>
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Chip
                    size="small"
                    label={statusInfo.label}
                    sx={{
                      ...chipStyles.small,
                      backgroundColor: statusInfo.bgColor,
                      color: statusInfo.color,
                    }}
                  />
                  <IconButton size="small" sx={{ p: 0.5 }}>
                    <UploadIcon fontSize="small" sx={{ color: colors.text.muted }} />
                  </IconButton>
                </Box>
              </Box>
            );
          })}
        </Box>

        <Button
          variant="outlined"
          size="small"
          startIcon={<AddIcon />}
          sx={{
            ...buttonStyles.action,
            mt: 1.5,
            '&:hover': { borderColor: colors.border.dark, backgroundColor: 'rgba(0, 0, 0, 0.02)' },
          }}
        >
          資料を追加
        </Button>
      </Box>
    </Box>
  );
}
