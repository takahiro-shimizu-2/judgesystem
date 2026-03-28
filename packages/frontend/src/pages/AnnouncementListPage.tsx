/**
 * 入札案件一覧ページ（カード形式 + 右パネル）
 */
import { useCallback, useState, useRef, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Paper,
  Typography,
  Chip,
  CircularProgress,
} from '@mui/material';
import { AccountBalance as OrdererIcon } from '@mui/icons-material';
import { announcementStatusConfig, bidTypeConfig } from '../data';
import type { AnnouncementStatus, BidType } from '../types';
import { pageStyles, fontSizes, listFilterChipStyles, colors, borderRadius, iconStyles } from '../constants/styles';
import { extractPrefecture as extractPref } from '../constants/prefectures';
import { CustomPagination } from '../components/bid';
import { RightSidePanel } from '../components/layout';
import { AnnouncementDisplayConditionsPanel } from '../components/announcement';
import { useSidebar } from '../contexts/SidebarContext';
import { useAnnouncementListState } from '../hooks';
import { categories as defaultCategoryDetails } from '../constants/categories';

// 都道府県を抽出するヘルパー関数
function extractPrefecture(workLocation: string | undefined): string {
  if (!workLocation) return '';
  return extractPref(workLocation) ?? '';
}

/**
 * 残り日数を計算
 */
function getCountdown(deadline: string): {
  days: number;
  label: string;
  textColor: string;
} {
  const deadlineDate = new Date(deadline);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  deadlineDate.setHours(0, 0, 0, 0);

  const diffTime = deadlineDate.getTime() - today.getTime();
  const days = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  if (days < 0) {
    return { days, label: '締切済', textColor: colors.text.muted };
  }
  if (days === 0) {
    return { days, label: '本日まで', textColor: colors.status.error.main };
  }
  if (days <= 3) {
    return { days, label: `あと${days}日`, textColor: colors.status.error.main };
  }
  if (days <= 7) {
    return { days, label: `あと${days}日`, textColor: colors.status.warning.main };
  }
  if (days <= 14) {
    return { days, label: `あと${days}日`, textColor: colors.accent.yellowDark };
  }
  return { days, label: `あと${days}日`, textColor: colors.status.success.main };
}

function formatCategoryLabel(segment?: string, detail?: string, fallback?: string): string {
  if (segment && detail) return `${segment}／${detail}`;
  if (segment) return segment;
  if (detail) return detail;
  return fallback || '未分類';
}

// 行データの型
interface RowData {
  id: string;
  no: string;
  status: AnnouncementStatus;
  bidType?: BidType;
  title: string;
  organization: string;
  category: string;
  categorySegment?: string;
  categoryDetail?: string;
  noticeCategoryName?: string;
  noticeCategoryCode?: string;
  noticeProcurementMethod?: string;
  publishDate: string;
  deadline: string;
  prefecture: string;
}

/**
 * 入札案件カード
 */
function AnnouncementCard({ row, onClick }: { row: RowData; onClick: () => void }) {
  const statusConfig = announcementStatusConfig[row.status];
  const bidType = row.bidType ? bidTypeConfig[row.bidType] : null;
  const countdown = getCountdown(row.deadline);

  return (
    <Box
      onClick={onClick}
      sx={{
        position: 'relative',
        display: 'flex',
        gap: 3,
        px: 2.5,
        py: 2.5,
        mx: 2,
        my: 1,
        backgroundColor: colors.text.white,
        borderRadius: '2px',
        border: `1px solid ${colors.border.main}`,
        cursor: 'pointer',
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
          backgroundColor: statusConfig.color,
        },
      }}
    >
      {/* 中央: メインコンテンツ */}
      <Box sx={{ flex: 1, minWidth: 0, pl: 0.5 }}>
        {/* 1行目: ステータスバッジ群 */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1.5, flexWrap: 'wrap' }}>
          <Typography
            sx={{
              fontSize: fontSizes.xs,
              color: colors.text.light,
              fontWeight: 500,
              letterSpacing: '0.05em',
            }}
          >
            No. {row.no}
          </Typography>

          {/* ステータスバッジグループ */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography
              sx={{
                fontSize: fontSizes.xs,
                fontWeight: 600,
                color: statusConfig.color,
                letterSpacing: '0.03em',
              }}
            >
              {statusConfig.label}
            </Typography>
            {bidType && (
              <>
                <Box sx={{ width: '1px', height: '14px', backgroundColor: colors.border.main }} />
                <Typography
                  sx={{
                    fontSize: fontSizes.xs,
                    fontWeight: 500,
                    color: colors.text.muted,
                    letterSpacing: '0.03em',
                  }}
                >
                  {bidType.label}
                </Typography>
              </>
            )}
          </Box>
        </Box>

        {/* 2行目: 公告名 */}
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
          {row.title}
          {row.prefecture && (
            <Typography
              component="span"
              sx={{
                ml: 1.5,
                fontSize: fontSizes.md,
                fontWeight: 400,
                color: colors.text.muted,
                px: 0.75,
                py: 0.25,
                borderRadius: borderRadius.xs,
              }}
            >
              {row.prefecture}
            </Typography>
          )}
        </Typography>

        {/* 3行目: 発注機関、工事種別 */}
        <Box
          sx={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 2,
            alignItems: 'center',
            mb: 1,
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
            <OrdererIcon sx={{ ...iconStyles.small, color: colors.text.light }} />
            <Typography sx={{ fontSize: fontSizes.md, color: colors.text.muted, fontWeight: 400 }}>
              {row.organization}
            </Typography>
          </Box>

          <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
            <Typography
              sx={{
                fontSize: fontSizes.sm,
                fontWeight: 600,
                color: colors.text.dark,
              }}
            >
              {formatCategoryLabel(row.categorySegment, row.categoryDetail, row.category)}
            </Typography>
            {row.noticeCategoryName && (
              <Chip
                size="small"
                label={row.noticeCategoryName}
                sx={{ height: 20, fontSize: fontSizes.xs, color: colors.text.muted }}
              />
            )}
          </Box>
        </Box>

        {/* 4行目: 公告日 */}
        <Typography
          sx={{
            fontSize: fontSizes.xs,
            color: colors.text.light,
            fontWeight: 400,
          }}
        >
          公告日: {row.publishDate}
        </Typography>
        {row.noticeProcurementMethod && (
          <Typography
            sx={{
              fontSize: fontSizes.xs,
              color: colors.text.light,
              fontWeight: 400,
              mt: 0.5,
            }}
          >
            調達方式: {row.noticeProcurementMethod}
          </Typography>
        )}
      </Box>

      {/* 右: 締切情報 */}
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-end',
          justifyContent: 'center',
          flexShrink: 0,
          minWidth: 120,
          py: 0.5,
        }}
      >
        <Typography
          sx={{
            fontSize: fontSizes.xs,
            color: colors.text.light,
            fontWeight: 500,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            mb: 0.25,
          }}
        >
          Deadline
        </Typography>
        <Typography
          sx={{
            fontSize: fontSizes.lg,
            color: countdown.textColor,
            fontWeight: 600,
            letterSpacing: '-0.01em',
          }}
        >
          {countdown.label}
        </Typography>
        <Typography
          sx={{
            fontSize: fontSizes.sm,
            color: colors.text.muted,
            fontWeight: 400,
          }}
        >
          {new Date(row.deadline).toLocaleDateString('ja-JP', { year: 'numeric', month: 'numeric', day: 'numeric' })}
        </Typography>
      </Box>
    </Box>
  );
}

// ナビゲーション追跡用
const NAV_TRACKING_KEY = 'lastVisitedPath';

export default function AnnouncementListPage() {
  const navigate = useNavigate();
  const { rightPanelOpen, toggleRightPanel, closeRightPanel, isMobile } = useSidebar();
  const [conditionTab, setConditionTab] = useState<'sort' | 'filter'>('sort');
  const listContainerRef = useRef<HTMLDivElement>(null);

  // サーバーサイドページネーション用フック
  const {
    rows,
    rowCount,
    loading,
    error,
    filters,
    searchQuery,
    sortModel,
    paginationModel,
    applyFilters,
    updateSearchQuery,
    updateSortModel,
    updatePaginationModel,
  } = useAnnouncementListState();

  // ナビゲーション追跡
  useEffect(() => {
    try {
      sessionStorage.setItem(NAV_TRACKING_KEY, '/announcements');
    } catch { /* ignore */ }
  }, []);

  // アクティブなフィルター数
  const totalFilterCount =
    filters.statuses.length +
    filters.bidTypes.length +
    filters.categorySegments.length +
    filters.categoryDetails.length +
    filters.prefectures.length +
    filters.organizations.length;

  // 行データに変換（サーバーから取得したデータをそのまま使用）
const displayRows: RowData[] = rows.map((a) => ({
  id: String(a.announcementNo), // 公告番号を使用（詳細APIと整合）
  no: String(a.announcementNo).padStart(8, '0'),
  status: a.status,
  bidType: a.bidType,
  title: a.title,
  organization: a.organization,
  category: a.category,
  categorySegment: a.categorySegment,
  categoryDetail: a.categoryDetail,
  noticeCategoryName: a.noticeCategoryName,
  noticeCategoryCode: a.noticeCategoryCode,
  noticeProcurementMethod: a.noticeProcurementMethod,
  publishDate: a.publishDate,
  deadline: a.deadline,
  prefecture: extractPrefecture(a.workLocation),
}));

const categorySegmentOptions = useMemo(() => {
  const set = new Set<string>();
  rows.forEach((row: any) => {
    if (row.categorySegment) {
      set.add(row.categorySegment);
    }
  });
  return Array.from(set).sort();
}, [rows]);

const categoryDetailOptions = useMemo(() => {
  const set = new Set<string>();
  rows.forEach((row: any) => {
    if (row.categoryDetail) {
      set.add(row.categoryDetail);
    }
  });
  if (set.size === 0) {
    defaultCategoryDetails.forEach(cat => set.add(cat));
  }
  return Array.from(set).sort();
}, [rows]);

  // ページ変更時にスクロール位置をリセット
  useEffect(() => {
    if (listContainerRef.current) {
      listContainerRef.current.scrollTop = 0;
    }
  }, [paginationModel.page]);

  const handleCardClick = (id: string) => {
    navigate(`/announcements/${id}`);
  };

  const handleClearAll = useCallback(() => {
    updateSearchQuery('');
    updateSortModel([]);
    applyFilters({
      statuses: [],
      bidTypes: [],
      categories: [],
      categorySegments: [],
      categoryDetails: [],
      prefectures: [],
      organizations: [],
    });
  }, [updateSearchQuery, updateSortModel, applyFilters]);

  const handleOpenWithTab = useCallback((tab: 'sort' | 'filter') => {
    setConditionTab(tab);
    if (!rightPanelOpen) {
      toggleRightPanel();
    }
  }, [rightPanelOpen, toggleRightPanel]);

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
            <Typography variant="h5" sx={pageStyles.pageTitle}>
              入札案件情報一覧
            </Typography>

            {/* アクティブフィルターチップ */}
            {totalFilterCount > 0 && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                <Typography sx={{ fontSize: fontSizes.xs, color: colors.text.muted, fontWeight: 500 }}>
                  絞り込み:
                </Typography>
                <Typography
                  component="button"
                  onClick={() =>
                    applyFilters({
                      statuses: [],
                      bidTypes: [],
                      categories: [],
                      categorySegments: [],
                      categoryDetails: [],
                      prefectures: [],
                      organizations: [],
                    })
                  }
                  sx={{ fontSize: fontSizes.xs, color: colors.accent.red, fontWeight: 600, cursor: 'pointer', background: 'none', border: 'none', p: 0, mr: 0.5, '&:hover': { color: colors.status.error.main } }}
                >
                  クリア
                </Typography>

                {filters.statuses.map((s) => (
                  <Chip
                    key={s}
                    label={announcementStatusConfig[s].label}
                    size="small"
                    onDelete={() => applyFilters({ ...filters, statuses: filters.statuses.filter((x) => x !== s) })}
                    sx={listFilterChipStyles}
                  />
                ))}

                {filters.bidTypes.map((b) => (
                  <Chip
                    key={b}
                    label={bidTypeConfig[b].label}
                    size="small"
                    onDelete={() => applyFilters({ ...filters, bidTypes: filters.bidTypes.filter((x) => x !== b) })}
                    sx={listFilterChipStyles}
                  />
                ))}

                {filters.categorySegments.map((segment) => (
                  <Chip
                    key={segment}
                    label={`区分: ${segment}`}
                    size="small"
                    onDelete={() =>
                      applyFilters({
                        ...filters,
                        categorySegments: filters.categorySegments.filter((x) => x !== segment),
                      })
                    }
                    sx={listFilterChipStyles}
                  />
                ))}

                {filters.categoryDetails.map((detail) => (
                  <Chip
                    key={detail}
                    label={`詳細: ${detail}`}
                    size="small"
                    onDelete={() => {
                      const nextDetails = filters.categoryDetails.filter((x) => x !== detail);
                      applyFilters({
                        ...filters,
                        categoryDetails: nextDetails,
                        categories: nextDetails,
                      });
                    }}
                    sx={listFilterChipStyles}
                  />
                ))}

                {filters.prefectures.map((p) => (
                  <Chip
                    key={p}
                    label={p}
                    size="small"
                    onDelete={() => applyFilters({ ...filters, prefectures: filters.prefectures.filter((x) => x !== p) })}
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
            {loading && (
              <Box sx={{ p: 4, textAlign: 'center' }}>
                <CircularProgress />
              </Box>
            )}
            {!loading && error && (
              <Box sx={{ p: 4, textAlign: 'center', color: colors.status.error.main }}>
                {error}
              </Box>
            )}
            {!loading && !error && displayRows.map((row) => (
              <AnnouncementCard
                key={row.id}
                row={row}
                onClick={() => handleCardClick(row.id)}
              />
            ))}
            {!loading && !error && displayRows.length === 0 && (
              <Box sx={{ p: 4, textAlign: 'center', color: colors.text.muted }}>
                該当する案件がありません
              </Box>
            )}
          </Box>

          {/* ページネーション */}
          <CustomPagination
            page={paginationModel.page}
            pageSize={paginationModel.pageSize}
            rowCount={rowCount}
            onPageChange={(page) => updatePaginationModel({ ...paginationModel, page })}
            onPageSizeChange={(pageSize) => updatePaginationModel({ page: 0, pageSize })}
          />
        </Paper>
      </Box>

      {/* 右サイドパネル */}
      <RightSidePanel
        open={rightPanelOpen}
        onToggle={toggleRightPanel}
        onClose={closeRightPanel}
        onOpenWithTab={handleOpenWithTab}
        isMobile={isMobile}
      >
        <AnnouncementDisplayConditionsPanel
          searchQuery={searchQuery}
          onSearchChange={updateSearchQuery}
          sortModel={sortModel}
          onSortModelChange={updateSortModel}
          filters={filters}
          onFilterChange={applyFilters}
          onClearAll={handleClearAll}
          categorySegments={categorySegmentOptions}
          categoryDetails={categoryDetailOptions}
          activeTab={conditionTab}
          onTabChange={setConditionTab}
        />
      </RightSidePanel>
    </Box>
  );
}
