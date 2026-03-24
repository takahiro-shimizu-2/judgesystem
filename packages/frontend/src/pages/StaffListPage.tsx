/**
 * 担当者一覧ページ（カード形式）
 */
import { useCallback, useMemo, useState, useRef, useEffect } from 'react';
import {
  Box,
  Paper,
  Typography,
  Chip,
  TextField,
  InputAdornment,
  IconButton,
  Button,
} from '@mui/material';
import {
  Person as PersonIcon,
  Email as EmailIcon,
  Phone as PhoneIcon,
  Search as SearchIcon,
  Close as CloseIcon,
  SwapVert as SortIcon,
  FilterAlt as FilterAltIcon,
} from '@mui/icons-material';
import type { GridSortModel } from '@mui/x-data-grid';
import { fontSizes, colors, pageStyles, iconStyles, borderRadius, listFilterChipStyles, rightPanelColors, rightPanelStyles } from '../constants/styles';
import { CustomPagination } from '../components/bid';
import { RightSidePanel } from '../components/layout';
import { useSidebar } from '../contexts/SidebarContext';
import { useStaffDirectory } from '../contexts/StaffContext';
import type { Staff } from '../types';

// 部署ごとの色設定
const departmentColors: Record<string, string> = {
  '営業部': colors.accent.blue,
  '技術部': colors.accent.green,
  '管理部': colors.accent.purple,
};

// 行データの型
interface RowData extends Staff {
  // Staff型をそのまま使用
}

/**
 * 担当者カード
 */
function StaffCard({ row }: { row: RowData }) {
  const departmentColor = departmentColors[row.department] || colors.text.muted;

  return (
    <Box
      sx={{
        position: 'relative',
        display: 'flex',
        gap: 3,
        px: 2.5,
        py: 3,
        mx: 2,
        my: 1,
        backgroundColor: colors.text.white,
        borderRadius: '2px',
        border: `1px solid ${colors.border.main}`,
        transition: 'all 0.2s ease',
        '&:hover': {
          borderColor: 'rgba(59, 130, 246, 0.4)',
          boxShadow: '0 4px 20px rgba(0, 0, 0, 0.08)',
        },
        '&::before': {
          content: '""',
          position: 'absolute',
          left: 0,
          top: 0,
          bottom: 0,
          width: '3px',
          backgroundColor: departmentColor,
        },
      }}
    >
      {/* 左: アイコン */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 56,
          height: 56,
          borderRadius: '50%',
          backgroundColor: `${departmentColor}15`,
          flexShrink: 0,
        }}
      >
        <PersonIcon sx={{ fontSize: 28, color: departmentColor }} />
      </Box>

      {/* 中央: メインコンテンツ */}
      <Box sx={{ flex: 1, minWidth: 0, pl: 0.5 }}>
        {/* 1行目: No + 部署バッジ */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1.5, flexWrap: 'wrap' }}>
          <Typography
            sx={{
              fontSize: fontSizes.xs,
              color: colors.text.light,
              fontWeight: 500,
              letterSpacing: '0.05em',
            }}
          >
            No. {String(row.no).padStart(4, '0')}
          </Typography>

          {/* 部署バッジ */}
          <Typography
            sx={{
              fontSize: fontSizes.xs,
              fontWeight: 600,
              color: departmentColor,
              letterSpacing: '0.03em',
            }}
          >
            {row.department}
          </Typography>
        </Box>

        {/* 2行目: 氏名 */}
        <Typography
          sx={{
            fontWeight: 500,
            fontSize: fontSizes.xl,
            color: colors.text.secondary,
            lineHeight: 1.6,
            mb: 1.5,
            letterSpacing: '-0.01em',
            transition: 'color 0.15s',
            '.MuiBox-root:hover &': {
              color: colors.text.primary,
            },
          }}
        >
          {row.name}
        </Typography>

        {/* 3行目: 連絡先 */}
        <Box
          sx={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 3,
            alignItems: 'center',
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
            <EmailIcon sx={{ ...iconStyles.small, color: colors.text.light }} />
            <Typography sx={{ fontSize: fontSizes.md, color: colors.text.muted, fontWeight: 400 }}>
              {row.email}
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
            <PhoneIcon sx={{ ...iconStyles.small, color: colors.text.light }} />
            <Typography sx={{ fontSize: fontSizes.md, color: colors.text.muted, fontWeight: 400 }}>
              {row.phone}
            </Typography>
          </Box>
        </Box>
      </Box>
    </Box>
  );
}

// ソートオプションの定義
const SORT_FIELDS = [
  { field: 'no', label: 'No.', ascLabel: '小さい', descLabel: '大きい' },
  { field: 'name', label: '氏名', ascLabel: 'A→Z', descLabel: 'Z→A' },
  { field: 'department', label: '部署', ascLabel: 'A→Z', descLabel: 'Z→A' },
] as const;

// フィルターボタン
function FilterButton({
  label,
  selected,
  onClick,
  color,
  bgColor,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
  color?: string;
  bgColor?: string;
}) {
  return (
    <Box
      component="button"
      onClick={onClick}
      sx={{
        position: 'relative',
        padding: '6px 12px',
        paddingLeft: selected ? '14px' : '12px',
        borderRadius: borderRadius.xs,
        fontSize: fontSizes.xs,
        fontWeight: selected ? 600 : 500,
        cursor: 'pointer',
        border: `1px solid ${selected ? (color || colors.accent.blue) : rightPanelColors.inputBorder}`,
        transition: 'all 0.2s ease',
        backgroundColor: selected ? bgColor || `${colors.accent.blue}26` : 'transparent',
        color: selected ? (color || colors.text.white) : rightPanelColors.textMuted,
        overflow: 'hidden',
        ...(selected && {
          '&::before': {
            content: '""',
            position: 'absolute',
            left: 0,
            top: 0,
            bottom: 0,
            width: '3px',
            backgroundColor: color || colors.accent.blue,
          },
        }),
        '&:hover': {
          backgroundColor: selected ? bgColor || `${colors.accent.blue}33` : 'rgba(255, 255, 255, 0.06)',
          color: selected ? (color || colors.text.white) : rightPanelColors.text,
          borderColor: selected ? (color || colors.accent.blue) : `${colors.text.light}99`,
        },
      }}
    >
      {label}
    </Box>
  );
}

/**
 * 表示条件パネル
 */
function StaffDisplayConditionsPanel({
  searchQuery,
  onSearchChange,
  sortModel,
  onSortModelChange,
  filters,
  onFilterChange,
  onClearAll,
  departments,
}: {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  sortModel: GridSortModel;
  onSortModelChange: (model: GridSortModel) => void;
  filters: { departments: string[] };
  onFilterChange: (filters: { departments: string[] }) => void;
  onClearAll: () => void;
  departments: string[];
}) {
  const [mainTab, setMainTab] = useState<'sort' | 'filter'>('sort');

  const handleDepartmentToggle = (dept: string) => {
    if (filters.departments.includes(dept)) {
      onFilterChange({ departments: filters.departments.filter((d) => d !== dept) });
    } else {
      onFilterChange({ departments: [...filters.departments, dept] });
    }
  };

  const totalFilterCount = filters.departments.length;
  const hasConditions = searchQuery.trim() || sortModel.length > 0 || totalFilterCount > 0;

  const sectionDivider = {
    borderBottom: `1px solid ${rightPanelColors.border}`,
    pb: 2.5,
    mb: 2.5,
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column' }}>
      {/* クリアボタン */}
      <Box sx={sectionDivider}>
        <Box
          component="button"
          onClick={onClearAll}
          disabled={!hasConditions}
          sx={{
            width: '100%',
            py: 1,
            fontSize: fontSizes.xs,
            fontWeight: 600,
            color: hasConditions ? colors.accent.red : rightPanelColors.textMuted,
            border: `1px solid ${hasConditions ? `${colors.accent.red}80` : rightPanelColors.inputBorder}`,
            borderRadius: borderRadius.xs,
            backgroundColor: 'transparent',
            cursor: hasConditions ? 'pointer' : 'default',
            transition: 'all 0.2s',
            '&:hover': hasConditions ? {
              borderColor: colors.accent.red,
              backgroundColor: `${colors.accent.red}1a`,
            } : {},
          }}
        >
          すべてクリア
        </Box>
      </Box>

      {/* 検索 */}
      <Box sx={sectionDivider}>
        <TextField
          placeholder="氏名・メールで検索..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          size="small"
          fullWidth
          sx={rightPanelStyles.searchField}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon sx={{ ...rightPanelStyles.searchIcon, ...iconStyles.medium }} />
              </InputAdornment>
            ),
            endAdornment: searchQuery && (
              <InputAdornment position="end">
                <IconButton size="small" onClick={() => onSearchChange('')} sx={rightPanelStyles.searchIcon}>
                  <CloseIcon fontSize="small" />
                </IconButton>
              </InputAdornment>
            ),
          }}
        />
      </Box>

      {/* ソート/フィルター タブ */}
      <Box>
        <Box sx={{ display: 'flex', borderBottom: `1px solid ${rightPanelColors.border}`, mb: 2 }}>
          <Box
            onClick={() => setMainTab('sort')}
            sx={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 0.75,
              py: 1.25,
              cursor: 'pointer',
              borderBottom: mainTab === 'sort' ? `2px solid ${colors.accent.blue}` : '2px solid transparent',
              color: mainTab === 'sort' ? rightPanelColors.text : rightPanelColors.textMuted,
              fontWeight: 600,
              fontSize: fontSizes.sm,
              transition: 'all 0.15s',
              '&:hover': { color: rightPanelColors.text },
            }}
          >
            <SortIcon sx={iconStyles.medium} />
            ソート
            {sortModel.length > 0 && (
              <Box
                component="span"
                sx={{
                  padding: '2px 6px',
                  borderRadius: borderRadius.xs,
                  fontSize: fontSizes.xs,
                  fontWeight: 600,
                  backgroundColor: `${colors.accent.blue}4d`,
                  color: colors.accent.blue,
                }}
              >
                {sortModel.length}
              </Box>
            )}
          </Box>
          <Box
            onClick={() => setMainTab('filter')}
            sx={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 0.75,
              py: 1.25,
              cursor: 'pointer',
              borderBottom: mainTab === 'filter' ? `2px solid ${colors.accent.blue}` : '2px solid transparent',
              color: mainTab === 'filter' ? rightPanelColors.text : rightPanelColors.textMuted,
              fontWeight: 600,
              fontSize: fontSizes.sm,
              transition: 'all 0.15s',
              '&:hover': { color: rightPanelColors.text },
            }}
          >
            <FilterAltIcon sx={iconStyles.medium} />
            フィルター
            {totalFilterCount > 0 && (
              <Box
                component="span"
                sx={{
                  padding: '2px 6px',
                  borderRadius: borderRadius.xs,
                  fontSize: fontSizes.xs,
                  fontWeight: 600,
                  backgroundColor: `${colors.accent.blue}4d`,
                  color: colors.accent.blue,
                }}
              >
                {totalFilterCount}
              </Box>
            )}
          </Box>
        </Box>

        {/* ソートコンテンツ */}
        {mainTab === 'sort' && (
          <Box>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {SORT_FIELDS.map(({ field, label, ascLabel, descLabel }) => {
                const sortIndex = sortModel.findIndex((s) => s.field === field);
                const isActive = sortIndex !== -1;
                const currentSort = isActive ? sortModel[sortIndex].sort : null;
                const buttonText = !isActive
                  ? label
                  : currentSort === 'asc'
                    ? `${label}：${ascLabel}↑`
                    : `${label}：${descLabel}↓`;

                return (
                  <Box
                    component="button"
                    key={field}
                    onClick={() => {
                      if (!isActive) {
                        onSortModelChange([...sortModel, { field, sort: 'asc' }]);
                      } else if (currentSort === 'asc') {
                        const newModel = sortModel.map((s) =>
                          s.field === field ? { ...s, sort: 'desc' as const } : s
                        );
                        onSortModelChange(newModel);
                      } else {
                        onSortModelChange(sortModel.filter((s) => s.field !== field));
                      }
                    }}
                    sx={{
                      position: 'relative',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'flex-start',
                      width: '100%',
                      px: 2,
                      pl: isActive ? 2.5 : 2,
                      py: 1.5,
                      fontSize: fontSizes.md,
                      fontWeight: isActive ? 600 : 500,
                      borderRadius: borderRadius.xs,
                      border: `1px solid ${isActive ? colors.accent.blue : rightPanelColors.inputBorder}`,
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                      backgroundColor: isActive ? `${colors.accent.blue}26` : 'transparent',
                      color: isActive ? colors.text.white : rightPanelColors.textMuted,
                      overflow: 'hidden',
                      ...(isActive && {
                        '&::before': {
                          content: '""',
                          position: 'absolute',
                          left: 0,
                          top: 0,
                          bottom: 0,
                          width: '3px',
                          backgroundColor: colors.accent.blue,
                        },
                      }),
                      '&:hover': {
                        backgroundColor: isActive ? `${colors.accent.blue}33` : 'rgba(255, 255, 255, 0.06)',
                        color: isActive ? colors.text.white : rightPanelColors.text,
                        borderColor: isActive ? colors.accent.blue : `${colors.text.light}99`,
                      },
                    }}
                  >
                    {isActive && sortModel.length > 1 && (
                      <Typography
                        component="span"
                        sx={{
                          fontSize: fontSizes.xs,
                          fontWeight: 700,
                          backgroundColor: 'rgba(255,255,255,0.3)',
                          borderRadius: '50%',
                          width: 14,
                          height: 14,
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          mr: 0.75,
                        }}
                      >
                        {sortIndex + 1}
                      </Typography>
                    )}
                    {buttonText}
                  </Box>
                );
              })}
            </Box>
            {sortModel.length > 0 && (
              <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 1.5 }}>
                <button
                  onClick={() => onSortModelChange([])}
                  style={{
                    fontSize: fontSizes.xs,
                    color: colors.accent.red,
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    padding: '4px 8px',
                  }}
                >
                  クリア
                </button>
              </Box>
            )}
          </Box>
        )}

        {/* フィルターコンテンツ */}
        {mainTab === 'filter' && (
          <Box>
            <Typography sx={{ fontSize: fontSizes.xs, fontWeight: 600, color: rightPanelColors.text, mb: 1.5 }}>
              部署
            </Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
              {departments.map((dept) => {
                const isSelected = filters.departments.includes(dept);
                const deptColor = departmentColors[dept] || colors.accent.blue;
                return (
                  <FilterButton
                    key={dept}
                    label={dept}
                    selected={isSelected}
                    onClick={() => handleDepartmentToggle(dept)}
                    color={deptColor}
                    bgColor={`${deptColor}26`}
                  />
                );
              })}
            </Box>
            {totalFilterCount > 0 && (
              <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 1.5 }}>
                <button
                  onClick={() => onFilterChange({ departments: [] })}
                  style={{
                    fontSize: fontSizes.xs,
                    color: colors.accent.red,
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    padding: '4px 8px',
                  }}
                >
                  クリア
                </button>
              </Box>
            )}
          </Box>
        )}
      </Box>
    </Box>
  );
}

export default function StaffListPage() {
  const listContainerRef = useRef<HTMLDivElement>(null);
  const { rightPanelOpen, toggleRightPanel, closeRightPanel, isMobile } = useSidebar();
  const { staff, loading, error, refresh } = useStaffDirectory();

  // 検索クエリ
  const [searchQuery, setSearchQuery] = useState('');

  // ソートモデル
  const [sortModel, setSortModel] = useState<GridSortModel>([]);

  // フィルター状態
  const [filters, setFilters] = useState<{ departments: string[] }>({
    departments: [],
  });

  // ページネーション
  const [paginationModel, setPaginationModel] = useState<{ page: number; pageSize: number }>({
    page: 0,
    pageSize: 25,
  });

  // 全部署リスト
  const departments = useMemo(() => {
    const unique = new Set<string>();
    staff.forEach((member) => {
      if (member.department) {
        unique.add(member.department);
      }
    });
    return Array.from(unique.values());
  }, [staff]);

  // アクティブなフィルター数
  const totalFilterCount = filters.departments.length;

  // フィルター適用後のデータ
  const filteredStaff = useMemo(() => {
    return staff.filter((member) => {
      // 部署フィルター
      if (filters.departments.length > 0 && !filters.departments.includes(member.department)) {
        return false;
      }
      return true;
    });
  }, [filters, staff]);

  // 行データに変換
  const staffRows: RowData[] = useMemo(() => {
    return filteredStaff.map((s) => ({ ...s }));
  }, [filteredStaff]);

  // 検索フィルター適用
  const searchedRows = useMemo(() => {
    if (!searchQuery.trim()) return staffRows;
    const query = searchQuery.toLowerCase();
    return staffRows.filter(
      (row) =>
        row.name.toLowerCase().includes(query) ||
        row.email.toLowerCase().includes(query)
    );
  }, [staffRows, searchQuery]);

  // ソート適用
  const sortedRows = useMemo(() => {
    if (sortModel.length === 0) return searchedRows;

    return [...searchedRows].sort((a, b) => {
      for (const sort of sortModel) {
        const field = sort.field as keyof RowData;
        const aVal = a[field];
        const bVal = b[field];
        const direction = sort.sort === 'desc' ? -1 : 1;

        let comparison = 0;

        if (typeof aVal === 'string' && typeof bVal === 'string') {
          comparison = aVal.localeCompare(bVal, 'ja');
        } else if (typeof aVal === 'number' && typeof bVal === 'number') {
          comparison = aVal - bVal;
        }

        if (comparison !== 0) {
          return comparison * direction;
        }
      }
      return 0;
    });
  }, [searchedRows, sortModel]);

  // ページネーション適用
  const paginatedRows = useMemo(() => {
    const start = paginationModel.page * paginationModel.pageSize;
    const end = start + paginationModel.pageSize;
    return sortedRows.slice(start, end);
  }, [sortedRows, paginationModel]);

  // ページ変更時にスクロール位置をリセット
  useEffect(() => {
    if (listContainerRef.current) {
      listContainerRef.current.scrollTop = 0;
    }
  }, [paginationModel.page]);

  const handleClearAll = useCallback(() => {
    setSearchQuery('');
    setSortModel([]);
    setFilters({ departments: [] });
  }, []);

  return (
    <Box
      sx={{
        display: 'flex',
        height: '100%',
        minHeight: 0,
        backgroundColor: colors.page.background,
      }}
    >
      {/* メインコンテンツエリア */}
      <Box
        sx={{
          flex: 1,
          minWidth: 0,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          p: { xs: 1.5, sm: 2, md: 3 },
        }}
      >
        <Paper
          sx={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            borderRadius: borderRadius.xs,
          }}
        >
          {/* ヘッダー */}
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
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <PersonIcon sx={{ fontSize: 24, color: colors.accent.blue }} />
              <Typography variant="h5" sx={pageStyles.pageTitle}>
                担当者一覧
              </Typography>
              <Chip
                label={`${sortedRows.length}名`}
                size="small"
                sx={{
                  ml: 1,
                  fontSize: fontSizes.xs,
                  fontWeight: 600,
                  backgroundColor: `${colors.accent.blue}15`,
                  color: colors.accent.blue,
                }}
              />
            </Box>

            {/* アクティブフィルターチップ */}
            {totalFilterCount > 0 && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                <Typography sx={{ fontSize: fontSizes.xs, color: colors.text.muted, fontWeight: 500 }}>
                  絞り込み:
                </Typography>
                <Typography
                  component="button"
                  onClick={() => setFilters({ departments: [] })}
                  sx={{
                    fontSize: fontSizes.xs,
                    color: colors.accent.red,
                    fontWeight: 600,
                    cursor: 'pointer',
                    background: 'none',
                    border: 'none',
                    p: 0,
                    mr: 0.5,
                    '&:hover': { color: colors.status.error.main },
                  }}
                >
                  クリア
                </Typography>

                {filters.departments.map((d) => (
                  <Chip
                    key={d}
                    label={d}
                    size="small"
                    onDelete={() =>
                      setFilters((prev) => ({
                        ...prev,
                        departments: prev.departments.filter((x) => x !== d),
                      }))
                    }
                    sx={listFilterChipStyles}
                  />
                ))}
              </Box>
            )}
          </Box>

          {/* カードリスト */}
          <Box
            ref={listContainerRef}
            sx={{
              flex: 1,
              overflow: 'auto',
              minHeight: 0,
              backgroundColor: colors.background.hover,
              py: 2,
            }}
          >
            {loading ? (
              <Box sx={{ p: 4, textAlign: 'center', color: colors.text.muted }}>
                担当者データを読み込み中です…
              </Box>
            ) : error ? (
              <Box sx={{ p: 4, textAlign: 'center', color: colors.text.muted, display: 'flex', flexDirection: 'column', gap: 1.5, alignItems: 'center' }}>
                <Typography sx={{ color: colors.status.error.main }}>担当者データの取得に失敗しました。</Typography>
                <Button variant="outlined" size="small" onClick={refresh}>再読み込み</Button>
              </Box>
            ) : (
              <>
                {paginatedRows.map((row) => (
                  <StaffCard key={row.id} row={row} />
                ))}
                {paginatedRows.length === 0 && (
                  <Box sx={{ p: 4, textAlign: 'center', color: colors.text.muted }}>
                    該当する担当者がいません
                  </Box>
                )}
              </>
            )}
          </Box>

          {/* ページネーション */}
          <CustomPagination
            page={paginationModel.page}
            pageSize={paginationModel.pageSize}
            rowCount={sortedRows.length}
            onPageChange={(page) => setPaginationModel((prev) => ({ ...prev, page }))}
            onPageSizeChange={(pageSize) => setPaginationModel({ page: 0, pageSize })}
          />
        </Paper>
      </Box>

      {/* 右パネル */}
      <RightSidePanel
        open={rightPanelOpen}
        onToggle={toggleRightPanel}
        onClose={closeRightPanel}
        isMobile={isMobile}
      >
        <StaffDisplayConditionsPanel
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          sortModel={sortModel}
          onSortModelChange={setSortModel}
          filters={filters}
          onFilterChange={setFilters}
          onClearAll={handleClearAll}
          departments={departments}
        />
      </RightSidePanel>
    </Box>
  );
}
