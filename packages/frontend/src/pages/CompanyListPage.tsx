/**
 * 会社情報一覧ページ（カード形式 + 右パネル）
 */
import { useCallback, useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Paper,
  Typography,
  Chip,
  Rating,
  CircularProgress,
} from '@mui/material';
import {
  Business as BusinessIcon,
  Phone as PhoneIcon,
} from '@mui/icons-material';
import type { GridSortModel } from '@mui/x-data-grid';
import { fetchCompanyMasterList, allCategories } from '../data';
import type { CompanyListRow } from '../data';
import { colors, pageStyles, fontSizes, chipStyles, listFilterChipStyles, iconStyles, borderRadius } from '../constants/styles';
import { extractPrefecture } from '../constants/prefectures';
import { CustomPagination } from '../components/bid';
import { RightSidePanel } from '../components/layout';
import { CompanyDisplayConditionsPanel, type CompanyFilterState } from '../components/company';
import { useSidebar } from '../contexts/SidebarContext';


// 行データの型
interface RowData {
  id: string;
  no: string;
  name: string;
  address: string;
  phone: string;
  surveyCount: number | null;
  rating: number | null;
  resultCount: number | null;
  hasPrimeQualification: boolean;
  categories: { group: string | null; name: string }[];
  prefecture: string;
}

/**
 * 会社情報カード
 */
function CompanyCard({ row, onClick }: { row: RowData; onClick: () => void }) {
  // 評価に応じた色
  const getRatingColor = (rating: number | null) => {
    if (rating == null) return colors.text.muted;
    if (rating >= 2.5) return colors.status.success.main;
    if (rating >= 1.5) return colors.status.warning.main;
    return colors.text.muted;
  };

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
          backgroundColor: getRatingColor(row.rating),
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
            {row.hasPrimeQualification && (
              <>
                <Typography
                  sx={{
                    fontSize: fontSizes.xs,
                    fontWeight: 600,
                    color: colors.accent.greenSuccess,
                    letterSpacing: '0.03em',
                  }}
                >
                  元請資格あり
                </Typography>
                <Box sx={{ width: '1px', height: '14px', backgroundColor: colors.border.main }} />
              </>
            )}
            {row.surveyCount != null && row.surveyCount > 0 && (
              <Typography
                sx={{
                  fontSize: fontSizes.xs,
                  fontWeight: 500,
                  color: colors.accent.blue,
                  letterSpacing: '0.03em',
                }}
              >
                現地調査 {row.surveyCount}回
              </Typography>
            )}
          </Box>
        </Box>

        {/* 2行目: 会社名 */}
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

        {/* 3行目: 住所、電話番号 */}
        <Box
          sx={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 2,
            alignItems: 'center',
            mb: 1.5,
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
            <BusinessIcon sx={{ ...iconStyles.small, color: colors.text.light }} />
            <Typography sx={{ fontSize: fontSizes.md, color: colors.text.muted, fontWeight: 400 }}>
              {row.address}
            </Typography>
          </Box>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
            <PhoneIcon sx={{ ...iconStyles.small, color: colors.text.light }} />
            <Typography sx={{ fontSize: fontSizes.md, color: colors.text.muted, fontWeight: 400 }}>
              {row.phone}
            </Typography>
          </Box>
        </Box>

        {/* 4行目: カテゴリ */}
        <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
          {row.categories.map((cat, index) => (
            <Chip
              key={index}
              label={cat.name}
              size="small"
              sx={{
                ...chipStyles.small,
                backgroundColor: colors.status.info.bg,
                color: colors.accent.blue,
              }}
            />
          ))}
        </Box>
      </Box>

      {/* 右: 評価と実績 */}
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
        {/* 評価 */}
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
            評価
          </Typography>
          <Rating value={row.rating ?? 0} max={3} precision={0.5} readOnly size="small" />
        </Box>

        {/* 実績数 */}
        <Box sx={{ textAlign: 'right', mt: 1.5 }}>
          <Typography
            sx={{
              fontSize: fontSizes.xs,
              color: colors.text.light,
              fontWeight: 500,
              mb: 0.25,
            }}
          >
            実績
          </Typography>
          <Typography
            sx={{
              fontSize: fontSizes.lg,
              color: colors.text.secondary,
              fontWeight: 600,
            }}
          >
            {row.resultCount != null ? `${row.resultCount}件` : '未設定'}
          </Typography>
        </Box>
      </Box>
    </Box>
  );
}

// ナビゲーション追跡用
const NAV_TRACKING_KEY = 'lastVisitedPath';

export default function CompanyListPage() {
  const navigate = useNavigate();
  const { rightPanelOpen, toggleRightPanel, closeRightPanel, isMobile } = useSidebar();
  const [conditionTab, setConditionTab] = useState<'sort' | 'filter'>('sort');
  const listContainerRef = useRef<HTMLDivElement>(null);

  // サーバーサイド データ
  const [loading, setLoading] = useState(true);
  const [companyRows, setCompanyRows] = useState<RowData[]>([]);
  const [total, setTotal] = useState(0);

  // 検索クエリ（入力値とデバウンス後の値を分離）
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  // ソートモデル
  const [sortModel, setSortModel] = useState<GridSortModel>([]);

  // フィルター状態
  const [filters, setFilters] = useState<CompanyFilterState>({
    ratings: [],
    hasPrimeQualification: 'all',
    categories: [],
    hasSurvey: 'all',
    prefectures: [],
  });

  // ページネーション（詳細から戻った場合のみ復元）
  const [paginationModel, setPaginationModel] = useState<{ page: number; pageSize: number }>(() => {
    try {
      const lastPath = sessionStorage.getItem(NAV_TRACKING_KEY);
      if (lastPath && /^\/companies\//.test(lastPath)) {
        const saved = localStorage.getItem('companylist-page');
        if (saved) return JSON.parse(saved);
      }
    } catch { /* ignore */ }
    return { page: 0, pageSize: 25 };
  });

  // ページ番号を保存 & 現在のパスを記録
  useEffect(() => {
    try {
      localStorage.setItem('companylist-page', JSON.stringify(paginationModel));
      sessionStorage.setItem(NAV_TRACKING_KEY, '/companies');
    } catch { /* ignore */ }
  }, [paginationModel]);

  // 検索デバウンス（300ms）
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery), 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // デバウンス後の検索・フィルタ・ソート変更時にページを0にリセット
  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    setPaginationModel((prev) => (prev.page === 0 ? prev : { ...prev, page: 0 }));
  }, [debouncedSearch, filters, sortModel]);

  // サーバーからデータ取得
  useEffect(() => {
    const controller = new AbortController();
    const fetchData = async () => {
      setLoading(true);
      try {
        const sort = sortModel[0];
        const result = await fetchCompanyMasterList(
          {
            page: paginationModel.page,
            pageSize: paginationModel.pageSize,
            q: debouncedSearch || undefined,
            prefectures: filters.prefectures.length > 0 ? filters.prefectures : undefined,
            categories: filters.categories.length > 0 ? filters.categories : undefined,
            ratings: filters.ratings.length > 0 ? filters.ratings : undefined,
            hasSurvey: filters.hasSurvey !== 'all' ? filters.hasSurvey : undefined,
            hasPrimeQualification: filters.hasPrimeQualification !== 'all' ? filters.hasPrimeQualification : undefined,
            sort: sort?.field,
            order: sort?.sort ?? undefined,
          },
          controller.signal,
        );
        if (!controller.signal.aborted) {
          setCompanyRows(
            result.data.map((p: CompanyListRow) => ({
              id: p.id,
              no: String(p.no).padStart(8, '0'),
              name: p.name,
              address: p.address,
              phone: p.phone,
              surveyCount: p.surveyCount,
              rating: p.rating,
              resultCount: p.resultCount,
              hasPrimeQualification: p.hasPrimeQualification,
              categories: p.categories,
              prefecture: extractPrefecture(p.address) || '',
            })),
          );
          setTotal(result.total);
        }
      } catch (err) {
        if (!controller.signal.aborted) {
          console.error('Failed to fetch companies:', err);
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    };
    fetchData();
    return () => controller.abort();
  }, [debouncedSearch, filters, sortModel, paginationModel]);

  // ページ変更時にスクロール位置をリセット
  useEffect(() => {
    if (listContainerRef.current) {
      listContainerRef.current.scrollTop = 0;
    }
  }, [paginationModel.page]);

  // アクティブなフィルター数
  const totalFilterCount = filters.ratings.length +
    (filters.hasPrimeQualification !== 'all' ? 1 : 0) +
    filters.categories.length +
    (filters.hasSurvey !== 'all' ? 1 : 0) +
    filters.prefectures.length;

  const handleCardClick = (id: string) => {
    navigate(`/companies/${id}`);
  };

  const handleClearAll = useCallback(() => {
    setSearchQuery('');
    setSortModel([]);
    setFilters({ ratings: [], hasPrimeQualification: 'all', categories: [], hasSurvey: 'all', prefectures: [] });
  }, []);

  const handleOpenWithTab = useCallback((tab: 'sort' | 'filter') => {
    setConditionTab(tab);
    if (!rightPanelOpen) {
      toggleRightPanel();
    }
  }, [rightPanelOpen, toggleRightPanel]);

  // 評価ラベルを取得
  const getRatingLabel = (rating: number) => {
    return '★'.repeat(rating);
  };

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
              会社情報一覧
            </Typography>

            {/* アクティブフィルターチップ */}
            {totalFilterCount > 0 && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                <Typography sx={{ fontSize: fontSizes.xs, color: colors.text.muted, fontWeight: 500 }}>
                  絞り込み:
                </Typography>
                <Typography
                  component="button"
                  onClick={() => setFilters({ ratings: [], hasPrimeQualification: 'all', categories: [], hasSurvey: 'all', prefectures: [] })}
                  sx={{ fontSize: fontSizes.xs, color: colors.accent.red, fontWeight: 600, cursor: 'pointer', background: 'none', border: 'none', p: 0, mr: 0.5, '&:hover': { color: colors.status.error.main } }}
                >
                  クリア
                </Typography>

                {filters.ratings.map((r) => (
                  <Chip
                    key={r}
                    label={getRatingLabel(r)}
                    size="small"
                    onDelete={() => setFilters((prev) => ({ ...prev, ratings: prev.ratings.filter((x) => x !== r) }))}
                    sx={listFilterChipStyles}
                  />
                ))}

                {filters.hasPrimeQualification !== 'all' && (
                  <Chip
                    label={`元請: ${filters.hasPrimeQualification === 'yes' ? 'あり' : 'なし'}`}
                    size="small"
                    onDelete={() => setFilters((prev) => ({ ...prev, hasPrimeQualification: 'all' }))}
                    sx={listFilterChipStyles}
                  />
                )}

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

                {filters.hasSurvey !== 'all' && (
                  <Chip
                    label={`現地調査: ${filters.hasSurvey === 'yes' ? 'あり' : 'なし'}`}
                    size="small"
                    onDelete={() => setFilters((prev) => ({ ...prev, hasSurvey: 'all' }))}
                    sx={listFilterChipStyles}
                  />
                )}
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
              position: 'relative',
            }}
          >
            {loading && companyRows.length === 0 ? (
              <Box sx={{ p: 4, textAlign: 'center' }}>
                <CircularProgress size={32} />
              </Box>
            ) : (
              <>
                {loading && (
                  <Box sx={{ position: 'absolute', top: 8, left: '50%', transform: 'translateX(-50%)', zIndex: 1 }}>
                    <CircularProgress size={20} />
                  </Box>
                )}
                {companyRows.map((row) => (
                  <CompanyCard
                    key={row.id}
                    row={row}
                    onClick={() => handleCardClick(row.id)}
                  />
                ))}
                {!loading && companyRows.length === 0 && (
                  <Box sx={{ p: 4, textAlign: 'center', color: colors.text.muted }}>
                    該当する会社がありません
                  </Box>
                )}
              </>
            )}
          </Box>

          {/* ページネーション */}
          <CustomPagination
            page={paginationModel.page}
            pageSize={paginationModel.pageSize}
            rowCount={total}
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
        <CompanyDisplayConditionsPanel
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          sortModel={sortModel}
          onSortModelChange={setSortModel}
          filters={filters}
          onFilterChange={setFilters}
          onClearAll={handleClearAll}
          categories={allCategories}
          activeTab={conditionTab}
          onTabChange={setConditionTab}
        />
      </RightSidePanel>
    </Box>
  );
}
