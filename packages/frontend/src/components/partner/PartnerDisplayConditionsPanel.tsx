/**
 * 会社情報一覧の表示条件パネル
 */
import { useState } from 'react';
import { Box, TextField, InputAdornment, IconButton, Typography, Button, Rating } from '@mui/material';
import {
  Search as SearchIcon,
  Close as CloseIcon,
  SwapVert as SortIcon,
  FilterAlt as FilterAltIcon,
  Star as StarIcon,
  Description as DescriptionIcon,
  Place as PlaceIcon,
  CheckCircle as CheckCircleIcon,
} from '@mui/icons-material';
import type { GridSortModel } from '@mui/x-data-grid';
import { colors, rightPanelColors, rightPanelStyles, fontSizes, iconStyles, borderRadius } from '../../constants/styles';
import { prefecturesByRegion } from '../../constants/prefectures';
import type { PartnerFilterState } from './PartnerFilterModal';

// ソートオプションの定義
const SORT_FIELDS = [
  { field: 'rating', label: '評価', ascLabel: '低い', descLabel: '高い' },
  { field: 'resultCount', label: '実績数', ascLabel: '少ない', descLabel: '多い' },
  { field: 'surveyCount', label: '現地調査数', ascLabel: '少ない', descLabel: '多い' },
  { field: 'prefecture', label: '都道府県', ascLabel: '北→南', descLabel: '南→北' },
  { field: 'name', label: '会社名', ascLabel: 'A→Z', descLabel: 'Z→A' },
] as const;

// 評価の選択肢
const ratings = [3, 2.5, 2, 1.5, 1, 0.5, 0];

// フィルタータブの定義
const FILTER_TABS = [
  { id: 'rating', label: '評価', icon: <StarIcon sx={iconStyles.small} /> },
  { id: 'primeQualification', label: '元請', icon: <CheckCircleIcon sx={iconStyles.small} /> },
  { id: 'category', label: 'カテゴリ', icon: <DescriptionIcon sx={iconStyles.small} /> },
  { id: 'prefecture', label: '都道府県', icon: <PlaceIcon sx={iconStyles.small} /> },
] as const;

interface Props {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  sortModel: GridSortModel;
  onSortModelChange: (model: GridSortModel) => void;
  filters: PartnerFilterState;
  onFilterChange: (filters: PartnerFilterState) => void;
  onClearAll: () => void;
  categories: string[];
  activeTab?: 'sort' | 'filter';
  onTabChange?: (tab: 'sort' | 'filter') => void;
}

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

export function PartnerDisplayConditionsPanel({
  searchQuery,
  onSearchChange,
  sortModel,
  onSortModelChange,
  filters,
  onFilterChange,
  onClearAll,
  categories,
  activeTab,
  onTabChange,
}: Props) {
  const [internalTab, setInternalTab] = useState<'sort' | 'filter'>('sort');
  const [activeFilterTab, setActiveFilterTab] = useState(0);

  const mainTab = activeTab ?? internalTab;
  const setMainTab = (tab: 'sort' | 'filter') => {
    setInternalTab(tab);
    onTabChange?.(tab);
  };

  // トグル関数
  const toggleRating = (rating: number) => {
    const newRatings = filters.ratings.includes(rating)
      ? filters.ratings.filter(r => r !== rating)
      : [...filters.ratings, rating];
    onFilterChange({ ...filters, ratings: newRatings });
  };

  const toggleCategory = (category: string) => {
    const newCategories = filters.categories.includes(category)
      ? filters.categories.filter(c => c !== category)
      : [...filters.categories, category];
    onFilterChange({ ...filters, categories: newCategories });
  };

  const togglePrefecture = (pref: string) => {
    const newPrefs = filters.prefectures.includes(pref)
      ? filters.prefectures.filter(p => p !== pref)
      : [...filters.prefectures, pref];
    onFilterChange({ ...filters, prefectures: newPrefs });
  };

  const togglePrefRegion = (regionItems: readonly string[]) => {
    const allSelected = regionItems.every(item => filters.prefectures.includes(item));
    if (allSelected) {
      onFilterChange({
        ...filters,
        prefectures: filters.prefectures.filter(p => !regionItems.includes(p)),
      });
    } else {
      const newPrefs = new Set([...filters.prefectures, ...regionItems]);
      onFilterChange({ ...filters, prefectures: Array.from(newPrefs) });
    }
  };

  const getPrefRegionSelectionState = (regionItems: readonly string[]): 'all' | 'partial' | 'none' => {
    const selectedCount = regionItems.filter(item => filters.prefectures.includes(item)).length;
    if (selectedCount === 0) return 'none';
    if (selectedCount === regionItems.length) return 'all';
    return 'partial';
  };

  const filterCounts = {
    rating: filters.ratings.length,
    primeQualification: filters.hasPrimeQualification !== 'all' ? 1 : 0,
    category: filters.categories.length,
    prefecture: filters.prefectures.length,
  };

  const totalFilterCount = Object.values(filterCounts).reduce((a, b) => a + b, 0) + (filters.hasSurvey !== 'all' ? 1 : 0);
  const hasConditions = searchQuery.trim() || sortModel.length > 0 || totalFilterCount > 0;

  const sectionDivider = {
    borderBottom: `1px solid ${rightPanelColors.border}`,
    pb: 2.5,
    mb: 2.5,
  };

  const renderFilterContent = () => {
    const tabId = FILTER_TABS[activeFilterTab].id;

    switch (tabId) {
      case 'rating':
        return (
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
            {ratings.map((rating) => {
              const selected = filters.ratings.includes(rating);
              return (
                <Box
                  component="button"
                  key={rating}
                  onClick={() => toggleRating(rating)}
                  sx={{
                    position: 'relative',
                    display: 'flex',
                    alignItems: 'center',
                    padding: '6px 12px',
                    paddingLeft: selected ? '14px' : '12px',
                    borderRadius: borderRadius.xs,
                    cursor: 'pointer',
                    border: `1px solid ${selected ? colors.accent.blue : rightPanelColors.inputBorder}`,
                    transition: 'all 0.2s ease',
                    backgroundColor: selected ? `${colors.accent.blue}26` : 'transparent',
                    overflow: 'hidden',
                    ...(selected && {
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
                      backgroundColor: selected ? `${colors.accent.blue}33` : 'rgba(255, 255, 255, 0.06)',
                      borderColor: selected ? colors.accent.blue : `${colors.text.light}99`,
                    },
                  }}
                >
                  {rating > 0 ? (
                    <Rating
                      value={rating}
                      max={3}
                      precision={0.5}
                      readOnly
                      size="small"
                      sx={{
                        '& .MuiRating-iconFilled': { color: selected ? colors.text.white : rightPanelColors.textMuted },
                        '& .MuiRating-iconEmpty': { color: rightPanelColors.inputBorder },
                      }}
                    />
                  ) : (
                    <Typography sx={{ fontSize: fontSizes.xs, fontWeight: 500, color: selected ? colors.text.white : rightPanelColors.textMuted }}>
                      未評価
                    </Typography>
                  )}
                </Box>
              );
            })}
          </Box>
        );

      case 'primeQualification':
        return (
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
            <FilterButton
              label="すべて"
              selected={filters.hasPrimeQualification === 'all'}
              onClick={() => onFilterChange({ ...filters, hasPrimeQualification: 'all' })}
            />
            <FilterButton
              label="元請資格あり"
              selected={filters.hasPrimeQualification === 'yes'}
              onClick={() => onFilterChange({ ...filters, hasPrimeQualification: 'yes' })}
              color={colors.status.success.main}
            />
            <FilterButton
              label="元請資格なし"
              selected={filters.hasPrimeQualification === 'no'}
              onClick={() => onFilterChange({ ...filters, hasPrimeQualification: 'no' })}
              color={colors.text.muted}
            />
          </Box>
        );

      case 'category':
        return (
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
            {categories.map((cat) => (
              <FilterButton
                key={cat}
                label={cat}
                selected={filters.categories.includes(cat)}
                onClick={() => toggleCategory(cat)}
              />
            ))}
          </Box>
        );

      case 'prefecture':
        return (
          <Box>
            {prefecturesByRegion.map((group) => {
              const selectionState = getPrefRegionSelectionState(group.prefectures);
              return (
                <Box key={group.region} sx={{ mb: 2 }}>
                  <button
                    onClick={() => togglePrefRegion(group.prefectures)}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      fontSize: fontSizes.xs,
                      fontWeight: 600,
                      color: selectionState === 'none' ? rightPanelColors.textMuted : rightPanelColors.text,
                      marginBottom: '8px',
                      padding: '4px 10px',
                      borderRadius: borderRadius.xs,
                      border: 'none',
                      cursor: 'pointer',
                      background:
                        selectionState === 'all'
                          ? `${colors.accent.blue}40`
                          : selectionState === 'partial'
                            ? `${colors.accent.blue}26`
                            : 'rgba(255, 255, 255, 0.08)',
                    }}
                  >
                    <span
                      style={{
                        width: 14,
                        height: 14,
                        borderRadius: '3px',
                        border: selectionState === 'none' ? `2px solid ${colors.text.muted}` : 'none',
                        background:
                          selectionState === 'all'
                            ? colors.accent.blue
                            : selectionState === 'partial'
                              ? colors.status.info.light
                              : 'transparent',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '10px',
                        color: colors.text.white,
                      }}
                    >
                      {selectionState === 'all' && '✓'}
                      {selectionState === 'partial' && '−'}
                    </span>
                    {group.region}
                    <span style={{ fontSize: fontSizes.xs, color: rightPanelColors.textMuted }}>
                      ({group.prefectures.filter(item => filters.prefectures.includes(item)).length}/{group.prefectures.length})
                    </span>
                  </button>
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
                    {group.prefectures.map((pref) => (
                      <FilterButton
                        key={pref}
                        label={pref}
                        selected={filters.prefectures.includes(pref)}
                        onClick={() => togglePrefecture(pref)}
                      />
                    ))}
                  </Box>
                </Box>
              );
            })}
          </Box>
        );

      default:
        return null;
    }
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column' }}>
      {/* クリアボタン */}
      <Box sx={sectionDivider}>
        <Button
          onClick={onClearAll}
          variant="outlined"
          size="small"
          fullWidth
          disabled={!hasConditions}
          sx={{
            color: hasConditions ? colors.accent.red : rightPanelColors.textMuted,
            borderColor: hasConditions ? `${colors.accent.red}80` : rightPanelColors.inputBorder,
            fontSize: fontSizes.xs,
            py: 0.75,
            '&:hover': {
              borderColor: colors.accent.red,
              backgroundColor: `${colors.accent.red}1a`,
            },
            '&.Mui-disabled': {
              color: rightPanelColors.textMuted,
              borderColor: rightPanelColors.inputBorder,
            },
          }}
        >
          すべてクリア
        </Button>
      </Box>

      {/* 検索セクション */}
      <Box sx={sectionDivider}>
        <TextField
          placeholder="会社名、住所、種別で検索..."
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
            <Box sx={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 0.75,
              mb: 2,
              pb: 2,
              borderBottom: `1px solid ${rightPanelColors.border}`
            }}>
              {FILTER_TABS.map((tab, index) => {
                const count = filterCounts[tab.id as keyof typeof filterCounts];
                const isActive = activeFilterTab === index;
                return (
                  <Box
                    component="button"
                    key={tab.id}
                    onClick={() => setActiveFilterTab(index)}
                    sx={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: 0.5,
                      px: 1,
                      py: 1.25,
                      fontSize: fontSizes.sm,
                      fontWeight: isActive ? 600 : 500,
                      borderRadius: borderRadius.xs,
                      border: `1px solid ${isActive ? colors.accent.blue : rightPanelColors.inputBorder}`,
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                      position: 'relative',
                      overflow: 'hidden',
                      backgroundColor: isActive ? `${colors.accent.blue}26` : 'transparent',
                      color: isActive ? colors.text.white : rightPanelColors.textMuted,
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
                    {tab.label}
                    {count > 0 && (
                      <Box
                        component="span"
                        sx={{
                          position: 'absolute',
                          top: 4,
                          right: 4,
                          padding: '1px 5px',
                          borderRadius: borderRadius.xs,
                          fontSize: fontSizes.xs,
                          fontWeight: 700,
                          backgroundColor: isActive ? 'rgba(255,255,255,0.3)' : `${colors.accent.blue}cc`,
                          color: colors.text.white,
                          minWidth: 14,
                          textAlign: 'center',
                        }}
                      >
                        {count}
                      </Box>
                    )}
                  </Box>
                );
              })}
            </Box>

            <Box sx={{ minHeight: 100 }}>
              {renderFilterContent()}
            </Box>
          </Box>
        )}
      </Box>
    </Box>
  );
}
