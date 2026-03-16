/**
 * 入札一覧ページのヘッダーコンポーネント（高級感デザイン）
 * ダークネイビーベース + ゴールドアクセント
 */
import {
  Box,
  Typography,
  Chip,
} from '@mui/material';
import { Close as CloseIcon } from '@mui/icons-material';
import { evaluationStatusConfig } from '../../constants/status';
import { workStatusConfig } from '../../constants/workStatus';
import { priorityLabels } from '../../constants/priority';
import { bidTypeConfig } from '../../constants/bidType';
import { colors, pageStyles, fontSizes, listFilterChipStyles } from '../../constants/styles';
import type { FilterState } from '../../types';
import type { BidType } from '../../types/announcement';

interface BidListHeaderProps {
  filters: FilterState;
  onFilterChange: (filters: FilterState) => void;
  onClearFilters: () => void;
  totalFilterCount: number;
}

// フィルターChipスタイル - use listFilterChipStyles
const premiumChipSx = listFilterChipStyles;

export function BidListHeader({
  filters,
  onFilterChange,
  onClearFilters,
  totalFilterCount,
}: BidListHeaderProps) {
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
      {/* タイトル */}
      <Typography
        variant="h5"
        sx={pageStyles.pageTitle}
      >
        入札可否判定結果
      </Typography>

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

          {/* カテゴリフィルター */}
          {filters.categories.map((c) => (
            <Chip
              key={c}
              label={c}
              size="small"
              onDelete={() =>
                onFilterChange({
                  ...filters,
                  categories: filters.categories.filter((x) => x !== c),
                })
              }
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
