import { useState, useMemo, useCallback, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { Box, Typography, Button, Paper, Tabs, Tab, Accordion, AccordionSummary, AccordionDetails, TextField, InputAdornment, IconButton } from '@mui/material';
import {
  AccountBalance as OrdererIcon,
  LocationOn as LocationIcon,
  Phone as PhoneIcon,
  Email as EmailIcon,
  Person as PersonIcon,
  Print as FaxIcon,
  OpenInNew as OpenInNewIcon,
  TextSnippet as TextSnippetIcon,
  Category as CategoryIcon,
  CurrencyYen as CurrencyYenIcon,
  ExpandMore as ExpandMoreIcon,
  ArrowBack as ArrowBackIcon,
  Gavel as BidTypeIcon,
  Search as SearchIcon,
  SwapVert as SortIcon,
  FilterAlt as FilterIcon,
  Close as CloseIcon,
} from '@mui/icons-material';
import {
  announcementStatusConfig,
  bidTypeConfig,
} from '../data';
import { getDocumentTypeConfig, getFileFormatConfig } from '../constants/documentType';
import { colors, pageStyles, fontSizes, iconStyles, borderRadius, rightPanelColors } from '../constants/styles';
import { workStatusConfig } from '../constants/workStatus';
import { evaluationStatusConfig } from '../constants/status';
import { priorityLabels, priorityColors } from '../constants/priority';
import { categories } from '../constants/categories';
import { bidTypes } from '../constants/bidType';
import { prefecturesByRegion } from '../constants/prefectures';
import { organizationGroupsByRegion, getOrganizationGroup } from '../constants/organizations';
import { NotFoundView, FloatingBackButton, ScrollToTopButton } from '../components/common';
import { CustomPagination } from '../components/bid';
import { RightSidePanel } from '../components/layout';
import { useSidebar } from '../contexts/SidebarContext';
import { formatAmountInManYen } from '../utils';
import type { BidType, AnnouncementStatus } from '../types/announcement';
import type { EvaluationStatus, WorkStatus, CompanyPriority } from '../types';
import { getApiUrl } from '../config/api';

// 関連案件用ソートオプション
type SortOption = 'deadline_asc' | 'deadline_desc' | 'publish_asc' | 'publish_desc' | 'status_asc' | 'status_desc' | 'prefecture_asc' | 'prefecture_desc';

// 着手企業用ソートオプション
type CompanySortOption = 'priority_asc' | 'priority_desc' | 'workStatus_asc' | 'workStatus_desc' | 'company_asc' | 'company_desc' | 'evaluationStatus_asc' | 'evaluationStatus_desc';

// ソートフィールド定義
const SORT_FIELDS = [
  { field: 'deadline', label: '締切', ascLabel: '近い', descLabel: '遠い' },
  { field: 'status', label: 'ステータス', ascLabel: '公告中→終了', descLabel: '終了→公告中' },
  { field: 'publish', label: '公告日', ascLabel: '古い', descLabel: '新しい' },
  { field: 'prefecture', label: '都道府県', ascLabel: '北→南', descLabel: '南→北' },
] as const;

// フィルタータブ定義
const FILTER_TABS = [
  { id: 'status', label: 'ステータス' },
  { id: 'bidType', label: '入札方式' },
  { id: 'category', label: '種別' },
  { id: 'prefecture', label: '都道府県' },
  { id: 'organization', label: '発注機関' },
] as const;

// 着手企業用ソートフィールド定義
const COMPANY_SORT_FIELDS = [
  { field: 'priority', label: '優先度', ascLabel: '高い→低い', descLabel: '低い→高い' },
  { field: 'evaluationStatus', label: '参加可否', ascLabel: '可→不可', descLabel: '不可→可' },
  { field: 'workStatus', label: '着手状況', ascLabel: '着手中→完了', descLabel: '完了→着手中' },
  { field: 'company', label: '企業名', ascLabel: 'あ→わ', descLabel: 'わ→あ' },
] as const;

// 着手企業用フィルタータブ定義
const COMPANY_FILTER_TABS = [
  { id: 'evaluationStatus', label: '参加可否' },
  { id: 'workStatus', label: '着手状況' },
  { id: 'priority', label: '優先度' },
] as const;

// フィルター状態の型
interface RelatedFilterState {
  statuses: AnnouncementStatus[];
  bidTypes: string[];
  categories: string[];
  prefectures: string[];
  organizations: string[];
}

// ステータスオプション
const STATUS_OPTIONS: AnnouncementStatus[] = ['upcoming', 'ongoing', 'awaiting_result', 'closed'];

// ステータス順序（ソート用）
const STATUS_ORDER: Record<AnnouncementStatus, number> = {
  upcoming: 0,
  ongoing: 1,
  awaiting_result: 2,
  closed: 3,
};

// 着手企業用フィルター状態の型
interface CompanyFilterState {
  evaluationStatuses: EvaluationStatus[];
  workStatuses: ('in_progress' | 'completed')[];
  priorities: (1 | 2 | 3 | 4 | 5)[];
}

type ProgressingCompany = {
  companyId: string;
  companyName: string;
  branchId: string;
  branchName: string;
  priority: CompanyPriority;
  workStatus: Extract<WorkStatus, 'in_progress' | 'completed'>;
  evaluationId: string;
  evaluationStatus: EvaluationStatus;
};

// 参加可否オプション
const EVALUATION_STATUS_OPTIONS: EvaluationStatus[] = ['all_met', 'other_only_unmet', 'unmet'];

// 参加可否順序（ソート用）
const EVALUATION_STATUS_ORDER: Record<EvaluationStatus, number> = {
  all_met: 0,
  other_only_unmet: 1,
  unmet: 2,
};

// 着手状況オプション
const WORK_STATUS_OPTIONS: Extract<WorkStatus, 'in_progress' | 'completed'>[] = ['in_progress', 'completed'];

// 優先度オプション
const PRIORITY_OPTIONS: CompanyPriority[] = [1, 2, 3, 4, 5];

// 優先度順序（ソート用）
const PRIORITY_ORDER: Record<CompanyPriority, number> = {
  1: 1,
  2: 2,
  3: 3,
  4: 4,
  5: 5,
};

// 作業ステータス順序（ソート用）
const WORK_STATUS_ORDER: Record<Extract<WorkStatus, 'in_progress' | 'completed'>, number> = {
  in_progress: 0,
  completed: 1,
};

const normalizePriority = (value: number): CompanyPriority => {
  const rounded = Math.round(value);
  return (PRIORITY_OPTIONS.includes(rounded as CompanyPriority) ? rounded : 1) as CompanyPriority;
};

const normalizeWorkStatus = (value: string): Extract<WorkStatus, 'in_progress' | 'completed'> => {
  return value === 'completed' ? 'completed' : 'in_progress';
};

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

// 関連案件用表示条件パネル
interface RelatedConditionsPanelProps {
  searchQuery: string;
  onSearchChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  sortOption: SortOption | null;
  onSortChange: (option: SortOption | null) => void;
  filters: RelatedFilterState;
  onFilterChange: (filters: RelatedFilterState) => void;
  onClearAll: () => void;
  activeTab?: 'sort' | 'filter';
  onTabChange?: (tab: 'sort' | 'filter') => void;
}

function RelatedConditionsPanel({
  searchQuery,
  onSearchChange,
  sortOption,
  onSortChange,
  filters,
  onFilterChange,
  onClearAll,
  activeTab,
  onTabChange,
}: RelatedConditionsPanelProps) {
  const [internalTab, setInternalTab] = useState<'sort' | 'filter'>('sort');
  const [activeFilterTab, setActiveFilterTab] = useState(0);
  const mainTab = activeTab ?? internalTab;
  const setMainTab = (tab: 'sort' | 'filter') => {
    setInternalTab(tab);
    onTabChange?.(tab);
  };

  // フィルター件数
  const filterCounts = {
    status: filters.statuses.length,
    bidType: filters.bidTypes.length,
    category: filters.categories.length,
    prefecture: filters.prefectures.length,
    organization: filters.organizations.length,
  };
  const totalFilterCount = Object.values(filterCounts).reduce((a, b) => a + b, 0);
  const hasConditions = searchQuery.trim() || sortOption !== null || totalFilterCount > 0;

  // トグル関数
  const toggleStatus = (status: AnnouncementStatus) => {
    const newStatuses = filters.statuses.includes(status)
      ? filters.statuses.filter(s => s !== status)
      : [...filters.statuses, status];
    onFilterChange({ ...filters, statuses: newStatuses });
  };

  const toggleBidType = (bidType: string) => {
    const newBidTypes = filters.bidTypes.includes(bidType)
      ? filters.bidTypes.filter(b => b !== bidType)
      : [...filters.bidTypes, bidType];
    onFilterChange({ ...filters, bidTypes: newBidTypes });
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

  const toggleOrganization = (org: string) => {
    const newOrgs = filters.organizations.includes(org)
      ? filters.organizations.filter(o => o !== org)
      : [...filters.organizations, org];
    onFilterChange({ ...filters, organizations: newOrgs });
  };

  const toggleOrgRegion = (regionItems: string[]) => {
    const allSelected = regionItems.every(item => filters.organizations.includes(item));
    if (allSelected) {
      onFilterChange({
        ...filters,
        organizations: filters.organizations.filter(o => !regionItems.includes(o)),
      });
    } else {
      const newOrgs = new Set([...filters.organizations, ...regionItems]);
      onFilterChange({ ...filters, organizations: Array.from(newOrgs) });
    }
  };

  const getOrgRegionSelectionState = (regionItems: string[]): 'all' | 'partial' | 'none' => {
    const selectedCount = regionItems.filter(item => filters.organizations.includes(item)).length;
    if (selectedCount === 0) return 'none';
    if (selectedCount === regionItems.length) return 'all';
    return 'partial';
  };

  const sectionDivider = {
    borderBottom: `1px solid ${rightPanelColors.border}`,
    pb: 2.5,
    mb: 2.5,
  };

  // フィルターコンテンツをレンダリング
  const renderFilterContent = () => {
    const tabId = FILTER_TABS[activeFilterTab].id;

    switch (tabId) {
      case 'status':
        return (
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
            {STATUS_OPTIONS.map((status) => {
              const config = announcementStatusConfig[status];
              return (
                <FilterButton
                  key={status}
                  label={config.label}
                  selected={filters.statuses.includes(status)}
                  onClick={() => toggleStatus(status)}
                  color={config.color}
                  bgColor={config.bgColor}
                />
              );
            })}
          </Box>
        );

      case 'bidType':
        return (
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
            {bidTypes.map((bidType: BidType) => {
              const config = bidTypeConfig[bidType];
              return (
                <FilterButton
                  key={bidType}
                  label={config.label}
                  selected={filters.bidTypes.includes(bidType)}
                  onClick={() => toggleBidType(bidType)}
                  color={config.color}
                  bgColor={config.bgColor}
                />
              );
            })}
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
            {prefecturesByRegion.map((region) => {
              const selectionState = getPrefRegionSelectionState(region.prefectures);
              return (
                <Box key={region.region} sx={{ mb: 2 }}>
                  <button
                    onClick={() => togglePrefRegion(region.prefectures)}
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
                    {region.region}
                    <span style={{ fontSize: fontSizes.xs, color: colors.text.muted }}>
                      ({region.prefectures.filter(p => filters.prefectures.includes(p)).length}/{region.prefectures.length})
                    </span>
                  </button>
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
                    {region.prefectures.map((pref) => (
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

      case 'organization':
        return (
          <Box>
            {organizationGroupsByRegion.map((region) => {
              const selectionState = getOrgRegionSelectionState(region.items);
              return (
                <Box key={region.region} sx={{ mb: 2 }}>
                  <button
                    onClick={() => toggleOrgRegion(region.items)}
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
                    {region.region}
                    <span style={{ fontSize: fontSizes.xs, color: colors.text.muted }}>
                      ({region.items.filter(o => filters.organizations.includes(o)).length}/{region.items.length})
                    </span>
                  </button>
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
                    {region.items.map((org) => (
                      <FilterButton
                        key={org}
                        label={org}
                        selected={filters.organizations.includes(org)}
                        onClick={() => toggleOrganization(org)}
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

      {/* 検索 */}
      <Box sx={sectionDivider}>
        <TextField
          placeholder="検索..."
          value={searchQuery}
          onChange={onSearchChange}
          size="small"
          fullWidth
          sx={{
            '& .MuiOutlinedInput-root': {
              fontSize: fontSizes.sm,
              color: rightPanelColors.text,
              backgroundColor: rightPanelColors.inputBg,
              '& fieldset': { borderColor: rightPanelColors.inputBorder },
              '&:hover fieldset': { borderColor: `${colors.text.light}99` },
              '&.Mui-focused fieldset': { borderColor: colors.accent.blue },
            },
            '& .MuiInputBase-input::placeholder': { color: rightPanelColors.textMuted },
          }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon sx={{ ...iconStyles.medium, color: rightPanelColors.textMuted }} />
              </InputAdornment>
            ),
            endAdornment: searchQuery && (
              <InputAdornment position="end">
                <IconButton
                  size="small"
                  onClick={() => onSearchChange({ target: { value: '' } } as React.ChangeEvent<HTMLInputElement>)}
                  sx={{ color: rightPanelColors.textMuted }}
                >
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
            }}
          >
            <SortIcon sx={iconStyles.medium} />
            ソート
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
            }}
          >
            <FilterIcon sx={iconStyles.medium} />
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
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {SORT_FIELDS.map(({ field, label, ascLabel, descLabel }) => {
              const ascOption = `${field}_asc` as SortOption;
              const descOption = `${field}_desc` as SortOption;
              const isAsc = sortOption === ascOption;
              const isDesc = sortOption === descOption;
              const isActive = isAsc || isDesc;
              const buttonText = !isActive
                ? label
                : isAsc
                  ? `${label}：${ascLabel}↑`
                  : `${label}：${descLabel}↓`;

              return (
                <Box
                  component="button"
                  key={field}
                  onClick={() => {
                    if (!isActive) {
                      onSortChange(ascOption);
                    } else if (isAsc) {
                      onSortChange(descOption);
                    } else {
                      onSortChange(null);
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
                    },
                  }}
                >
                  {buttonText}
                </Box>
              );
            })}
          </Box>
        )}

        {/* フィルターコンテンツ */}
        {mainTab === 'filter' && (
          <Box>
            {/* カテゴリ選択ボタン（グリッド） */}
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
                      fontSize: fontSizes.xs,
                      fontWeight: isActive ? 600 : 500,
                      borderRadius: borderRadius.xs,
                      border: `1px solid ${isActive ? colors.accent.blue : rightPanelColors.inputBorder}`,
                      cursor: 'pointer',
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

            {/* フィルター詳細コンテンツ */}
            <Box sx={{ minHeight: 100 }}>
              {renderFilterContent()}
            </Box>
          </Box>
        )}
      </Box>
    </Box>
  );
}

// 着手企業用表示条件パネル
interface CompanyConditionsPanelProps {
  searchQuery: string;
  onSearchChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  sortOption: CompanySortOption | null;
  onSortChange: (option: CompanySortOption | null) => void;
  filters: CompanyFilterState;
  onFilterChange: (filters: CompanyFilterState) => void;
  onClearAll: () => void;
  activeTab?: 'sort' | 'filter';
  onTabChange?: (tab: 'sort' | 'filter') => void;
}

function CompanyConditionsPanel({
  searchQuery,
  onSearchChange,
  sortOption,
  onSortChange,
  filters,
  onFilterChange,
  onClearAll,
  activeTab,
  onTabChange,
}: CompanyConditionsPanelProps) {
  const [internalTab, setInternalTab] = useState<'sort' | 'filter'>('sort');
  const [activeFilterTab, setActiveFilterTab] = useState(0);
  const mainTab = activeTab ?? internalTab;
  const setMainTab = (tab: 'sort' | 'filter') => {
    setInternalTab(tab);
    onTabChange?.(tab);
  };

  // フィルター件数
  const filterCounts = {
    evaluationStatus: filters.evaluationStatuses.length,
    workStatus: filters.workStatuses.length,
    priority: filters.priorities.length,
  };
  const totalFilterCount = Object.values(filterCounts).reduce((a, b) => a + b, 0);
  const hasConditions = searchQuery.trim() || sortOption !== null || totalFilterCount > 0;

  // トグル関数
  const toggleEvaluationStatus = (status: EvaluationStatus) => {
    const newStatuses = filters.evaluationStatuses.includes(status)
      ? filters.evaluationStatuses.filter(s => s !== status)
      : [...filters.evaluationStatuses, status];
    onFilterChange({ ...filters, evaluationStatuses: newStatuses });
  };

  const toggleWorkStatus = (status: 'in_progress' | 'completed') => {
    const newStatuses = filters.workStatuses.includes(status)
      ? filters.workStatuses.filter(s => s !== status)
      : [...filters.workStatuses, status];
    onFilterChange({ ...filters, workStatuses: newStatuses });
  };

  const togglePriority = (priority: 1 | 2 | 3 | 4 | 5) => {
    const newPriorities = filters.priorities.includes(priority)
      ? filters.priorities.filter(p => p !== priority)
      : [...filters.priorities, priority];
    onFilterChange({ ...filters, priorities: newPriorities });
  };

  const sectionDivider = {
    borderBottom: `1px solid ${rightPanelColors.border}`,
    pb: 2.5,
    mb: 2.5,
  };

  // フィルターコンテンツをレンダリング
  const renderFilterContent = () => {
    const tabId = COMPANY_FILTER_TABS[activeFilterTab].id;

    switch (tabId) {
      case 'evaluationStatus':
        return (
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
            {EVALUATION_STATUS_OPTIONS.map((status) => {
              const config = evaluationStatusConfig[status];
              return (
                <FilterButton
                  key={status}
                  label={config.label}
                  selected={filters.evaluationStatuses.includes(status)}
                  onClick={() => toggleEvaluationStatus(status)}
                  color={config.color}
                  bgColor={config.bgColor}
                />
              );
            })}
          </Box>
        );

      case 'workStatus':
        return (
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
            {WORK_STATUS_OPTIONS.map((status) => {
              const config = workStatusConfig[status];
              return (
                <FilterButton
                  key={status}
                  label={config.label}
                  selected={filters.workStatuses.includes(status)}
                  onClick={() => toggleWorkStatus(status)}
                  color={config.color}
                  bgColor={`${config.color}26`}
                />
              );
            })}
          </Box>
        );

      case 'priority':
        return (
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
            {PRIORITY_OPTIONS.map((priority) => {
              const config = priorityColors[priority];
              return (
                <FilterButton
                  key={priority}
                  label={priorityLabels[priority]}
                  selected={filters.priorities.includes(priority)}
                  onClick={() => togglePriority(priority)}
                  color={config.color}
                  bgColor={config.bgColor}
                />
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

      {/* 検索 */}
      <Box sx={sectionDivider}>
        <TextField
          placeholder="企業名で検索..."
          value={searchQuery}
          onChange={onSearchChange}
          size="small"
          fullWidth
          sx={{
            '& .MuiOutlinedInput-root': {
              fontSize: fontSizes.sm,
              color: rightPanelColors.text,
              backgroundColor: rightPanelColors.inputBg,
              '& fieldset': { borderColor: rightPanelColors.inputBorder },
              '&:hover fieldset': { borderColor: `${colors.text.light}99` },
              '&.Mui-focused fieldset': { borderColor: colors.accent.blue },
            },
            '& .MuiInputBase-input::placeholder': { color: rightPanelColors.textMuted },
          }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon sx={{ ...iconStyles.medium, color: rightPanelColors.textMuted }} />
              </InputAdornment>
            ),
            endAdornment: searchQuery && (
              <InputAdornment position="end">
                <IconButton
                  size="small"
                  onClick={() => onSearchChange({ target: { value: '' } } as React.ChangeEvent<HTMLInputElement>)}
                  sx={{ color: rightPanelColors.textMuted }}
                >
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
            }}
          >
            <SortIcon sx={iconStyles.medium} />
            ソート
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
            }}
          >
            <FilterIcon sx={iconStyles.medium} />
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
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {COMPANY_SORT_FIELDS.map(({ field, label, ascLabel, descLabel }) => {
              const ascOption = `${field}_asc` as CompanySortOption;
              const descOption = `${field}_desc` as CompanySortOption;
              const isAsc = sortOption === ascOption;
              const isDesc = sortOption === descOption;
              const isActive = isAsc || isDesc;
              const buttonText = !isActive
                ? label
                : isAsc
                  ? `${label}：${ascLabel}↑`
                  : `${label}：${descLabel}↓`;

              return (
                <Box
                  component="button"
                  key={field}
                  onClick={() => {
                    if (!isActive) {
                      onSortChange(ascOption);
                    } else if (isAsc) {
                      onSortChange(descOption);
                    } else {
                      onSortChange(null);
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
                    },
                  }}
                >
                  {buttonText}
                </Box>
              );
            })}
          </Box>
        )}

        {/* フィルターコンテンツ */}
        {mainTab === 'filter' && (
          <Box>
            {/* カテゴリ選択ボタン（グリッド） */}
            <Box sx={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 0.75,
              mb: 2,
              pb: 2,
              borderBottom: `1px solid ${rightPanelColors.border}`
            }}>
              {COMPANY_FILTER_TABS.map((tab, index) => {
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
                      fontSize: fontSizes.xs,
                      fontWeight: isActive ? 600 : 500,
                      borderRadius: borderRadius.xs,
                      border: `1px solid ${isActive ? colors.accent.blue : rightPanelColors.inputBorder}`,
                      cursor: 'pointer',
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

            {/* フィルター詳細コンテンツ */}
            <Box sx={{ minHeight: 100 }}>
              {renderFilterContent()}
            </Box>
          </Box>
        )}
      </Box>
    </Box>
  );
}


// ナビゲーション追跡用
const NAV_TRACKING_KEY = 'lastVisitedPath';

export default function AnnouncementDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const [activeTab, setActiveTab] = useState(0);
  const { rightPanelOpen, toggleRightPanel, closeRightPanel, isMobile } = useSidebar();
  const [conditionTab, setConditionTab] = useState<'sort' | 'filter'>('sort');

  // 詳細ページのパスを保存（一覧に戻った時のページ復元用）
  useEffect(() => {
    try {
      sessionStorage.setItem(NAV_TRACKING_KEY, location.pathname);
    } catch { /* ignore */ }
  }, [location.pathname]);

  // 関連案件用の状態
  const [relatedSearchQuery, setRelatedSearchQuery] = useState('');
  const [relatedSortOption, setRelatedSortOption] = useState<SortOption | null>(null);
  const [relatedFilters, setRelatedFilters] = useState<RelatedFilterState>({
    statuses: [],
    bidTypes: [],
    categories: [],
    prefectures: [],
    organizations: [],
  });
  const [relatedPage, setRelatedPage] = useState(0);
  const relatedPageSize = 25;

  // 着手企業用の状態
  const [companySearchQuery, setCompanySearchQuery] = useState('');
  const [companySortOption, setCompanySortOption] = useState<CompanySortOption | null>(null);
  const [companyFilters, setCompanyFilters] = useState<CompanyFilterState>({
    evaluationStatuses: [],
    workStatuses: [],
    priorities: [],
  });
  const [companyPage, setCompanyPage] = useState(0);
  const companyPageSize = 25;
  const [progressingCompanies, setProgressingCompanies] = useState<ProgressingCompany[]>([]);
  const [isProgressingLoading, setIsProgressingLoading] = useState(false);

  // API からデータ取得
  const [announcement, setAnnouncement] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchAnnouncement = async () => {
      if (!id) return;
      setLoading(true);
      setError(null);
      try {
        // id から ann- プレフィックスを除去して公告番号を取得
        const announcementNo = id.startsWith('ann-') ? id.substring(4) : id;
        const response = await fetch(getApiUrl(`/api/announcements/${announcementNo}`));
        if (!response.ok) {
          throw new Error(`Failed to fetch announcement: ${response.status}`);
        }
        const data = await response.json();
        setAnnouncement(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(false);
      }
    };
    fetchAnnouncement();
  }, [id]);

  useEffect(() => {
    if (!announcement || !announcement.announcementNo) {
      setProgressingCompanies([]);
      return;
    }

    let isCancelled = false;

    const fetchProgressingCompanies = async () => {
      setIsProgressingLoading(true);
      try {
        const response = await fetch(
          getApiUrl(`/api/announcements/${announcement.announcementNo}/progressing-companies`)
        );
        if (!response.ok) {
          throw new Error(`Failed to fetch progressing companies: ${response.status}`);
        }
        const data = await response.json();
        if (isCancelled) return;
        const mapped = Array.isArray(data)
          ? data.map((row: any) => ({
              companyId: String(row.companyId ?? ''),
              companyName: row.companyName ?? '',
              branchId: String(row.branchId ?? ''),
              branchName: row.branchName ?? '',
              priority: normalizePriority(Number(row.priority ?? 1)),
              workStatus: normalizeWorkStatus(row.workStatus ?? ''),
              evaluationId: String(row.evaluationId ?? ''),
              evaluationStatus: (row.evaluationStatus ?? 'unmet') as EvaluationStatus,
            }))
          : [];
        setProgressingCompanies(mapped);
      } catch (err) {
        console.error('Failed to fetch progressing companies:', err);
        if (!isCancelled) {
          setProgressingCompanies([]);
        }
      } finally {
        if (!isCancelled) {
          setIsProgressingLoading(false);
        }
      }
    };

    fetchProgressingCompanies();

    return () => {
      isCancelled = true;
    };
  }, [announcement?.announcementNo]);

  // サイドパネル制御
  const handleOpenWithTab = useCallback((tab: 'sort' | 'filter') => {
    setConditionTab(tab);
    if (!rightPanelOpen) {
      toggleRightPanel();
    }
  }, [rightPanelOpen, toggleRightPanel]);

  // 検索変更ハンドラ
  const handleRelatedSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setRelatedSearchQuery(e.target.value);
    setRelatedPage(0);
  }, []);

  // 企業検索変更ハンドラ
  const handleCompanySearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setCompanySearchQuery(e.target.value);
    setCompanyPage(0);
  }, []);

  // 関連案件のベースデータ（メモ化）
  // TODO: 関連案件APIを実装後に復活
  const baseRelatedAnnouncements = useMemo((): any[] => {
    return [];
  }, [announcement]);

  // フィルタリング・ソート済み関連案件
  const filteredRelatedAnnouncements = useMemo(() => {
    let filtered = baseRelatedAnnouncements;

    // 検索フィルター
    if (relatedSearchQuery) {
      const query = relatedSearchQuery.toLowerCase();
      filtered = filtered.filter(
        (a) =>
          a.title.toLowerCase().includes(query) ||
          a.category.toLowerCase().includes(query) ||
          a.workLocation.toLowerCase().includes(query)
      );
    }

    // フィルター適用
    filtered = filtered.filter((a) => {
      if (relatedFilters.statuses.length > 0 && !relatedFilters.statuses.includes(a.status)) return false;
      if (relatedFilters.bidTypes.length > 0 && (!a.bidType || !relatedFilters.bidTypes.includes(a.bidType))) return false;
      if (relatedFilters.categories.length > 0 && !relatedFilters.categories.includes(a.category)) return false;
      if (relatedFilters.prefectures.length > 0) {
        const prefecture = a.workLocation?.match(/^(.+?[都道府県])/)?.[1] || '';
        if (!relatedFilters.prefectures.includes(prefecture)) return false;
      }
      if (relatedFilters.organizations.length > 0) {
        const orgGroup = getOrganizationGroup(a.organization);
        if (!relatedFilters.organizations.includes(orgGroup)) return false;
      }
      return true;
    });

    // ソート適用
    if (!relatedSortOption) return filtered;

    return [...filtered].sort((a, b) => {
      switch (relatedSortOption) {
        case 'deadline_asc':
          return new Date(a.deadline).getTime() - new Date(b.deadline).getTime();
        case 'deadline_desc':
          return new Date(b.deadline).getTime() - new Date(a.deadline).getTime();
        case 'publish_asc':
          return new Date(a.publishDate).getTime() - new Date(b.publishDate).getTime();
        case 'publish_desc':
          return new Date(b.publishDate).getTime() - new Date(a.publishDate).getTime();
        case 'status_asc':
          return (STATUS_ORDER[a.status as AnnouncementStatus] || 0) - (STATUS_ORDER[b.status as AnnouncementStatus] || 0);
        case 'status_desc':
          return (STATUS_ORDER[b.status as AnnouncementStatus] || 0) - (STATUS_ORDER[a.status as AnnouncementStatus] || 0);
        case 'prefecture_asc': {
          const prefA = a.workLocation?.match(/^(.+?[都道府県])/)?.[1] || '';
          const prefB = b.workLocation?.match(/^(.+?[都道府県])/)?.[1] || '';
          return prefA.localeCompare(prefB, 'ja');
        }
        case 'prefecture_desc': {
          const prefA = a.workLocation?.match(/^(.+?[都道府県])/)?.[1] || '';
          const prefB = b.workLocation?.match(/^(.+?[都道府県])/)?.[1] || '';
          return prefB.localeCompare(prefA, 'ja');
        }
        default:
          return 0;
      }
    });
  }, [baseRelatedAnnouncements, relatedSearchQuery, relatedFilters, relatedSortOption]);

  // ページネーション済み関連案件
  const paginatedRelatedAnnouncements = useMemo(() => {
    const start = relatedPage * relatedPageSize;
    return filteredRelatedAnnouncements.slice(start, start + relatedPageSize);
  }, [filteredRelatedAnnouncements, relatedPage]);

  // 関連データ（早期returnの前に計算）
  // フィルタリング・ソート済み着手企業
  const filteredProgressingCompanies = useMemo<ProgressingCompany[]>(() => {
    let filtered = progressingCompanies;

    // 検索フィルター
    if (companySearchQuery) {
      const query = companySearchQuery.toLowerCase();
      filtered = filtered.filter(
        (c) =>
          c.companyName.toLowerCase().includes(query) ||
          c.branchName.toLowerCase().includes(query)
      );
    }

    // フィルター適用
    filtered = filtered.filter((c) => {
      if (companyFilters.evaluationStatuses.length > 0 && !companyFilters.evaluationStatuses.includes(c.evaluationStatus)) return false;
      if (companyFilters.workStatuses.length > 0 && !companyFilters.workStatuses.includes(c.workStatus)) return false;
      if (companyFilters.priorities.length > 0 && !companyFilters.priorities.includes(c.priority)) return false;
      return true;
    });

    // ソート適用
    if (!companySortOption) return filtered;

    return [...filtered].sort((a, b) => {
      switch (companySortOption) {
        case 'priority_asc':
          return PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
        case 'priority_desc':
          return PRIORITY_ORDER[b.priority] - PRIORITY_ORDER[a.priority];
        case 'evaluationStatus_asc':
          return EVALUATION_STATUS_ORDER[a.evaluationStatus] - EVALUATION_STATUS_ORDER[b.evaluationStatus];
        case 'evaluationStatus_desc':
          return EVALUATION_STATUS_ORDER[b.evaluationStatus] - EVALUATION_STATUS_ORDER[a.evaluationStatus];
        case 'workStatus_asc':
          return WORK_STATUS_ORDER[a.workStatus] - WORK_STATUS_ORDER[b.workStatus];
        case 'workStatus_desc':
          return WORK_STATUS_ORDER[b.workStatus] - WORK_STATUS_ORDER[a.workStatus];
        case 'company_asc':
          return a.companyName.localeCompare(b.companyName, 'ja');
        case 'company_desc':
          return b.companyName.localeCompare(a.companyName, 'ja');
        default:
          return 0;
      }
    });
  }, [progressingCompanies, companySearchQuery, companyFilters, companySortOption]);

  // ページネーション済み着手企業
  const paginatedProgressingCompanies = useMemo<ProgressingCompany[]>(() => {
    const start = companyPage * companyPageSize;
    return filteredProgressingCompanies.slice(start, start + companyPageSize);
  }, [filteredProgressingCompanies, companyPage, companyPageSize]);

  if (loading) {
    return (
      <Box sx={{ p: 4, textAlign: 'center' }}>
        <Typography>読み込み中...</Typography>
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{ p: 4, textAlign: 'center', color: colors.status.error.main }}>
        <Typography>{error}</Typography>
      </Box>
    );
  }

  if (!announcement) {
    return (
      <NotFoundView
        message="指定された入札公告が見つかりません。"
        backLabel="一覧に戻る"
        onBack={() => navigate('/announcements')}
      />
    );
  }

  const statusConfig = announcementStatusConfig[announcement.status as AnnouncementStatus];

  // スケジュールデータ
  const scheduleItems = [
    { label: '公告日', date: announcement.publishDate },
    { label: '説明書交付開始', date: announcement.explanationStartDate },
    { label: '説明書交付終了', date: announcement.explanationEndDate },
    { label: '申請受付開始', date: announcement.applicationStartDate },
    { label: '申請受付終了', date: announcement.applicationEndDate },
    { label: '入札開始', date: announcement.bidStartDate },
    { label: '入札締切', date: announcement.bidEndDate, highlight: true },
  ];

  // タブインデックス計算用（資料タブが条件付きのため）
  const hasDocuments = announcement.documents && announcement.documents.length > 0;
  const tabIndex = {
    basicInfo: 0,
    documents: hasDocuments ? 1 : -1,
    related: hasDocuments ? 2 : 1,
    companies: hasDocuments ? 3 : 2,
  };

  return (
    <Box sx={{ height: '100vh', bgcolor: colors.page.background, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <Box sx={{ ...pageStyles.contentArea, maxWidth: '100%', py: 3, display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>

        {/* ヘッダー：他ページと統一 */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'stretch', mb: 2 }}>
          <Box
            sx={{
              pl: 2,
              borderLeft: '4px solid',
              borderColor: statusConfig.color,
            }}
          >
            {/* ステータス類 */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2.5, mb: 0.5, flexWrap: 'wrap' }}>
              {/* 一覧に戻る */}
              <Button
                size="small"
                startIcon={<ArrowBackIcon sx={iconStyles.small} />}
                onClick={() => navigate('/announcements')}
                sx={{
                  color: colors.text.muted,
                  fontWeight: 500,
                  fontSize: fontSizes.sm,
                  textTransform: 'none',
                  px: 1,
                  py: 0.25,
                  minWidth: 'auto',
                  '&:hover': { backgroundColor: colors.border.light },
                }}
              >
                一覧に戻る
              </Button>

              {/* ステータス */}
              <Typography
                sx={{
                  fontSize: fontSizes.base,
                  fontWeight: 700,
                  color: statusConfig.color,
                }}
              >
                {statusConfig.label}
              </Typography>

              <Typography sx={{ color: colors.border.dark }}>|</Typography>

              {/* カテゴリ */}
              <Typography sx={{ fontSize: fontSizes.base, fontWeight: 700, color: colors.primary.dark }}>
                {announcement.category}
              </Typography>

              <Typography sx={{ color: colors.border.dark }}>|</Typography>

              {/* 入札形式 */}
              <Typography sx={{ fontSize: fontSizes.base, fontWeight: 700, color: colors.primary.dark }}>
                {announcement.bidType ? bidTypeConfig[announcement.bidType as BidType].label : '-'}
              </Typography>
            </Box>

            {/* タイトル */}
            <Typography sx={pageStyles.detailPageTitle}>
              {announcement.title}
            </Typography>
          </Box>

          {/* 右上No */}
          <Typography sx={{ fontSize: fontSizes.md, color: colors.text.light, flexShrink: 0, ml: 2 }}>
            No. {String(announcement.no).padStart(8, '0')}
          </Typography>
        </Box>

        {/* メインカード + サイドパネル */}
        <Box sx={{ flex: 1, display: 'flex', minHeight: 0 }}>
          <Paper
            sx={{
              borderRadius: borderRadius.xs,
              overflow: 'hidden',
              boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            {/* タブ */}
            <Box sx={{ borderBottom: `1px solid ${colors.border.main}`, backgroundColor: colors.text.white }}>
              <Tabs
                value={activeTab}
                onChange={(_, v) => setActiveTab(v)}
                sx={{
                  px: 2,
                  '& .MuiTabs-indicator': { backgroundColor: colors.primary.main, height: 2 },
                  '& .MuiTab-root': {
                    textTransform: 'none',
                    fontSize: fontSizes.md,
                    fontWeight: 500,
                    color: colors.text.muted,
                    minWidth: 'auto',
                    px: 2,
                    py: 1.5,
                    '&.Mui-selected': { color: colors.primary.main, fontWeight: 600 },
                  },
                }}
              >
                <Tab label="基本情報" />
                {announcement.documents && announcement.documents.length > 0 && <Tab label="資料" />}
                <Tab label={`関連案件 (${baseRelatedAnnouncements.length})`} />
                <Tab label={`着手企業 (${progressingCompanies.length})`} />
              </Tabs>
            </Box>

            {/* タブコンテンツ */}
            <Box sx={{ flex: 1, overflow: 'auto', backgroundColor: colors.background.hover, display: 'flex', flexDirection: 'column' }}>

            {/* 基本情報タブ */}
            {activeTab === tabIndex.basicInfo && (
              <Box sx={{ p: 2.5 }}>
                {/* 2カラムレイアウト */}
                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2.5 }}>
                  {/* 左カラム */}
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                    {/* 案件情報 */}
                    <Accordion defaultExpanded sx={{ boxShadow: 'none', border: `1px solid ${colors.border.main}`, borderRadius: `${borderRadius.xs} !important`, '&:before': { display: 'none' }, '&.Mui-expanded': { margin: 0 } }}>
                      <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ minHeight: 48, borderBottom: `1px solid ${colors.border.main}`, '&.Mui-expanded': { minHeight: 48 } }}>
                        <Typography sx={{ fontSize: fontSizes.base, fontWeight: 600, color: colors.primary.main }}>案件情報</Typography>
                      </AccordionSummary>
                      <AccordionDetails sx={{ pt: 2, pb: 2, px: 2.5 }}>
                        <InfoRow label="発注機関" value={announcement.organization} icon={<OrdererIcon sx={{ ...iconStyles.small, color: colors.text.light }} />} />
                        <InfoRow label="工種" value={announcement.category} icon={<CategoryIcon sx={{ ...iconStyles.small, color: colors.text.light }} />} />
                        <InfoRow label="入札形式" value={announcement.bidType ? bidTypeConfig[announcement.bidType as BidType].label : '-'} icon={<BidTypeIcon sx={{ ...iconStyles.small, color: colors.text.light }} />} />
                        <InfoRow label="履行場所" value={announcement.workLocation} icon={<LocationIcon sx={{ ...iconStyles.small, color: colors.text.light }} />} />
                        <InfoRow label="予想金額" value={formatAmountInManYen(announcement.estimatedAmountMin, announcement.estimatedAmountMax)} icon={<CurrencyYenIcon sx={{ ...iconStyles.small, color: colors.text.light }} />} />
                      </AccordionDetails>
                    </Accordion>

                    {/* 担当部署 */}
                    <Accordion defaultExpanded sx={{ boxShadow: 'none', border: `1px solid ${colors.border.main}`, borderRadius: `${borderRadius.xs} !important`, '&:before': { display: 'none' }, '&.Mui-expanded': { margin: 0 } }}>
                      <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ minHeight: 48, borderBottom: `1px solid ${colors.border.main}`, '&.Mui-expanded': { minHeight: 48 } }}>
                        <Typography sx={{ fontSize: fontSizes.base, fontWeight: 600, color: colors.primary.main }}>担当部署</Typography>
                      </AccordionSummary>
                      <AccordionDetails sx={{ pt: 2, pb: 2, px: 2.5 }}>
                        <InfoRow label="部署名" value={announcement.department.name} icon={<OrdererIcon sx={{ ...iconStyles.small, color: colors.text.light }} />} />
                        <InfoRow label="担当者" value={announcement.department.contactPerson} icon={<PersonIcon sx={{ ...iconStyles.small, color: colors.text.light }} />} />
                        <InfoRow label="住所" value={`〒${announcement.department.postalCode} ${announcement.department.address}`} icon={<LocationIcon sx={{ ...iconStyles.small, color: colors.text.light }} />} />
                        <InfoRow label="電話" value={announcement.department.phone} icon={<PhoneIcon sx={{ ...iconStyles.small, color: colors.text.light }} />} />
                        <InfoRow label="FAX" value={announcement.department.fax} icon={<FaxIcon sx={{ ...iconStyles.small, color: colors.text.light }} />} />
                        <InfoRow label="メール" value={announcement.department.email} icon={<EmailIcon sx={{ ...iconStyles.small, color: colors.text.light }} />} />
                      </AccordionDetails>
                    </Accordion>

                    {/* 資料リンク */}
                    <Accordion defaultExpanded sx={{ boxShadow: 'none', border: `1px solid ${colors.border.main}`, borderRadius: `${borderRadius.xs} !important`, '&:before': { display: 'none' }, '&.Mui-expanded': { margin: 0 } }}>
                      <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ minHeight: 48, borderBottom: `1px solid ${colors.border.main}`, '&.Mui-expanded': { minHeight: 48 } }}>
                        <Typography sx={{ fontSize: fontSizes.base, fontWeight: 600, color: colors.primary.main }}>資料リンク</Typography>
                      </AccordionSummary>
                      <AccordionDetails sx={{ pt: 2, pb: 2, px: 2.5 }}>
                        {announcement.documents && announcement.documents.length > 0 ? (
                          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                            {announcement.documents.map((doc: any) => {
                              const typeConfig = getDocumentTypeConfig(doc.type);
                              const formatConfig = getFileFormatConfig(doc.fileFormat);
                              return (
                                <Button
                                  key={doc.id}
                                  variant="outlined"
                                  size="small"
                                  endIcon={<OpenInNewIcon sx={iconStyles.small} />}
                                  component="a"
                                  href={doc.url || '#'}
                                  target="_blank"
                                  disabled={!doc.url}
                                  sx={{ borderRadius: borderRadius.xs, borderColor: formatConfig.color, color: doc.url ? formatConfig.color : colors.text.light, fontWeight: 500, fontSize: fontSizes.md, textTransform: 'none', justifyContent: 'space-between' }}
                                >
                                  {typeConfig.label}（{formatConfig.label}）
                                </Button>
                              );
                            })}
                          </Box>
                        ) : (
                          <Typography sx={{ fontSize: fontSizes.md, color: colors.text.light }}>
                            資料がありません
                          </Typography>
                        )}
                      </AccordionDetails>
                    </Accordion>
                  </Box>

                  {/* 右カラム */}
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                    {/* 落札情報 */}
                    <Accordion defaultExpanded sx={{ boxShadow: 'none', border: announcement.status === 'closed' && announcement.actualAmount ? '1px solid #a7f3d0' : `1px solid ${colors.border.main}`, borderRadius: `${borderRadius.xs} !important`, '&:before': { display: 'none' }, '&.Mui-expanded': { margin: 0 } }}>
                      <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ minHeight: 48, borderBottom: `1px solid ${colors.border.main}`, '&.Mui-expanded': { minHeight: 48 } }}>
                        <Typography sx={{ fontSize: fontSizes.base, fontWeight: 600, color: announcement.status === 'closed' && announcement.actualAmount ? colors.status.success.main : colors.primary.main }}>落札情報</Typography>
                      </AccordionSummary>
                      <AccordionDetails sx={{ pt: 2, pb: 2, px: 2.5 }}>
                        <Box sx={{ display: 'flex', gap: 4, flexWrap: 'wrap', mb: (announcement.competingCompanies?.length || progressingCompanies.length > 0) ? 2 : 0 }}>
                          <Box>
                            <Typography sx={{ fontSize: fontSizes.md, color: colors.text.muted, mb: 0.25 }}>見積予想金額</Typography>
                            <Typography sx={{ fontSize: fontSizes.lg, fontWeight: 700, color: colors.text.secondary }}>
                              {formatAmountInManYen(announcement.estimatedAmountMin, announcement.estimatedAmountMax)}
                            </Typography>
                          </Box>
                          {announcement.status === 'closed' && announcement.actualAmount && (
                            <>
                              <Box>
                                <Typography sx={{ fontSize: fontSizes.md, color: colors.text.muted, mb: 0.25 }}>落札金額</Typography>
                                <Typography sx={{ fontSize: fontSizes.lg, fontWeight: 700, color: colors.status.success.main }}>
                                  {(announcement.actualAmount / 10000).toLocaleString()}万円
                                </Typography>
                              </Box>
                              {announcement.winningCompanyName && (
                                <Box>
                                  <Typography sx={{ fontSize: fontSizes.md, color: colors.text.muted, mb: 0.25 }}>落札企業</Typography>
                                  <Typography sx={{ fontSize: fontSizes.base, fontWeight: 600, color: colors.text.secondary }}>
                                    {announcement.winningCompanyName}
                                  </Typography>
                                </Box>
                              )}
                            </>
                          )}
                        </Box>
                        {/* 競争参加企業 */}
                        {(announcement.competingCompanies?.length || progressingCompanies.length > 0) && (() => {
                          const sortedCompetitors = [...(announcement.competingCompanies || [])].sort((a, b) => {
                            if (a.isWinner && !b.isWinner) return -1;
                            if (!a.isWinner && b.isWinner) return 1;
                            return 0;
                          });
                          const formatBidAmount = (amount: number | null | undefined) => {
                            if (amount === null || amount === undefined) return '-';
                            return `${(amount / 10000).toLocaleString()}万`;
                          };
                          return (
                            <Box sx={{ pt: 2, borderTop: `1px solid ${colors.border.light}` }}>
                              <Typography sx={{ fontSize: fontSizes.md, color: colors.text.muted, mb: 1.5 }}>
                                競争参加企業 ({sortedCompetitors.length + progressingCompanies.length}社)
                              </Typography>
                              {/* ヘッダー */}
                              <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 110px 110px 110px', gap: 1, mb: 1, pb: 1, borderBottom: `1px solid ${colors.border.main}` }}>
                                <Typography sx={{ fontSize: fontSizes.sm, color: colors.text.light, fontWeight: 500 }}>企業名</Typography>
                                <Typography sx={{ fontSize: fontSizes.sm, color: colors.text.light, fontWeight: 500, textAlign: 'right' }}>1回目</Typography>
                                <Typography sx={{ fontSize: fontSizes.sm, color: colors.text.light, fontWeight: 500, textAlign: 'right' }}>2回目</Typography>
                                <Typography sx={{ fontSize: fontSizes.sm, color: colors.text.light, fontWeight: 500, textAlign: 'right' }}>3回目</Typography>
                              </Box>
                              {/* 企業一覧 */}
                              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
                                {sortedCompetitors.map((company, idx) => (
                                  <Box key={idx} sx={{ display: 'grid', gridTemplateColumns: '1fr 110px 110px 110px', gap: 1, alignItems: 'center', py: 0.5 }}>
                                    <Typography sx={{ fontSize: fontSizes.md, fontWeight: company.isWinner ? 600 : 400, color: company.isWinner ? colors.status.success.main : colors.text.secondary }}>
                                      {company.name}
                                    </Typography>
                                    <Typography sx={{ fontSize: fontSizes.md, color: colors.text.muted, textAlign: 'right', whiteSpace: 'nowrap' }}>
                                      {formatBidAmount(company.bidAmounts?.[0])}
                                    </Typography>
                                    <Typography sx={{ fontSize: fontSizes.md, color: colors.text.muted, textAlign: 'right', whiteSpace: 'nowrap' }}>
                                      {formatBidAmount(company.bidAmounts?.[1])}
                                    </Typography>
                                    <Typography sx={{ fontSize: fontSizes.md, color: company.isWinner ? colors.status.success.main : colors.text.muted, fontWeight: company.isWinner ? 600 : 400, textAlign: 'right', whiteSpace: 'nowrap' }}>
                                      {formatBidAmount(company.bidAmounts?.[2])}
                                    </Typography>
                                  </Box>
                                ))}
                                {progressingCompanies.map((company) => (
                                  <Box
                                    key={`${company.companyId}-${company.branchId}`}
                                    onClick={() => navigate(`/detail/${company.evaluationId}`)}
                                    sx={{ display: 'grid', gridTemplateColumns: '1fr 110px 110px 110px', gap: 1, alignItems: 'center', py: 0.5, cursor: 'pointer', '&:hover': { backgroundColor: colors.background.hover, mx: -1, px: 1, borderRadius: borderRadius.xs } }}
                                  >
                                    <Typography sx={{ fontSize: fontSizes.md, fontWeight: 500, color: colors.accent.blue }}>{company.companyName}</Typography>
                                    <Typography sx={{ fontSize: fontSizes.md, color: colors.text.light, textAlign: 'right' }}>-</Typography>
                                    <Typography sx={{ fontSize: fontSizes.md, color: colors.text.light, textAlign: 'right' }}>-</Typography>
                                    <Typography sx={{ fontSize: fontSizes.md, color: colors.text.light, textAlign: 'right' }}>-</Typography>
                                  </Box>
                                ))}
                              </Box>
                            </Box>
                          );
                        })()}
                      </AccordionDetails>
                    </Accordion>

                    {/* スケジュール */}
                    <Accordion defaultExpanded sx={{ boxShadow: 'none', border: `1px solid ${colors.border.main}`, borderRadius: `${borderRadius.xs} !important`, '&:before': { display: 'none' }, '&.Mui-expanded': { margin: 0 } }}>
                      <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ minHeight: 48, borderBottom: `1px solid ${colors.border.main}`, '&.Mui-expanded': { minHeight: 48 } }}>
                        <Typography sx={{ fontSize: fontSizes.base, fontWeight: 600, color: colors.primary.main }}>スケジュール</Typography>
                      </AccordionSummary>
                      <AccordionDetails sx={{ pt: 1, pb: 0, px: 0 }}>
                        {scheduleItems.map((item, index) => (
                          <Box
                            key={item.label}
                            sx={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              px: 2.5,
                              py: 1.25,
                              borderBottom: index < scheduleItems.length - 1 ? `1px solid ${colors.border.light}` : 'none',
                              backgroundColor: item.highlight ? colors.status.info.bg : 'transparent',
                            }}
                          >
                            <Typography sx={{ fontSize: fontSizes.md, color: item.highlight ? colors.primary.main : colors.text.muted, fontWeight: item.highlight ? 600 : 400 }}>
                              {item.label}
                            </Typography>
                            <Typography sx={{ fontSize: fontSizes.md, color: item.highlight ? colors.primary.main : colors.text.secondary, fontWeight: item.highlight ? 700 : 500 }}>
                              {item.date}
                            </Typography>
                          </Box>
                        ))}
                      </AccordionDetails>
                    </Accordion>
                  </Box>
                </Box>
              </Box>
            )}

            {/* 着手企業タブ */}
            {activeTab === tabIndex.companies && (
              <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                {/* スクロール可能なカードグリッド */}
                <Box sx={{ flex: 1, overflow: 'auto', p: 2.5 }}>
                  {isProgressingLoading ? (
                    <Box sx={{ p: 4, textAlign: 'center', color: colors.text.light }}>
                      データを読み込み中です...
                    </Box>
                  ) : paginatedProgressingCompanies.length > 0 ? (
                    <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 1.5 }}>
                      {paginatedProgressingCompanies.map((company) => {
                        const wsConfig = workStatusConfig[company.workStatus];
                        const pConfig = priorityColors[company.priority];
                        const esConfig = evaluationStatusConfig[company.evaluationStatus];
                        return (
                          <Box
                            key={`${company.companyId}-${company.branchId}`}
                            onClick={() => navigate(`/detail/${company.evaluationId}`)}
                            sx={{
                              position: 'relative',
                              backgroundColor: colors.text.white,
                              borderRadius: borderRadius.xs,
                              border: `1px solid ${colors.border.main}`,
                              p: 2,
                              cursor: 'pointer',
                              transition: 'all 0.2s ease',
                              '&:hover': { borderColor: 'rgba(59, 130, 246, 0.4)', boxShadow: '0 4px 20px rgba(0, 0, 0, 0.08)' },
                              '&::before': {
                                content: '""',
                                position: 'absolute',
                                left: 0,
                                top: 0,
                                bottom: 0,
                                width: '3px',
                                backgroundColor: wsConfig.color,
                                borderRadius: `${borderRadius.xs} 0 0 ${borderRadius.xs}`,
                              },
                            }}
                          >
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1, flexWrap: 'wrap' }}>
                              <Typography sx={{ fontSize: fontSizes.xs, fontWeight: 600, color: wsConfig.color }}>{wsConfig.label}</Typography>
                              <Typography sx={{ fontSize: fontSizes.xs, fontWeight: 600, color: esConfig.color }}>{esConfig.label}</Typography>
                              <Typography sx={{ fontSize: fontSizes.xs, fontWeight: 600, color: pConfig.color, ml: 'auto' }}>{priorityLabels[company.priority]}</Typography>
                            </Box>
                            <Typography sx={{ fontWeight: 600, fontSize: fontSizes.md, color: colors.text.secondary, mb: 0.5, lineHeight: 1.5 }}>{company.companyName}</Typography>
                            <Typography sx={{ fontSize: fontSizes.xs, color: colors.text.muted }}>{company.branchName}</Typography>
                          </Box>
                        );
                      })}
                    </Box>
                  ) : (
                    <Box sx={{ p: 4, textAlign: 'center', color: colors.text.light }}>
                      {progressingCompanies.length > 0 ? '条件に一致する企業がありません' : '着手企業がありません'}
                    </Box>
                  )}
                </Box>
                {/* フッター（ページネーション） */}
                <Box sx={{ backgroundColor: colors.text.white, borderTop: `1px solid ${colors.border.main}`, px: 2 }}>
                  <CustomPagination
                    page={companyPage}
                    pageSize={companyPageSize}
                    rowCount={filteredProgressingCompanies.length}
                    onPageChange={setCompanyPage}
                    onPageSizeChange={() => {}}
                  />
                </Box>
              </Box>
            )}

            {/* 関連案件タブ */}
            {activeTab === tabIndex.related && (
              <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                {/* スクロール可能なカードグリッド */}
                <Box sx={{ flex: 1, overflow: 'auto', p: 2.5 }}>
                  {paginatedRelatedAnnouncements.length > 0 ? (
                    <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 1.5 }}>
                      {/* 関連案件カード */}
                      {paginatedRelatedAnnouncements.map((ann) => {
                        const annStatusConfig = announcementStatusConfig[ann.status as AnnouncementStatus];
                        const bidType = ann.bidType ? bidTypeConfig[ann.bidType as BidType] : null;
                        const prefecture = ann.workLocation?.match(/^(.+?[都道府県])/)?.[1] || '';
                        return (
                          <Box
                            key={ann.id}
                            onClick={() => navigate(`/announcements/${ann.id}`)}
                            sx={{
                              position: 'relative',
                              display: 'flex',
                              flexDirection: 'column',
                              backgroundColor: colors.text.white,
                              borderRadius: borderRadius.xs,
                              border: `1px solid ${colors.border.main}`,
                              p: 2,
                              cursor: 'pointer',
                              transition: 'all 0.2s ease',
                              '&:hover': { borderColor: 'rgba(59, 130, 246, 0.4)', boxShadow: '0 4px 20px rgba(0, 0, 0, 0.08)' },
                              '&::before': {
                                content: '""',
                                position: 'absolute',
                                left: 0,
                                top: 0,
                                bottom: 0,
                                width: '3px',
                                backgroundColor: annStatusConfig.color,
                                borderRadius: `${borderRadius.xs} 0 0 ${borderRadius.xs}`,
                              },
                            }}
                          >
                            {/* 1行目: No. + ステータス + 入札方式 */}
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                              <Typography sx={{ fontSize: fontSizes.xs, color: colors.text.light }}>
                                No. {String(ann.no).padStart(8, '0')}
                              </Typography>
                              <Typography sx={{ fontSize: fontSizes.xs, fontWeight: 600, color: annStatusConfig.color }}>
                                {annStatusConfig.label}
                              </Typography>
                              {bidType && (
                                <>
                                  <Box sx={{ width: '1px', height: '12px', backgroundColor: colors.border.main }} />
                                  <Typography sx={{ fontSize: fontSizes.xs, color: colors.text.muted }}>
                                    {bidType.label}
                                  </Typography>
                                </>
                              )}
                            </Box>
                            {/* 2行目: タイトル */}
                            <Typography sx={{ fontWeight: 600, fontSize: fontSizes.md, color: colors.text.secondary, lineHeight: 1.5, mb: 1, flex: 1, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                              {ann.title}
                            </Typography>
                            {/* 3行目: 発注機関 */}
                            <Typography sx={{ fontSize: fontSizes.xs, color: colors.text.light, mb: 0.5 }}>
                              {ann.organization}
                            </Typography>
                            {/* 4行目: 都道府県・カテゴリ */}
                            <Typography sx={{ fontSize: fontSizes.xs, color: colors.text.light, mb: 0.75 }}>
                              {prefecture && `${prefecture}・`}{ann.category}
                            </Typography>
                            {/* 5行目: 公告日・締切日 */}
                            <Typography sx={{ fontSize: fontSizes.xs, color: colors.text.muted }}>
                              公告日 {ann.publishDate} / 締切日 {ann.deadline}
                            </Typography>
                          </Box>
                        );
                      })}
                    </Box>
                  ) : (
                    <Box sx={{ p: 4, textAlign: 'center', color: colors.text.light }}>
                      関連案件がありません
                    </Box>
                  )}
                </Box>
                {/* フッター（ページネーション） */}
                <Box sx={{ backgroundColor: colors.text.white, borderTop: `1px solid ${colors.border.main}`, px: 2 }}>
                  <CustomPagination
                    page={relatedPage}
                    pageSize={relatedPageSize}
                    rowCount={filteredRelatedAnnouncements.length}
                    onPageChange={setRelatedPage}
                    onPageSizeChange={() => {}}
                  />
                </Box>
              </Box>
            )}

            {/* 資料タブ */}
            {activeTab === tabIndex.documents && hasDocuments && announcement.documents && (
              <Box sx={{ p: 2.5, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                {announcement.documents.map((doc: any, index: number) => {
                  const typeConfig = getDocumentTypeConfig(doc.type);
                  const formatConfig = getFileFormatConfig(doc.fileFormat);
                  return (
                    <Accordion
                      key={doc.id}
                      defaultExpanded={index === 0}
                      sx={{
                        backgroundColor: colors.text.white,
                        border: `1px solid ${colors.border.main}`,
                        borderRadius: `${borderRadius.xs} !important`,
                        boxShadow: 'none',
                        '&:before': { display: 'none' },
                        '&.Mui-expanded': { margin: 0 },
                      }}
                    >
                      <AccordionSummary
                        expandIcon={<ExpandMoreIcon sx={{ color: colors.text.muted }} />}
                        sx={{
                          px: 2.5,
                          py: 0.5,
                          minHeight: 48,
                          borderBottom: `1px solid ${colors.border.main}`,
                          '& .MuiAccordionSummary-content': { alignItems: 'center', gap: 1.5, my: 1 },
                        }}
                      >
                        <TextSnippetIcon sx={{ ...iconStyles.medium, color: colors.text.light }} />
                        <Typography sx={{ fontSize: fontSizes.md, fontWeight: 600, color: colors.text.secondary }}>{doc.title}</Typography>
                        <Typography sx={{ fontSize: fontSizes.md, fontWeight: 600, color: typeConfig.color, backgroundColor: typeConfig.bgColor, px: 1, py: 0.25, borderRadius: '2px' }}>
                          {typeConfig.label}
                        </Typography>
                        {doc.url && (
                          <Button
                            variant="outlined"
                            size="small"
                            endIcon={<OpenInNewIcon sx={iconStyles.small} />}
                            component="a"
                            href={doc.url}
                            target="_blank"
                            onClick={(e) => e.stopPropagation()}
                            sx={{ borderRadius: borderRadius.xs, borderColor: formatConfig.color, color: formatConfig.color, fontWeight: 500, fontSize: fontSizes.xs, textTransform: 'none', py: 0.25, px: 1 }}
                          >
                            {formatConfig.label}
                          </Button>
                        )}
                        {doc.pageCount && <Typography sx={{ fontSize: fontSizes.md, color: colors.text.light, ml: 'auto', mr: 1 }}>{doc.pageCount}ページ</Typography>}
                      </AccordionSummary>
                      <AccordionDetails sx={{ p: 2.5, maxHeight: 400, overflow: 'auto', backgroundColor: colors.background.paper }}>
                        <Typography component="pre" sx={{ fontSize: fontSizes.md, color: colors.text.muted, whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: 'inherit', margin: 0, lineHeight: 1.8 }}>
                          {doc.content}
                        </Typography>
                      </AccordionDetails>
                    </Accordion>
                  );
                })}
              </Box>
            )}
            </Box>
          </Paper>

          {/* 右サイドパネル（関連案件タブまたは着手企業タブの時のみ表示） */}
          {(activeTab === tabIndex.related || activeTab === tabIndex.companies) && (
            <RightSidePanel
              open={rightPanelOpen}
              onToggle={toggleRightPanel}
              onClose={closeRightPanel}
              onOpenWithTab={handleOpenWithTab}
              isMobile={isMobile}
            >
              {activeTab === tabIndex.related ? (
                <RelatedConditionsPanel
                  searchQuery={relatedSearchQuery}
                  onSearchChange={handleRelatedSearchChange}
                  sortOption={relatedSortOption}
                  onSortChange={setRelatedSortOption}
                  filters={relatedFilters}
                  onFilterChange={setRelatedFilters}
                  onClearAll={() => {
                    setRelatedSearchQuery('');
                    setRelatedSortOption(null);
                    setRelatedFilters({
                      statuses: [],
                      bidTypes: [],
                      categories: [],
                      prefectures: [],
                      organizations: [],
                    });
                    setRelatedPage(0);
                  }}
                  activeTab={conditionTab}
                  onTabChange={setConditionTab}
                />
              ) : (
                <CompanyConditionsPanel
                  searchQuery={companySearchQuery}
                  onSearchChange={handleCompanySearchChange}
                  sortOption={companySortOption}
                  onSortChange={setCompanySortOption}
                  filters={companyFilters}
                  onFilterChange={setCompanyFilters}
                  onClearAll={() => {
                    setCompanySearchQuery('');
                    setCompanySortOption(null);
                    setCompanyFilters({
                      evaluationStatuses: [],
                      workStatuses: [],
                      priorities: [],
                    });
                    setCompanyPage(0);
                  }}
                  activeTab={conditionTab}
                  onTabChange={setConditionTab}
                />
              )}
            </RightSidePanel>
          )}
        </Box>
      </Box>
      <FloatingBackButton onClick={() => navigate('/announcements')} />
      <ScrollToTopButton />
    </Box>
  );
}

// 情報行コンポーネント
function InfoRow({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2, py: 1.25, borderBottom: `1px solid ${colors.background.hover}`, '&:last-child': { borderBottom: 'none' } }}>
      {icon && <Box sx={{ mt: 0.25 }}>{icon}</Box>}
      <Typography sx={{ fontSize: fontSizes.md, color: colors.text.muted, fontWeight: 500, minWidth: 90 }}>{label}</Typography>
      <Typography sx={{ fontSize: fontSizes.md, color: colors.text.secondary, fontWeight: 500, flex: 1 }}>{value}</Typography>
    </Box>
  );
}
