/**
 * 入札案件一覧ページ（カード形式 + 右パネル）
 */
import { useCallback, useMemo, useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Paper,
  Typography,
  Chip,
} from '@mui/material';
import { AccountBalance as OrdererIcon } from '@mui/icons-material';
import type { GridSortModel } from '@mui/x-data-grid';
import { mockAnnouncements, announcementStatusConfig, bidTypeConfig } from '../data';
import type { AnnouncementStatus, BidType } from '../types';
import { pageStyles, fontSizes, listFilterChipStyles, colors, borderRadius, iconStyles } from '../constants/styles';
import { allPrefectures, extractPrefecture as extractPref } from '../constants/prefectures';
import { getOrganizationGroup } from '../constants/organizations';
import { categories } from '../constants/categories';
import { CustomPagination } from '../components/bid';
import { RightSidePanel } from '../components/layout';
import { AnnouncementDisplayConditionsPanel, type AnnouncementFilterState } from '../components/announcement';
import { useSidebar } from '../contexts/SidebarContext';

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

// 行データの型
interface RowData {
  id: string;
  no: string;
  status: AnnouncementStatus;
  bidType?: BidType;
  title: string;
  organization: string;
  category: string;
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

          <Typography
            sx={{
              fontSize: fontSizes.sm,
              fontWeight: 500,
              color: colors.text.muted,
              px: 1,
              py: 0.25,
              border: `1px solid ${colors.border.main}`,
              borderRadius: '2px',
            }}
          >
            {row.category}
          </Typography>
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

// 日本語検索対応
function japaneseIncludes(target: string, query: string): boolean {
  return target.toLowerCase().includes(query.toLowerCase());
}

// ナビゲーション追跡用
const NAV_TRACKING_KEY = 'lastVisitedPath';

export default function AnnouncementListPage() {
  const navigate = useNavigate();
  const { rightPanelOpen, toggleRightPanel, closeRightPanel, isMobile } = useSidebar();
  const [conditionTab, setConditionTab] = useState<'sort' | 'filter'>('sort');
  const listContainerRef = useRef<HTMLDivElement>(null);

  // 検索クエリ
  const [searchQuery, setSearchQuery] = useState('');

  // ソートモデル
  const [sortModel, setSortModel] = useState<GridSortModel>([]);

  // フィルター状態
  const [filters, setFilters] = useState<AnnouncementFilterState>({
    statuses: [],
    bidTypes: [],
    categories: [],
    prefectures: [],
    organizations: [],
  });

  // ページネーション（詳細から戻った場合のみ復元）
  const [paginationModel, setPaginationModel] = useState<{ page: number; pageSize: number }>(() => {
    try {
      const lastPath = sessionStorage.getItem(NAV_TRACKING_KEY);
      // /announcements/* からの戻りの場合はlocalStorageから復元
      if (lastPath && /^\/announcements\//.test(lastPath)) {
        const saved = localStorage.getItem('announcementlist-page');
        if (saved) return JSON.parse(saved);
      }
    } catch { /* ignore */ }
    return { page: 0, pageSize: 25 };
  });

  // ページ番号を保存 & 現在のパスを記録
  useEffect(() => {
    try {
      localStorage.setItem('announcementlist-page', JSON.stringify(paginationModel));
      // 一覧ページのパスを保存（他の一覧から来た場合のページリセット用）
      sessionStorage.setItem(NAV_TRACKING_KEY, '/announcements');
    } catch { /* ignore */ }
  }, [paginationModel]);

  // アクティブなフィルター数
  const totalFilterCount = filters.statuses.length + filters.bidTypes.length + filters.categories.length + filters.prefectures.length + filters.organizations.length;

  // フィルター適用後のデータ
  const filteredAnnouncements = useMemo(() => {
    return mockAnnouncements.filter((announcement) => {
      // 検索
      if (searchQuery.trim()) {
        const q = searchQuery.trim();
        if (!japaneseIncludes(announcement.title, q) &&
            !japaneseIncludes(announcement.organization, q) &&
            !japaneseIncludes(announcement.category, q)) {
          return false;
        }
      }
      // ステータスフィルター
      if (filters.statuses.length > 0 && !filters.statuses.includes(announcement.status)) {
        return false;
      }
      // 入札形式フィルター
      if (filters.bidTypes.length > 0 && announcement.bidType && !filters.bidTypes.includes(announcement.bidType)) {
        return false;
      }
      // 工事種別フィルター
      if (filters.categories.length > 0 && !filters.categories.includes(announcement.category)) {
        return false;
      }
      // 都道府県フィルター
      if (filters.prefectures.length > 0) {
        const prefecture = extractPrefecture(announcement.workLocation);
        if (!filters.prefectures.includes(prefecture)) return false;
      }
      // 発注機関フィルター
      if (filters.organizations.length > 0) {
        const orgGroup = getOrganizationGroup(announcement.organization);
        if (!filters.organizations.includes(orgGroup)) return false;
      }
      return true;
    });
  }, [searchQuery, filters]);

  // 行データに変換
  const announcementRows: RowData[] = useMemo(() => {
    return filteredAnnouncements.map((a) => ({
      id: a.id,
      no: String(a.no).padStart(8, '0'),
      status: a.status,
      bidType: a.bidType,
      title: a.title,
      organization: a.organization,
      category: a.category,
      publishDate: a.publishDate,
      deadline: a.deadline,
      prefecture: extractPrefecture(a.workLocation),
    }));
  }, [filteredAnnouncements]);

  // ソート適用
  const sortedRows = useMemo(() => {
    if (sortModel.length === 0) return announcementRows;

    // 今日の日付（YYYY-MM-DD形式）
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    return [...announcementRows].sort((a, b) => {
      for (const sort of sortModel) {
        let comparison = 0;
        const field = sort.field as keyof RowData;
        const direction = sort.sort === 'desc' ? -1 : 1;

        // 締切日の場合、締切済みは常に最後
        if (field === 'deadline') {
          const aExpired = a.deadline < todayStr;
          const bExpired = b.deadline < todayStr;
          if (aExpired && !bExpired) return 1;  // aが締切済み → 後ろへ
          if (!aExpired && bExpired) return -1; // bが締切済み → aを前へ
          comparison = new Date(a.deadline).getTime() - new Date(b.deadline).getTime();
        } else if (field === 'publishDate') {
          comparison = new Date(a[field]).getTime() - new Date(b[field]).getTime();
        } else if (field === 'prefecture') {
          const idxA = allPrefectures.indexOf(a.prefecture);
          const idxB = allPrefectures.indexOf(b.prefecture);
          comparison = (idxA === -1 ? 99 : idxA) - (idxB === -1 ? 99 : idxB);
        } else if (field === 'status') {
          const order = ['upcoming', 'ongoing', 'awaiting_result', 'closed'];
          comparison = order.indexOf(a.status) - order.indexOf(b.status);
        } else {
          comparison = String(a[field]).localeCompare(String(b[field]));
        }

        if (comparison !== 0) {
          return comparison * direction;
        }
      }
      return 0;
    });
  }, [announcementRows, sortModel]);

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

  const handleCardClick = (id: string) => {
    navigate(`/announcements/${id}`);
  };

  const handleClearAll = useCallback(() => {
    setSearchQuery('');
    setSortModel([]);
    setFilters({ statuses: [], bidTypes: [], categories: [], prefectures: [], organizations: [] });
  }, []);

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
                  onClick={() => setFilters({ statuses: [], bidTypes: [], categories: [], prefectures: [], organizations: [] })}
                  sx={{ fontSize: fontSizes.xs, color: colors.accent.red, fontWeight: 600, cursor: 'pointer', background: 'none', border: 'none', p: 0, mr: 0.5, '&:hover': { color: colors.status.error.main } }}
                >
                  クリア
                </Typography>

                {filters.statuses.map((s) => (
                  <Chip
                    key={s}
                    label={announcementStatusConfig[s].label}
                    size="small"
                    onDelete={() => setFilters((prev) => ({ ...prev, statuses: prev.statuses.filter((x) => x !== s) }))}
                    sx={listFilterChipStyles}
                  />
                ))}

                {filters.bidTypes.map((b) => (
                  <Chip
                    key={b}
                    label={bidTypeConfig[b].label}
                    size="small"
                    onDelete={() => setFilters((prev) => ({ ...prev, bidTypes: prev.bidTypes.filter((x) => x !== b) }))}
                    sx={listFilterChipStyles}
                  />
                ))}

                {filters.categories.map((c) => (
                  <Chip
                    key={c}
                    label={c}
                    size="small"
                    onDelete={() => setFilters((prev) => ({ ...prev, categories: prev.categories.filter((x) => x !== c) }))}
                    sx={listFilterChipStyles}
                  />
                ))}

                {filters.prefectures.map((p) => (
                  <Chip
                    key={p}
                    label={p}
                    size="small"
                    onDelete={() => setFilters((prev) => ({ ...prev, prefectures: prev.prefectures.filter((x) => x !== p) }))}
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
            {paginatedRows.map((row) => (
              <AnnouncementCard
                key={row.id}
                row={row}
                onClick={() => handleCardClick(row.id)}
              />
            ))}
            {paginatedRows.length === 0 && (
              <Box sx={{ p: 4, textAlign: 'center', color: colors.text.muted }}>
                該当する案件がありません
              </Box>
            )}
          </Box>

          {/* ページネーション */}
          <CustomPagination
            page={paginationModel.page}
            pageSize={paginationModel.pageSize}
            rowCount={sortedRows.length}
            onPageChange={(page) => setPaginationModel({ ...paginationModel, page })}
            onPageSizeChange={(pageSize) => setPaginationModel({ page: 0, pageSize })}
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
          onSearchChange={setSearchQuery}
          sortModel={sortModel}
          onSortModelChange={setSortModel}
          filters={filters}
          onFilterChange={setFilters}
          onClearAll={handleClearAll}
          categories={[...categories]}
          activeTab={conditionTab}
          onTabChange={setConditionTab}
        />
      </RightSidePanel>
    </Box>
  );
}
