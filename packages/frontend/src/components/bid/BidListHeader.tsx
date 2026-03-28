/**
 * 入札一覧ページのヘッダーコンポーネント（高級感デザイン）
 * ダークネイビーベース + ゴールドアクセント
 */
import {
  Box,
  Typography,
  Chip,
  Button,
} from '@mui/material';
import { Close as CloseIcon, FilterAlt as FilterIcon } from '@mui/icons-material';
import { evaluationStatusConfig } from '../../constants/status';
import { workStatusConfig } from '../../constants/workStatus';
import { priorityLabels } from '../../constants/priority';
import { bidTypeConfig } from '../../constants/bidType';
import { colors, pageStyles, fontSizes, listFilterChipStyles, iconStyles, borderRadius } from '../../constants/styles';
import type { FilterState } from '../../types';
import type { BidType } from '../../types/announcement';

interface BidListHeaderProps {
  filters: FilterState;
  onFilterChange: (filters: FilterState) => void;
  onClearFilters: () => void;
  totalFilterCount: number;
  onOpenFilterModal?: () => void;
}

// フィルターChipスタイル - use listFilterChipStyles
const premiumChipSx = listFilterChipStyles;

export function BidListHeader({
  filters,
  onFilterChange,
  onClearFilters,
  totalFilterCount,
  onOpenFilterModal,
}: BidListHeaderProps) {
  const visibleCategoryDetails = filters.categoryDetails.length > 0
    ? filters.categoryDetails
    : filters.categories;

  const handleRemoveCategoryDetail = (detail: string) => {
    if (filters.categoryDetails.length > 0) {
      const nextDetails = filters.categoryDetails.filter((x) => x !== detail);
      onFilterChange({
        ...filters,
        categoryDetails: nextDetails,
        categories: nextDetails,
      });
    } else {
      const nextCategories = filters.categories.filter((x) => x !== detail);
      onFilterChange({
        ...filters,
        categories: nextCategories,
      });
    }
  };

  return (
    <Box
      sx={{
        ...pageStyles.cardHeader,
        pt: { xs: 2.5, md: 3 },
        pb: { xs: 2, md: 2.5 },
        borderBottom: `2px solid ${colors.border.dark}`,
        boxShadow: '0 1px 2px rgba(0, 0, 0, 0.05)',
        flexDirection: 'column',
        alignItems: 'stretch',
        gap: totalFilterCount > 0 ? 1.5 : 0,
      }}
    >
      {/* タイトル + モバイルアクション */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          width: '100%',
          gap: 2,
        }}
      >
        <Typography
          variant="h5"
          sx={pageStyles.pageTitle}
        >
          入札可否判定結果
        </Typography>
        {onOpenFilterModal && (
          <Button
            startIcon={<FilterIcon sx={iconStyles.small} />}
            onClick={onOpenFilterModal}
            sx={{
              display: { xs: 'inline-flex', md: 'none' },
              backgroundColor: colors.primary.main,
              color: colors.text.white,
              fontWeight: 600,
              textTransform: 'none',
              px: 2,
              py: 0.75,
              borderRadius: borderRadius.xs,
              boxShadow: 'none',
              '&:hover': {
                backgroundColor: colors.primary.dark,
                boxShadow: 'none',
              },
            }}
          >
            フィルター
          </Button>
        )}
      </Box>

      {/* アクティブフィルターチップ */}
      {totalFilterCount > 0 && (
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            flexWrap: 'wrap',
          }}
        >
          <Typography
            sx={{
              fontSize: fontSizes.xs,
              color: colors.text.muted,
              fontWeight: 500,
            }}
          >
            絞り込み:
          </Typography>
          <Typography
            component="button"
            onClick={onClearFilters}
            sx={{ fontSize: fontSizes.xs, color: colors.accent.red, fontWeight: 600, cursor: 'pointer', background: 'none', border: 'none', p: 0, mr: 0.5, '&:hover': { color: colors.status.error.main } }}
          >
            クリア
          </Typography>

          {/* ステータスフィルター */}
          {filters.statuses.map((s) => (
            <Chip
              key={s}
              label={evaluationStatusConfig[s].label}
              size="small"
              onDelete={() =>
                onFilterChange({
                  ...filters,
                  statuses: filters.statuses.filter((x) => x !== s),
                })
              }
              deleteIcon={<CloseIcon />}
              sx={premiumChipSx}
            />
          ))}

          {/* 優先順位フィルター */}
          {filters.priorities.map((p) => (
            <Chip
              key={p}
              label={priorityLabels[p]}
              size="small"
              onDelete={() =>
                onFilterChange({
                  ...filters,
                  priorities: filters.priorities.filter((x) => x !== p),
                })
              }
              deleteIcon={<CloseIcon />}
              sx={premiumChipSx}
            />
          ))}

          {/* 着手状況フィルター */}
          {filters.workStatuses.map((s) => (
            <Chip
              key={s}
              label={workStatusConfig[s].label}
              size="small"
              onDelete={() =>
                onFilterChange({
                  ...filters,
                  workStatuses: filters.workStatuses.filter((x) => x !== s),
                })
              }
              deleteIcon={<CloseIcon />}
              sx={premiumChipSx}
            />
          ))}

          {/* 入札方式フィルター */}
          {filters.bidTypes.map((b) => (
            <Chip
              key={b}
              label={bidTypeConfig[b as BidType]?.label || b}
              size="small"
              onDelete={() =>
                onFilterChange({
                  ...filters,
                  bidTypes: filters.bidTypes.filter((x) => x !== b),
                })
              }
              deleteIcon={<CloseIcon />}
              sx={premiumChipSx}
            />
          ))}

          {/* カテゴリ区分フィルター */}
          {filters.categorySegments.map((segment) => (
            <Chip
              key={`segment-${segment}`}
              label={`区分: ${segment}`}
              size="small"
              onDelete={() =>
                onFilterChange({
                  ...filters,
                  categorySegments: filters.categorySegments.filter((x) => x !== segment),
                })
              }
              deleteIcon={<CloseIcon />}
              sx={premiumChipSx}
            />
          ))}

          {/* カテゴリ詳細フィルター */}
          {visibleCategoryDetails.map((detail) => (
            <Chip
              key={`detail-${detail}`}
              label={`詳細: ${detail}`}
              size="small"
              onDelete={() => handleRemoveCategoryDetail(detail)}
              deleteIcon={<CloseIcon />}
              sx={premiumChipSx}
            />
          ))}

          {/* 発注機関フィルター */}
          {filters.organizations.map((o) => (
            <Chip
              key={o}
              label={o}
              size="small"
              onDelete={() =>
                onFilterChange({
                  ...filters,
                  organizations: filters.organizations.filter((x) => x !== o),
                })
              }
              deleteIcon={<CloseIcon />}
              sx={premiumChipSx}
            />
          ))}
        </Box>
      )}
    </Box>
  );
}
