/**
 * 発注者一覧ページ（カード形式）
 */
import { useCallback, useMemo, useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Paper,
  Typography,
  Chip,
  CircularProgress,
} from '@mui/material';
import {
  Business as BusinessIcon,
} from '@mui/icons-material';
import type { GridSortModel } from '@mui/x-data-grid';
import { fetchOrdererList, ordererCategoryConfig } from '../data';
import type { Orderer } from '../types/orderer';

import { fontSizes, colors, pageStyles, iconStyles, borderRadius, listFilterChipStyles } from '../constants/styles';
import { getOrganizationGroup } from '../constants/organizations';
import { allPrefectures } from '../constants/prefectures';
import type { OrdererCategory } from '../types/orderer';
import { CustomPagination } from '../components/bid';
import { OrdererDisplayConditionsPanel, type OrdererFilterState } from '../components/orderer';
import { RightSidePanel } from '../components/layout';
import { useSidebar } from '../contexts/SidebarContext';

// 住所から都道府県を抽出
function extractPrefecture(address: string): string {
  const match = address.match(/^(北海道|東京都|大阪府|京都府|.{2,3}県)/);
  return match ? match[1] : '';
}

// 行データの型
interface RowData {
  id: string;
  no: number;
  category: OrdererCategory;
  name: string;
  address: string;
  announcementCount: number;
  averageAmount: number;
  lastAnnouncementDate: string;
  prefecture: string;
}

/**
 * 発注者カード
 */
function OrdererCard({ row, onClick }: { row: RowData; onClick: () => void }) {
  const categoryConfig = ordererCategoryConfig[row.category];

  return (
    <Box
      onClick={onClick}
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
          backgroundColor: categoryConfig.color,
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
            No. {String(row.no).padStart(8, '0')}
          </Typography>

          {/* 種別バッジ */}
          <Typography
            sx={{
              fontSize: fontSizes.xs,
              fontWeight: 600,
              color: categoryConfig.color,
              letterSpacing: '0.03em',
            }}
          >
            {categoryConfig.label}
          </Typography>
        </Box>

        {/* 2行目: 機関名 */}
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
              }}
            >
              {row.prefecture}
            </Typography>
          )}
        </Typography>

        {/* 3行目: 住所 */}
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
            <BusinessIcon sx={{ ...iconStyles.small, color: colors.text.light }} />
            <Typography sx={{ fontSize: fontSizes.md, color: colors.text.muted, fontWeight: 400 }}>
              {row.address}
            </Typography>
          </Box>
        </Box>

        {/* 4行目: 最終公告日 */}
        <Typography
          sx={{
            fontSize: fontSizes.xs,
            color: colors.text.light,
            fontWeight: 400,
          }}
        >
          最終公告: {row.lastAnnouncementDate}
        </Typography>
      </Box>

      {/* 右: 統計情報 */}
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-end',
          justifyContent: 'space-between',
          flexShrink: 0,
          minWidth: 100,
          py: 0.5,
        }}
      >
        {/* 公告数 */}
        <Box sx={{ textAlign: 'right' }}>
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
            公告数
          </Typography>
          <Typography
            sx={{
              fontSize: fontSizes.lg,
              color: colors.accent.blue,
              fontWeight: 600,
              letterSpacing: '-0.01em',
            }}
          >
            {row.announcementCount}件
          </Typography>
        </Box>

        {/* 平均落札額 */}
        <Box sx={{ textAlign: 'right', mt: 1.5 }}>
          <Typography
            sx={{
              fontSize: fontSizes.xs,
              color: colors.text.light,
              fontWeight: 500,
              mb: 0.25,
            }}
          >
            平均落札
          </Typography>
          <Typography
            sx={{
              fontSize: fontSizes.base,
              color: colors.text.secondary,
              fontWeight: 600,
            }}
          >
            {(row.averageAmount / 10000).toLocaleString()}万
          </Typography>
        </Box>
      </Box>
    </Box>
  );
}

// ナビゲーション追跡用
const NAV_TRACKING_KEY = 'lastVisitedPath';

export default function OrdererListPage() {
  const navigate = useNavigate();
  const listContainerRef = useRef<HTMLDivElement>(null);
  const { rightPanelOpen, toggleRightPanel, closeRightPanel, isMobile } = useSidebar();

  // 発注者データ（遅延取得）
  const [orderers, setOrderers] = useState<Orderer[]>([]);
  const [loadingOrderers, setLoadingOrderers] = useState(true);

  useEffect(() => {
    let isMounted = true;
    fetchOrdererList().then((data) => {
      if (isMounted) {
        setOrderers(data);
        setLoadingOrderers(false);
      }
    });
    return () => { isMounted = false; };
  }, []);

  // ユニークな都道府県を取得
  const uniquePrefectures = useMemo(
    () =>
      Array.from(
        new Set(orderers.map((o) => extractPrefecture(o.address)).filter(Boolean))
      ).sort(),
    [orderers],
  );

  // 検索クエリ
  const [searchQuery, setSearchQuery] = useState('');

  // ソートモデル
  const [sortModel, setSortModel] = useState<GridSortModel>([]);

  // フィルター状態
  const [filters, setFilters] = useState<OrdererFilterState>({
    categories: [],
    prefectures: [],
    organizations: [],
  });

  // ページネーション（詳細から戻った場合のみ復元）
  const [paginationModel, setPaginationModel] = useState<{ page: number; pageSize: number }>(() => {
    try {
      const lastPath = sessionStorage.getItem(NAV_TRACKING_KEY);
      // /orderers/* からの戻りの場合はlocalStorageから復元
      if (lastPath && /^\/orderers\//.test(lastPath)) {
        const saved = localStorage.getItem('ordererlist-page');
        if (saved) return JSON.parse(saved);
      }
    } catch { /* ignore */ }
    return { page: 0, pageSize: 25 };
  });

  // ページ番号を保存 & 現在のパスを記録
  useEffect(() => {
    try {
      localStorage.setItem('ordererlist-page', JSON.stringify(paginationModel));
      // 一覧ページのパスを保存（他の一覧から来た場合のページリセット用）
      sessionStorage.setItem(NAV_TRACKING_KEY, '/orderers');
    } catch { /* ignore */ }
  }, [paginationModel]);

  // アクティブなフィルター数
  const totalFilterCount = filters.categories.length + filters.prefectures.length + filters.organizations.length;

  // フィルター適用後のデータ
  const filteredOrderers = useMemo(() => {
    return orderers.filter((orderer) => {
      // 種別フィルター
      if (filters.categories.length > 0 && !filters.categories.includes(orderer.category)) {
        return false;
      }
      // 都道府県フィルター
      if (filters.prefectures.length > 0) {
        const prefecture = extractPrefecture(orderer.address);
        if (!filters.prefectures.includes(prefecture)) return false;
      }
      // 発注機関フィルター
      if (filters.organizations.length > 0) {
        const orgGroup = getOrganizationGroup(orderer.name);
        if (!filters.organizations.includes(orgGroup)) return false;
      }
      return true;
    });
  }, [filters, orderers]);

  // 行データに変換
  const ordererRows: RowData[] = useMemo(() => {
    return filteredOrderers.map((o) => ({
      id: o.id,
      no: o.no,
      category: o.category,
      name: o.name,
      address: o.address,
      announcementCount: o.announcementCount,
      averageAmount: o.averageAmount,
      lastAnnouncementDate: o.lastAnnouncementDate,
      prefecture: extractPrefecture(o.address),
    }));
  }, [filteredOrderers]);

  // 検索フィルター適用
  const searchedRows = useMemo(() => {
    if (!searchQuery.trim()) return ordererRows;
    const query = searchQuery.toLowerCase();
    return ordererRows.filter(
      (row) =>
        row.name.toLowerCase().includes(query) ||
        row.address.toLowerCase().includes(query)
    );
  }, [ordererRows, searchQuery]);

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

        // 都道府県は北→南の順でソート
        if (field === 'prefecture') {
          const idxA = allPrefectures.indexOf(aVal as string);
          const idxB = allPrefectures.indexOf(bVal as string);
          comparison = (idxA === -1 ? 99 : idxA) - (idxB === -1 ? 99 : idxB);
        } else if (typeof aVal === 'string' && typeof bVal === 'string') {
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

  const handleCardClick = (id: string) => {
    navigate(`/orderers/${id}`);
  };

  const handleClearAll = useCallback(() => {
    setSearchQuery('');
    setSortModel([]);
    setFilters({ categories: [], prefectures: [], organizations: [] });
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
            <Typography variant="h5" sx={pageStyles.pageTitle}>
              発注者一覧
            </Typography>

            {/* アクティブフィルターチップ */}
            {totalFilterCount > 0 && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                <Typography sx={{ fontSize: fontSizes.xs, color: colors.text.muted, fontWeight: 500 }}>
                  絞り込み:
                </Typography>
                <Typography
                  component="button"
                  onClick={() => setFilters({ categories: [], prefectures: [], organizations: [] })}
                  sx={{ fontSize: fontSizes.xs, color: colors.accent.red, fontWeight: 600, cursor: 'pointer', background: 'none', border: 'none', p: 0, mr: 0.5, '&:hover': { color: colors.status.error.main } }}
                >
                  クリア
                </Typography>

                {filters.categories.map((c) => (
                  <Chip
                    key={c}
                    label={ordererCategoryConfig[c as OrdererCategory]?.label || c}
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

                {filters.organizations.map((o) => (
                  <Chip
                    key={o}
                    label={o}
                    size="small"
                    onDelete={() => setFilters((prev) => ({ ...prev, organizations: prev.organizations.filter((x) => x !== o) }))}
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
            {loadingOrderers ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
                <CircularProgress size={32} />
              </Box>
            ) : (
              <>
                {paginatedRows.map((row) => (
                  <OrdererCard
                    key={row.id}
                    row={row}
                    onClick={() => handleCardClick(row.id)}
                  />
                ))}
                {paginatedRows.length === 0 && (
                  <Box sx={{ p: 4, textAlign: 'center', color: colors.text.muted }}>
                    該当する発注者がありません
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
        <OrdererDisplayConditionsPanel
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          sortModel={sortModel}
          onSortModelChange={setSortModel}
          filters={filters}
          onFilterChange={setFilters}
          onClearAll={handleClearAll}
          prefectures={uniquePrefectures}
        />
      </RightSidePanel>
    </Box>
  );
}
