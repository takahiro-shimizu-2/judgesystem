/**
 * カスタムページネーションコンポーネント（高級感デザイン）
 * ダークネイビーベース + ゴールドアクセント
 */
import { Box, Typography, Select, MenuItem, IconButton, useMediaQuery, useTheme } from '@mui/material';
import type { SelectChangeEvent } from '@mui/material';
import {
  FirstPage as FirstPageIcon,
  LastPage as LastPageIcon,
  ChevronLeft as ChevronLeftIcon,
  ChevronRight as ChevronRightIcon,
} from '@mui/icons-material';
import { colors, iconStyles, borderRadius } from '../../constants/styles';

interface CustomPaginationProps {
  page: number;
  pageSize: number;
  rowCount: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
}

/** 表示するページ番号ボタンの最大数 */
const MAX_PAGE_BUTTONS = 5;
const MAX_PAGE_BUTTONS_MOBILE = 3;

/**
 * 表示するページ番号を計算（現在のページを中心に配置）
 */
function getPageNumbers(page: number, totalPages: number, maxButtons: number): number[] {
  const pages: number[] = [];

  if (totalPages <= maxButtons) {
    for (let i = 0; i < totalPages; i++) pages.push(i);
  } else {
    let start = Math.max(0, page - Math.floor(maxButtons / 2));
    let end = start + maxButtons;

    if (end > totalPages) {
      end = totalPages;
      start = Math.max(0, end - maxButtons);
    }

    for (let i = start; i < end; i++) pages.push(i);
  }

  return pages;
}

// ナビゲーションボタンスタイル
const navButtonSx = (disabled: boolean) => ({
  color: disabled ? colors.text.light : colors.primary.main,
  p: 0.5,
  '&:hover': {
    backgroundColor: disabled ? 'transparent' : colors.border.main,
  },
});

// ページ番号ボタンスタイル
const pageButtonSx = (isActive: boolean) => ({
  minWidth: { xs: 28, sm: 36 },
  height: { xs: 28, sm: 32 },
  px: { xs: 0.5, sm: 1 },
  fontSize: { xs: '0.75rem', sm: '0.85rem' },
  fontWeight: isActive ? 700 : 400,
  backgroundColor: isActive ? colors.primary.main : 'transparent',
  color: isActive ? colors.text.white : colors.text.mutedDark,
  border: 'none',
  borderRadius: borderRadius.xs,
  cursor: 'pointer',
  transition: 'all 0.15s ease',
  '&:hover': {
    backgroundColor: isActive ? colors.primary.dark : colors.border.main,
  },
});

export function CustomPagination({
  page,
  pageSize,
  rowCount,
  onPageChange,
  onPageSizeChange,
}: CustomPaginationProps) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  const totalPages = Math.ceil(rowCount / pageSize);
  const maxButtons = isMobile ? MAX_PAGE_BUTTONS_MOBILE : MAX_PAGE_BUTTONS;
  const pageNumbers = getPageNumbers(page, totalPages, maxButtons);
  const startRow = page * pageSize + 1;
  const endRow = Math.min((page + 1) * pageSize, rowCount);

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        px: { xs: 2, sm: 3 },
        py: { xs: 1.5, sm: 2 },
        backgroundColor: colors.text.white,
        borderTop: `1px solid ${colors.border.main}`,
        flexWrap: 'wrap',
        gap: 1.5,
      }}
    >
      {/* 表示件数 */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: { xs: 0.5, sm: 1 } }}>
        <Typography sx={{ fontSize: { xs: '0.7rem', sm: '0.8rem' }, color: colors.text.muted, display: { xs: 'none', sm: 'block' } }}>
          表示:
        </Typography>
        <Select
          value={pageSize}
          onChange={(e: SelectChangeEvent<number>) =>
            onPageSizeChange(e.target.value as number)
          }
          size="small"
          sx={{
            fontSize: { xs: '0.7rem', sm: '0.8rem' },
            '& .MuiSelect-select': { py: 0.5, px: { xs: 0.5, sm: 1 } },
            '& .MuiOutlinedInput-notchedOutline': {
              borderColor: colors.border.main,
            },
            '&:hover .MuiOutlinedInput-notchedOutline': {
              borderColor: colors.border.dark,
            },
            minWidth: { xs: 55, sm: 70 },
          }}
        >
          <MenuItem value={25}>25件</MenuItem>
          <MenuItem value={50}>50件</MenuItem>
          <MenuItem value={100}>100件</MenuItem>
        </Select>
        <Typography sx={{ fontSize: { xs: '0.7rem', sm: '0.8rem' }, color: colors.text.muted }}>
          {startRow}-{endRow} / {rowCount}件
        </Typography>
      </Box>

      {/* ページナビゲーション */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 0.5,
        }}
      >
        {/* 最初へ */}
        <IconButton
          size="small"
          disabled={page === 0}
          onClick={() => onPageChange(0)}
          sx={navButtonSx(page === 0)}
        >
          <FirstPageIcon sx={iconStyles.medium} />
        </IconButton>

        {/* 前へ */}
        <IconButton
          size="small"
          disabled={page === 0}
          onClick={() => onPageChange(page - 1)}
          sx={navButtonSx(page === 0)}
        >
          <ChevronLeftIcon sx={iconStyles.medium} />
        </IconButton>

        {/* ページ番号ボタン */}
        <Box sx={{ display: 'flex', gap: 0.5, mx: 0.5 }}>
          {pageNumbers.map((pageNum) => (
            <Box
              key={pageNum}
              component="button"
              onClick={() => onPageChange(pageNum)}
              sx={pageButtonSx(page === pageNum)}
            >
              {pageNum + 1}
            </Box>
          ))}
        </Box>

        {/* 次へ */}
        <IconButton
          size="small"
          disabled={page >= totalPages - 1}
          onClick={() => onPageChange(page + 1)}
          sx={navButtonSx(page >= totalPages - 1)}
        >
          <ChevronRightIcon sx={iconStyles.medium} />
        </IconButton>

        {/* 最後へ */}
        <IconButton
          size="small"
          disabled={page >= totalPages - 1}
          onClick={() => onPageChange(totalPages - 1)}
          sx={navButtonSx(page >= totalPages - 1)}
        >
          <LastPageIcon sx={iconStyles.medium} />
        </IconButton>
      </Box>
    </Box>
  );
}
