import { useState, useMemo, useCallback, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import {
  Box,
  Button,
  Chip,
  Typography,
  TextField,
  InputAdornment,
  Paper,
  Tabs,
  Tab,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  IconButton,
} from '@mui/material';
import {
  Phone as PhoneIcon,
  Email as EmailIcon,
  LocationOn as LocationIcon,
  Print as FaxIcon,
  CalendarMonth as CalendarIcon,
  Search as SearchIcon,
  ExpandMore as ExpandMoreIcon,
  ArrowBack as ArrowBackIcon,
  SwapVert as SortIcon,
  FilterAlt as FilterIcon,
  Close as CloseIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
} from '@mui/icons-material';
import { mockOrderers, ordererCategoryConfig, announcementStatusConfig, bidTypeConfig } from '../data';
import { deleteOrdererRecord } from '../data/orderers';
import { categories } from '../constants/categories';
import { bidTypes } from '../constants/bidType';
import { prefecturesByRegion } from '../constants/prefectures';
import type { BidType } from '../types/announcement';
import { colors, pageStyles, fontSizes, chipStyles, iconStyles, borderRadius, rightPanelColors } from '../constants/styles';
import type { AnnouncementWithStatus } from '../types';
import { useListPageState } from '../hooks';
import { useSidebar } from '../contexts/SidebarContext';
import { NotFoundView, FloatingBackButton, ScrollToTopButton } from '../components/common';
import { CustomPagination } from '../components/bid';
import { RightSidePanel } from '../components/layout';
import { getApiUrl } from '../config/api';


/**
 * 案件カード（コンパクトグリッド形式）
 */
function AnnouncementCard({ announcement, onClick }: { announcement: AnnouncementWithStatus; onClick: () => void }) {
  const statusConfig = announcementStatusConfig[announcement.status];
  const bidType = announcement.bidType ? bidTypeConfig[announcement.bidType] : null;

  // 都道府県を抽出
  const prefecture = announcement.workLocation
    ? announcement.workLocation.match(/^(.+?[都道府県])/)?.[1] || ''
    : '';

  return (
    <Box
      onClick={onClick}
      sx={{
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        p: 2,
        backgroundColor: colors.text.white,
        borderRadius: borderRadius.xs,
        border: `1px solid ${colors.border.main}`,
        cursor: 'pointer',
        transition: 'all 0.2s ease',
        height: '100%',
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
          backgroundColor: statusConfig.color,
          borderRadius: `${borderRadius.xs} 0 0 ${borderRadius.xs}`,
        },
      }}
    >
      {/* 1行目: No. + ステータス + 入札方式 */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
        <Typography sx={{ fontSize: fontSizes.xs, color: colors.text.light }}>
          No. {String(announcement.no).padStart(8, '0')}
        </Typography>
        <Typography
          sx={{
            fontSize: fontSizes.xs,
            fontWeight: 600,
            color: statusConfig.color,
          }}
        >
          {statusConfig.label}
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
      <Typography
        sx={{
          fontWeight: 600,
          fontSize: fontSizes.md,
          color: colors.text.secondary,
          lineHeight: 1.5,
          mb: 1,
          flex: 1,
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
          transition: 'color 0.15s',
          '.MuiBox-root:hover &': {
            color: colors.primary.main,
          },
        }}
      >
        {announcement.title}
      </Typography>

      {/* 3行目: 都道府県・カテゴリ */}
      <Typography sx={{ fontSize: fontSizes.xs, color: colors.text.light, mb: 0.75 }}>
        {prefecture && `${prefecture}・`}{announcement.category}
      </Typography>

      {/* 4行目: 公告日・締切日 */}
      <Typography sx={{ fontSize: fontSizes.xs, color: colors.text.muted }}>
        公告日 {announcement.publishDate} / 締切日 {announcement.deadline}
      </Typography>
    </Box>
  );
}

// ソートオプション
type SortOption = 'deadline_asc' | 'deadline_desc' | 'publish_asc' | 'publish_desc' | 'status_asc' | 'status_desc' | 'prefecture_asc' | 'prefecture_desc';

// ソートフィールド定義
const SORT_FIELDS = [
  { field: 'deadline', label: '締切', ascLabel: '近い', descLabel: '遠い' },
  { field: 'publish', label: '公告日', ascLabel: '古い', descLabel: '新しい' },
  { field: 'status', label: 'ステータス', ascLabel: '公開予定→終了', descLabel: '終了→公開予定' },
  { field: 'prefecture', label: '都道府県', ascLabel: '北→南', descLabel: '南→北' },
] as const;

// フィルタータブ定義
const FILTER_TABS = [
  { id: 'status', label: 'ステータス' },
  { id: 'bidType', label: '入札方式' },
  { id: 'category', label: '種別' },
  { id: 'prefecture', label: '都道府県' },
] as const;

// ステータスフィルターオプション
type StatusFilter = AnnouncementWithStatus['status'];
const STATUS_FILTERS: StatusFilter[] = ['upcoming', 'ongoing', 'awaiting_result', 'closed'];

// フィルター状態の型
interface AnnouncementFilterState {
  statuses: StatusFilter[];
  bidTypes: string[];
  categories: string[];
  prefectures: string[];
}

// 案件用表示条件パネル
interface AnnouncementConditionsPanelProps {
  searchQuery: string;
  onSearchChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  sortOption: SortOption | null;
  onSortChange: (option: SortOption | null) => void;
  filters: AnnouncementFilterState;
  onFilterChange: (filters: AnnouncementFilterState) => void;
  onClearAll: () => void;
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

function AnnouncementConditionsPanel({
  searchQuery,
  onSearchChange,
  sortOption,
  onSortChange,
  filters,
  onFilterChange,
  onClearAll,
  activeTab,
  onTabChange,
}: AnnouncementConditionsPanelProps) {
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
  };
  const totalFilterCount = Object.values(filterCounts).reduce((a, b) => a + b, 0);
  const hasConditions = searchQuery.trim() || sortOption !== null || totalFilterCount > 0;

  // トグル関数
  const toggleStatus = (status: StatusFilter) => {
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

  // 地域グループ一括トグル（都道府県）
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
            {STATUS_FILTERS.map((status) => {
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
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {prefecturesByRegion.map((region) => {
              const selectionState = getPrefRegionSelectionState(region.prefectures);
              return (
                <Box key={region.region}>
                  <Box
                    component="button"
                    onClick={() => togglePrefRegion(region.prefectures)}
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 1,
                      mb: 1,
                      py: 0.5,
                      px: 1,
                      fontSize: fontSizes.sm,
                      fontWeight: 600,
                      cursor: 'pointer',
                      border: 'none',
                      borderRadius: borderRadius.xs,
                      backgroundColor: selectionState !== 'none' ? `${colors.accent.blue}33` : 'transparent',
                      color: selectionState !== 'none' ? colors.accent.blue : rightPanelColors.text,
                      '&:hover': { backgroundColor: `${colors.accent.blue}26` },
                    }}
                  >
                    {region.region}
                    {selectionState === 'partial' && (
                      <Box
                        component="span"
                        sx={{
                          fontSize: fontSizes.xs,
                          color: colors.accent.blue,
                          opacity: 0.8,
                        }}
                      >
                        (一部)
                      </Box>
                    )}
                  </Box>
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
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
                      onSortChange(null); // 選択解除
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
                      fontSize: fontSizes.sm,
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

// ステータスの順序（ソート用）
const STATUS_ORDER: Record<StatusFilter, number> = {
  upcoming: 0,
  ongoing: 1,
  awaiting_result: 2,
  closed: 3,
};

// ナビゲーション追跡用
const NAV_TRACKING_KEY = 'lastVisitedPath';

export default function OrdererDetailPage() {
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

  // ソート・フィルター状態
  const [sortOption, setSortOption] = useState<SortOption | null>(null);
  const [filters, setFilters] = useState<AnnouncementFilterState>({
    statuses: [],
    bidTypes: [],
    categories: [],
    prefectures: [],
  });

  // サイドパネル制御
  const handleOpenWithTab = useCallback((tab: 'sort' | 'filter') => {
    setConditionTab(tab);
    if (!rightPanelOpen) {
      toggleRightPanel();
    }
  }, [rightPanelOpen, toggleRightPanel]);

  const orderer = mockOrderers.find((o) => o.id === id);

  // この発注者の案件をAPIから取得
  const [ordererAnnouncements, setOrdererAnnouncements] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAnnouncements = async () => {
      if (!id) return;
      try {
        setLoading(true);
        const response = await fetch(getApiUrl(`/api/announcements?ordererId=${id}&pageSize=1000`));
        if (!response.ok) {
          throw new Error(`Failed to fetch announcements: ${response.status}`);
        }
        const result = await response.json();
        setOrdererAnnouncements(result.data || []);
      } catch (err) {
        console.error('Error fetching announcements:', err);
        setOrdererAnnouncements([]);
      } finally {
        setLoading(false);
      }
    };

    fetchAnnouncements();
  }, [id]);

  const {
    searchQuery,
    paginationModel,
    rows: baseRows,
    handleSearchChange,
    handlePaginationModelChange,
  } = useListPageState(ordererAnnouncements, {
    searchFields: ['title', 'category', 'workLocation'],
  });

  // 都道府県の順序（北→南）
  const PREFECTURE_ORDER: Record<string, number> = useMemo(() => {
    const order: Record<string, number> = {};
    let idx = 0;
    prefecturesByRegion.forEach(region => {
      region.prefectures.forEach(pref => {
        order[pref] = idx++;
      });
    });
    return order;
  }, []);

  // 都道府県を抽出するヘルパー関数
  const extractPrefecture = (workLocation: string): string => {
    const match = workLocation?.match(/^(.+?[都道府県])/);
    return match ? match[1] : '';
  };

  // フィルターとソートを適用
  const announcementRows = useMemo(() => {
    // フィルター適用
    let filtered = baseRows.filter((row) => {
      // ステータスフィルター
      if (filters.statuses.length > 0 && !filters.statuses.includes(row.status as StatusFilter)) {
        return false;
      }
      // 入札形式フィルター
      if (filters.bidTypes.length > 0 && (!row.bidType || !filters.bidTypes.includes(row.bidType))) {
        return false;
      }
      // カテゴリフィルター
      if (filters.categories.length > 0 && !filters.categories.includes(row.category)) {
        return false;
      }
      // 都道府県フィルター
      if (filters.prefectures.length > 0) {
        const pref = extractPrefecture(row.workLocation);
        if (!pref || !filters.prefectures.includes(pref)) {
          return false;
        }
      }
      return true;
    });

    // ソート適用（nullの場合は元の順序を維持）
    if (!sortOption) {
      return filtered;
    }

    return [...filtered].sort((a, b) => {
      switch (sortOption) {
        case 'deadline_asc':
          return new Date(a.deadline).getTime() - new Date(b.deadline).getTime();
        case 'deadline_desc':
          return new Date(b.deadline).getTime() - new Date(a.deadline).getTime();
        case 'publish_asc':
          return new Date(a.publishDate).getTime() - new Date(b.publishDate).getTime();
        case 'publish_desc':
          return new Date(b.publishDate).getTime() - new Date(a.publishDate).getTime();
        case 'status_asc':
          return STATUS_ORDER[a.status as StatusFilter] - STATUS_ORDER[b.status as StatusFilter];
        case 'status_desc':
          return STATUS_ORDER[b.status as StatusFilter] - STATUS_ORDER[a.status as StatusFilter];
        case 'prefecture_asc': {
          const prefA = extractPrefecture(a.workLocation);
          const prefB = extractPrefecture(b.workLocation);
          return (PREFECTURE_ORDER[prefA] ?? 999) - (PREFECTURE_ORDER[prefB] ?? 999);
        }
        case 'prefecture_desc': {
          const prefA = extractPrefecture(a.workLocation);
          const prefB = extractPrefecture(b.workLocation);
          return (PREFECTURE_ORDER[prefB] ?? 999) - (PREFECTURE_ORDER[prefA] ?? 999);
        }
        default:
          return 0;
      }
    });
  }, [baseRows, filters, sortOption, PREFECTURE_ORDER]);

  const handleAnnouncementClick = (announcementId: string) => {
    navigate(`/announcements/${announcementId}`);
  };

  if (!orderer) {
    return (
      <NotFoundView
        message="指定された発注者が見つかりません。"
        backLabel="一覧に戻る"
        onBack={() => navigate('/orderers')}
      />
    );
  }

  const categoryConfig = ordererCategoryConfig[orderer.category];

  return (
    <Box sx={{ height: '100vh', bgcolor: colors.page.background, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <Box sx={{ ...pageStyles.contentArea, maxWidth: '100%', py: 3, display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
        {/* ヘッダー */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'stretch', mb: 2 }}>
          <Box sx={{ pl: 2, borderLeft: '4px solid', borderColor: categoryConfig.color }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2.5, mb: 0.5, flexWrap: 'wrap' }}>
              <Button
                size="small"
                startIcon={<ArrowBackIcon sx={iconStyles.small} />}
                onClick={() => navigate('/orderers')}
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
              <Typography sx={{ fontSize: fontSizes.base, fontWeight: 700, color: categoryConfig.color }}>
                {categoryConfig.label}
              </Typography>
              <Typography sx={{ color: colors.border.dark }}>|</Typography>
              <Typography sx={{ fontSize: fontSizes.md, color: colors.text.muted }}>
                最終公告: {orderer.lastAnnouncementDate}
              </Typography>
            </Box>
            <Typography sx={pageStyles.detailPageTitle}>
              {orderer.name}
            </Typography>
          </Box>
          <Box sx={{ textAlign: 'right', flexShrink: 0, ml: 3, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 1 }}>
              <Typography sx={{ fontSize: fontSizes.md, color: colors.text.light }}>
                No. {String(orderer.no).padStart(8, '0')}
              </Typography>
              <IconButton
                size="small"
                onClick={() => navigate('/master/register', {
                  state: {
                    editMode: true, entityId: orderer.id, formType: 'orderer',
                    formData: { name: orderer.name, category: orderer.category, address: orderer.address, phone: orderer.phone, fax: orderer.fax, email: orderer.email, website: '', departments: orderer.departments },
                    activeTab: 1,
                  },
                })}
                sx={{ color: colors.text.light, '&:hover': { color: colors.accent.blue, backgroundColor: `${colors.accent.blue}15` } }}
              >
                <EditIcon sx={{ fontSize: 18 }} />
              </IconButton>
              <IconButton
                size="small"
                onClick={async () => {
                  if (!window.confirm(`「${orderer.name}」を削除しますか？`)) return;
                  const success = await deleteOrdererRecord(orderer.id);
                  if (success) { navigate('/orderers'); } else { alert('削除に失敗しました。'); }
                }}
                sx={{ color: colors.text.light, '&:hover': { color: colors.accent.red, backgroundColor: `${colors.accent.red}15` } }}
              >
                <DeleteIcon sx={{ fontSize: 18 }} />
              </IconButton>
            </Box>
            <Typography sx={{ fontSize: fontSizes.xl, fontWeight: 700, color: colors.primary.main }}>
              <Typography component="span" sx={{ fontSize: fontSizes.sm, fontWeight: 500, color: colors.text.muted }}>
                公告件数{" "}
              </Typography>
              {orderer.announcementCount.toLocaleString()}件
            </Typography>
          </Box>
        </Box>

        {/* メインカード + サイドパネル */}
        <Box sx={{ flex: 1, display: 'flex', minHeight: 0 }}>
          <Paper sx={{ borderRadius: borderRadius.xs, overflow: 'hidden', boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)', flex: 1, display: 'flex', flexDirection: 'column' }}>
            {/* タブ */}
            <Box sx={{ borderBottom: `1px solid ${colors.border.main}`, backgroundColor: colors.text.white }}>
              <Tabs
                value={activeTab}
                onChange={(_, v) => setActiveTab(v)}
                sx={{
                  px: 2,
                  '& .MuiTabs-indicator': { backgroundColor: colors.primary.main, height: 2 },
                  '& .MuiTab-root': { textTransform: 'none', fontSize: fontSizes.md, fontWeight: 500, color: colors.text.muted, minWidth: 'auto', px: 2, py: 1.5, '&.Mui-selected': { color: colors.primary.main, fontWeight: 600 } },
                }}
              >
                <Tab label="基本情報" />
                <Tab label={`入札案件 (${announcementRows.length})`} />
              </Tabs>
            </Box>

            {/* タブコンテンツ */}
            <Box sx={{ flex: 1, overflow: 'auto', backgroundColor: colors.background.hover, display: 'flex', flexDirection: 'column' }}>
              {/* 基本情報タブ */}
              {activeTab === 0 && (
              <Box sx={{ p: 2.5 }}>
                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2.5 }}>
                  {/* 左カラム */}
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                    {/* 基本情報 */}
                    <Accordion defaultExpanded sx={{ boxShadow: 'none', border: `1px solid ${colors.border.main}`, borderRadius: `${borderRadius.xs} !important`, '&:before': { display: 'none' }, '&.Mui-expanded': { margin: 0 } }}>
                      <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ minHeight: 48, borderBottom: `1px solid ${colors.border.main}`, '&.Mui-expanded': { minHeight: 48 } }}>
                        <Typography sx={{ fontSize: fontSizes.base, fontWeight: 600, color: colors.primary.main }}>発注者情報</Typography>
                      </AccordionSummary>
                      <AccordionDetails sx={{ pt: 2, pb: 2, px: 2.5 }}>
                        <InfoRow label="所在地" value={orderer.address} icon={<LocationIcon sx={{ ...iconStyles.small, color: colors.text.light }} />} />
                        <InfoRow label="電話番号" value={orderer.phone} icon={<PhoneIcon sx={{ ...iconStyles.small, color: colors.text.light }} />} />
                        <InfoRow label="FAX" value={orderer.fax} icon={<FaxIcon sx={{ ...iconStyles.small, color: colors.text.light }} />} />
                        <InfoRow label="メール" value={orderer.email} icon={<EmailIcon sx={{ ...iconStyles.small, color: colors.text.light }} />} />
                        <InfoRow label="最終公告日" value={orderer.lastAnnouncementDate} icon={<CalendarIcon sx={{ ...iconStyles.small, color: colors.text.light }} />} />
                      </AccordionDetails>
                    </Accordion>

                  </Box>

                  {/* 右カラム */}
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                    {/* 統計サマリー */}
                    <Accordion defaultExpanded sx={{ boxShadow: 'none', border: `1px solid ${colors.border.main}`, borderRadius: `${borderRadius.xs} !important`, '&:before': { display: 'none' }, '&.Mui-expanded': { margin: 0 } }}>
                      <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ minHeight: 48, borderBottom: `1px solid ${colors.border.main}`, '&.Mui-expanded': { minHeight: 48 } }}>
                        <Typography sx={{ fontSize: fontSizes.base, fontWeight: 600, color: colors.primary.main }}>統計サマリー</Typography>
                      </AccordionSummary>
                      <AccordionDetails sx={{ pt: 2, pb: 2, px: 0, backgroundColor: colors.background.hover }}>
                        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr auto 1fr', alignItems: 'center' }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1 }}>
                            <Typography sx={{ fontSize: fontSizes.md, color: colors.text.muted }}>公告件数</Typography>
                            <Typography sx={{ fontSize: fontSizes.base, fontWeight: 700, color: colors.text.secondary }}>{orderer.announcementCount.toLocaleString()}件</Typography>
                          </Box>
                          <Typography sx={{ color: colors.border.dark, px: 1 }}>|</Typography>
                          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1 }}>
                            <Typography sx={{ fontSize: fontSizes.md, color: colors.text.muted }}>落札件数</Typography>
                            <Typography sx={{ fontSize: fontSizes.base, fontWeight: 700, color: colors.text.secondary }}>{orderer.awardCount.toLocaleString()}件</Typography>
                          </Box>
                          <Typography sx={{ color: colors.border.dark, px: 1 }}>|</Typography>
                          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1 }}>
                            <Typography sx={{ fontSize: fontSizes.md, color: colors.text.muted }}>平均落札額</Typography>
                            <Typography sx={{ fontSize: fontSizes.base, fontWeight: 700, color: colors.text.secondary }}>{(orderer.averageAmount / 10000).toLocaleString()}万</Typography>
                          </Box>
                        </Box>
                      </AccordionDetails>
                    </Accordion>

                    {/* 担当部署 */}
                    <Accordion defaultExpanded sx={{ boxShadow: 'none', border: `1px solid ${colors.border.main}`, borderRadius: `${borderRadius.xs} !important`, '&:before': { display: 'none' }, '&.Mui-expanded': { margin: 0 } }}>
                      <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ minHeight: 48, borderBottom: `1px solid ${colors.border.main}`, '&.Mui-expanded': { minHeight: 48 } }}>
                        <Typography sx={{ fontSize: fontSizes.base, fontWeight: 600, color: colors.primary.main }}>担当部署 ({orderer.departments.length})</Typography>
                      </AccordionSummary>
                      <AccordionDetails sx={{ pt: 2, pb: 2, px: 2.5 }}>
                        <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap' }}>
                          {orderer.departments.map((dept) => (
                            <Chip
                              key={dept}
                              label={dept}
                              size="small"
                              sx={{
                                ...chipStyles.small,
                                backgroundColor: colors.status.info.bg,
                                color: colors.accent.blue,
                              }}
                            />
                          ))}
                        </Box>
                      </AccordionDetails>
                    </Accordion>
                  </Box>
                </Box>
              </Box>
            )}

            {/* 入札案件タブ */}
            {activeTab === 1 && (
              <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                {/* カードグリッド */}
                <Box sx={{ flex: 1, overflow: 'auto', p: 2, backgroundColor: colors.background.hover }}>
                  {loading ? (
                    <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
                      <Typography sx={{ fontSize: fontSizes.md, color: colors.text.light }}>
                        読み込み中...
                      </Typography>
                    </Box>
                  ) : announcementRows.length === 0 ? (
                    <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
                      <Typography sx={{ fontSize: fontSizes.md, color: colors.text.light }}>
                        案件が見つかりません
                      </Typography>
                    </Box>
                  ) : (
                    <Box
                      sx={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
                        gap: 1.5,
                      }}
                    >
                      {announcementRows
                        .slice(
                          paginationModel.page * paginationModel.pageSize,
                          (paginationModel.page + 1) * paginationModel.pageSize
                        )
                        .map((announcement) => (
                          <AnnouncementCard
                            key={announcement.id}
                            announcement={announcement as AnnouncementWithStatus}
                            onClick={() => handleAnnouncementClick(announcement.id)}
                          />
                        ))}
                    </Box>
                  )}
                </Box>
                {/* ページネーション */}
                <Box sx={{ backgroundColor: colors.text.white, borderTop: `1px solid ${colors.border.main}`, px: 2 }}>
                  <CustomPagination
                    page={paginationModel.page}
                    pageSize={paginationModel.pageSize}
                    rowCount={announcementRows.length}
                    onPageChange={(page) => handlePaginationModelChange({ ...paginationModel, page })}
                    onPageSizeChange={(pageSize) => handlePaginationModelChange({ page: 0, pageSize })}
                  />
                </Box>
              </Box>
            )}
            </Box>
          </Paper>

          {/* 右サイドパネル（入札案件タブの時のみ表示） */}
          {activeTab === 1 && (
            <RightSidePanel
              open={rightPanelOpen}
              onToggle={toggleRightPanel}
              onClose={closeRightPanel}
              onOpenWithTab={handleOpenWithTab}
              isMobile={isMobile}
            >
              <AnnouncementConditionsPanel
                searchQuery={searchQuery}
                onSearchChange={handleSearchChange}
                sortOption={sortOption}
                onSortChange={setSortOption}
                filters={filters}
                onFilterChange={setFilters}
                onClearAll={() => {
                  handleSearchChange({ target: { value: '' } } as React.ChangeEvent<HTMLInputElement>);
                  setSortOption(null);
                  setFilters({ statuses: [], bidTypes: [], categories: [], prefectures: [] });
                }}
                activeTab={conditionTab}
                onTabChange={setConditionTab}
              />
            </RightSidePanel>
          )}
        </Box>
      </Box>
      <FloatingBackButton onClick={() => navigate('/orderers')} />
      <ScrollToTopButton />
    </Box>
  );
}

// 情報行コンポーネント
function InfoRow({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2, py: 1.25, borderBottom: `1px solid ${colors.background.hover}`, '&:last-child': { borderBottom: 'none' } }}>
      {icon && <Box sx={{ mt: 0.25 }}>{icon}</Box>}
      <Typography sx={{ fontSize: fontSizes.md, color: colors.text.muted, fontWeight: 500, minWidth: 80 }}>{label}</Typography>
      <Typography sx={{ fontSize: fontSizes.md, color: colors.text.secondary, fontWeight: 500, flex: 1 }}>{value}</Typography>
    </Box>
  );
}
