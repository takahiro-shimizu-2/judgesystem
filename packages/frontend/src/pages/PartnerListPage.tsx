/**
 * 会社情報一覧ページ（カード形式 + 右パネル）
 */
import { useCallback, useMemo, useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Paper,
  Typography,
  Chip,
  Rating,
} from '@mui/material';
import {
  Business as BusinessIcon,
  Phone as PhoneIcon,
} from '@mui/icons-material';
import type { GridSortModel } from '@mui/x-data-grid';
import { partners, allCategories } from '../data';
import { colors, pageStyles, fontSizes, chipStyles, listFilterChipStyles, iconStyles, borderRadius } from '../constants/styles';
import { allPrefectures, extractPrefecture } from '../constants/prefectures';
import { CustomPagination } from '../components/bid';
import { RightSidePanel } from '../components/layout';
import { PartnerDisplayConditionsPanel, type PartnerFilterState } from '../components/partner';
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
  categories: string[];
  prefecture: string;
}

/**
 * 会社情報カード
 */
function PartnerCard({ row, onClick }: { row: RowData; onClick: () => void }) {
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
          {row.categories.map((category, index) => (
            <Chip
              key={index}
              label={category}
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

// 日本語検索対応
function japaneseIncludes(target: string, query: string): boolean {
  return target.toLowerCase().includes(query.toLowerCase());
}

// ナビゲーション追跡用
const NAV_TRACKING_KEY = 'lastVisitedPath';

export default function PartnerListPage() {
  const navigate = useNavigate();
  const { rightPanelOpen, toggleRightPanel, closeRightPanel, isMobile } = useSidebar();
  const [conditionTab, setConditionTab] = useState<'sort' | 'filter'>('sort');
  const listContainerRef = useRef<HTMLDivElement>(null);

  // 検索クエリ
  const [searchQuery, setSearchQuery] = useState('');

  // ソートモデル
  const [sortModel, setSortModel] = useState<GridSortModel>([]);

  // フィルター状態
  const [filters, setFilters] = useState<PartnerFilterState>({
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
      // /partners/* からの戻りの場合はlocalStorageから復元
      if (lastPath && /^\/partners\//.test(lastPath)) {
        const saved = localStorage.getItem('partnerlist-page');
        if (saved) return JSON.parse(saved);
      }
    } catch { /* ignore */ }
    return { page: 0, pageSize: 25 };
  });

  // ページ番号を保存 & 現在のパスを記録
  useEffect(() => {
    try {
      localStorage.setItem('partnerlist-page', JSON.stringify(paginationModel));
      // 一覧ページのパスを保存（他の一覧から来た場合のページリセット用）
      sessionStorage.setItem(NAV_TRACKING_KEY, '/partners');
    } catch { /* ignore */ }
  }, [paginationModel]);

  // アクティブなフィルター数
  const totalFilterCount = filters.ratings.length +
    (filters.hasPrimeQualification !== 'all' ? 1 : 0) +
    filters.categories.length +
    (filters.hasSurvey !== 'all' ? 1 : 0) +
    filters.prefectures.length;

  // フィルター適用後のデータ
  const filteredPartners = useMemo(() => {
    return partners.filter((partner) => {
      // 検索
      if (searchQuery.trim()) {
        const q = searchQuery.trim();
        if (!japaneseIncludes(partner.name, q) &&
            !japaneseIncludes(partner.address, q) &&
            !japaneseIncludes(partner.phone, q) &&
            !partner.categories.some(c => japaneseIncludes(c, q))) {
          return false;
        }
      }
      // 評価フィルター
      if (filters.ratings.length > 0) {
        if (partner.rating == null || !filters.ratings.includes(partner.rating)) {
          return false;
        }
      }
      // 元請資格フィルター
      if (filters.hasPrimeQualification !== 'all') {
        const hasQualification = partner.qualifications.unified.length > 0 || partner.qualifications.orderers.length > 0;
        if (filters.hasPrimeQualification === 'yes' && !hasQualification) return false;
        if (filters.hasPrimeQualification === 'no' && hasQualification) return false;
      }
      // 種別フィルター
      if (filters.categories.length > 0 && !filters.categories.some(c => partner.categories.includes(c))) {
        return false;
      }
      // 現地調査実績フィルター
      if (filters.hasSurvey !== 'all') {
        const surveyCount = partner.surveyCount ?? 0;
        if (filters.hasSurvey === 'yes' && surveyCount === 0) return false;
        if (filters.hasSurvey === 'no' && surveyCount > 0) return false;
      }
      // 都道府県フィルター
      if (filters.prefectures.length > 0) {
        const pref = extractPrefecture(partner.address);
        if (!pref || !filters.prefectures.includes(pref)) return false;
      }
      return true;
    });
  }, [searchQuery, filters]);

  // 行データに変換
  const partnerRows: RowData[] = useMemo(() => {
    return filteredPartners.map((p) => ({
      id: p.id,
      no: String(p.no).padStart(8, '0'),
      name: p.name,
      address: p.address,
      phone: p.phone,
      surveyCount: p.surveyCount ?? null,
      rating: p.rating ?? null,
      resultCount: p.resultCount ?? null,
      hasPrimeQualification: p.qualifications.unified.length > 0 || p.qualifications.orderers.length > 0,
      categories: p.categories,
      prefecture: extractPrefecture(p.address) || '',
    }));
  }, [filteredPartners]);

  // ソート適用
  const sortedRows = useMemo(() => {
    if (sortModel.length === 0) return partnerRows;

    return [...partnerRows].sort((a, b) => {
      for (const sort of sortModel) {
        let comparison = 0;
        const field = sort.field as keyof RowData;

        if (field === 'rating' || field === 'resultCount' || field === 'surveyCount') {
          const aValue = a[field] as number | null;
          const bValue = b[field] as number | null;
          if (aValue == null && bValue == null) {
            comparison = 0;
          } else if (aValue == null) {
            comparison = -1;
          } else if (bValue == null) {
            comparison = 1;
          } else {
            comparison = aValue - bValue;
          }
        } else if (field === 'prefecture') {
          const idxA = allPrefectures.indexOf(a.prefecture);
          const idxB = allPrefectures.indexOf(b.prefecture);
          comparison = (idxA === -1 ? 99 : idxA) - (idxB === -1 ? 99 : idxB);
        } else {
          comparison = String(a[field]).localeCompare(String(b[field]));
        }

        if (comparison !== 0) {
          return sort.sort === 'desc' ? -comparison : comparison;
        }
      }
      return 0;
    });
  }, [partnerRows, sortModel]);

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
    navigate(`/partners/${id}`);
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
            }}
          >
            {paginatedRows.map((row) => (
              <PartnerCard
                key={row.id}
                row={row}
                onClick={() => handleCardClick(row.id)}
              />
            ))}
            {paginatedRows.length === 0 && (
              <Box sx={{ p: 4, textAlign: 'center', color: colors.text.muted }}>
                該当する会社がありません
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
        <PartnerDisplayConditionsPanel
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
