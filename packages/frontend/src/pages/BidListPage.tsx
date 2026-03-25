/**
 * 入札一覧ページ
 * 入札可否判定結果の一覧表示（カード形式）
 * サーバーサイドページネーション対応
 */
import { useCallback, useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, Typography, Paper, CircularProgress, Alert } from '@mui/material';
import { AccountBalance as OrdererIcon } from '@mui/icons-material';

// カスタムフック
import { useBidListState } from '../hooks/useBidListState';
import { useSidebar } from '../contexts/SidebarContext';

// 定数
import { colors, fontSizes, iconStyles, borderRadius } from '../constants/styles';
import { bidTypeConfig } from '../constants/bidType';
import { evaluationStatusConfig } from '../constants/status';
import { workStatusConfig } from '../constants/workStatus';
import { priorityLabels, priorityColors } from '../constants/priority';
import type { BidType } from '../types/announcement';
import type { EvaluationStatus, WorkStatus, CompanyPriority } from '../types';

// コンポーネント
import {
  CustomPagination,
  BidListHeader,
  DisplayConditionsPanel,
  FilterModal,
} from '../components/bid';
import { RightSidePanel } from '../components/layout';

// 行データの型
interface RowData {
  id: string;
  evaluationNo: string;
  status: EvaluationStatus;
  workStatus: WorkStatus;
  priority: CompanyPriority;
  title: string;
  company: string;
  branch: string;
  organization: string;
  category: string;
  bidType?: BidType;
  deadline: string;
  evaluatedAt: string;
  prefecture: string;
}

/**
 * 残り日数を計算
 */
function getCountdown(deadline: string): {
  days: number;
  label: string;
  bgColor: string;
  textColor: string;
} {
  const deadlineDate = new Date(deadline);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  deadlineDate.setHours(0, 0, 0, 0);

  const diffTime = deadlineDate.getTime() - today.getTime();
  const days = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  if (days < 0) {
    return { days, label: '締切済', bgColor: colors.border.light, textColor: colors.text.muted };
  }
  if (days === 0) {
    return { days, label: '本日まで', bgColor: colors.status.error.bg, textColor: colors.status.error.main };
  }
  if (days <= 3) {
    return { days, label: `あと${days}日`, bgColor: colors.status.error.bg, textColor: colors.status.error.main };
  }
  if (days <= 7) {
    return { days, label: `あと${days}日`, bgColor: colors.accent.amberBg, textColor: colors.status.warning.main };
  }
  if (days <= 14) {
    return { days, label: `あと${days}日`, bgColor: colors.accent.yellowBg, textColor: colors.accent.yellowDark };
  }
  return { days, label: `あと${days}日`, bgColor: colors.status.success.bg, textColor: colors.status.success.main };
}

/**
 * 判定結果カード（高級感デザイン）
 */
function EvaluationCard({ row, onClick }: { row: RowData; onClick: () => void }) {
  const evalStatus = evaluationStatusConfig[row.status];
  const workStatus = workStatusConfig[row.workStatus];
  const priorityLabel = priorityLabels[row.priority];
  const priorityColor = priorityColors[row.priority];
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
          backgroundColor: evalStatus.color,
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
            No. {row.evaluationNo}
          </Typography>

          {/* ステータスバッジグループ */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography
              sx={{
                fontSize: fontSizes.xs,
                fontWeight: 600,
                color: workStatus.color,
                letterSpacing: '0.03em',
              }}
            >
              {workStatus.label}
            </Typography>
            <Box sx={{ width: '1px', height: '14px', backgroundColor: colors.border.main }} />
            <Typography
              sx={{
                fontSize: fontSizes.xs,
                fontWeight: 600,
                color: evalStatus.color,
                letterSpacing: '0.03em',
              }}
            >
              {evalStatus.label}
            </Typography>
            <Box sx={{ width: '1px', height: '14px', backgroundColor: colors.border.main }} />
            <Typography
              sx={{
                fontSize: fontSizes.xs,
                fontWeight: 600,
                color: priorityColor.color,
                letterSpacing: '0.03em',
              }}
            >
              {priorityLabel}
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

        {/* 2行目: 案件名 */}
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

        {/* 3行目: 発注機関、カテゴリ */}
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

        {/* 4行目: 判定日 */}
        <Typography
          sx={{
            fontSize: fontSizes.xs,
            color: colors.text.light,
            fontWeight: 400,
          }}
        >
          判定日: {row.evaluatedAt}
        </Typography>
      </Box>

      {/* 右: 企業情報と締切 */}
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-end',
          justifyContent: 'space-between',
          flexShrink: 0,
          minWidth: 160,
          py: 0.5,
        }}
      >
        {/* 締切 */}
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

        {/* 企業情報 */}
        <Box sx={{ textAlign: 'right', mt: 1.5 }}>
          <Typography
            sx={{
              fontSize: fontSizes.base,
              color: colors.text.secondary,
              fontWeight: 500,
            }}
          >
            {row.company}
          </Typography>
          {row.branch && (
            <Typography
              sx={{
                fontSize: fontSizes.sm,
                color: colors.text.muted,
                fontWeight: 400,
              }}
            >
              {row.branch}
            </Typography>
          )}
        </Box>
      </Box>
    </Box>
  );
}


export default function BidListPage() {
  const navigate = useNavigate();
  const { rightPanelOpen, toggleRightPanel, closeRightPanel, isMobile } = useSidebar();
  const [conditionTab, setConditionTab] = useState<'sort' | 'filter'>('sort');
  const listContainerRef = useRef<HTMLDivElement>(null);

  // アイコンクリックでパネルを開いて特定のタブを表示
  const handleOpenWithTab = useCallback((tab: 'sort' | 'filter') => {
    setConditionTab(tab);
    if (!rightPanelOpen) {
      toggleRightPanel();
    }
  }, [rightPanelOpen, toggleRightPanel]);

  // 状態管理フック
  const {
    searchQuery,
    filters,
    gridFilterModel,
    sortModel,
    paginationModel,
    rows,
    totalCount,
    statusCounts,
    isLoading,
    error,
    totalFilterCount,
    setSearchQuery,
    setFilters,
    showFilterModal,
    setShowFilterModal,
    handleSortModelChange,
    handleGridFilterChange,
    handlePaginationModelChange,
    clearAllFilters,
  } = useBidListState();

  // ページ変更時にスクロール位置をリセット
  useEffect(() => {
    if (listContainerRef.current) {
      listContainerRef.current.scrollTop = 0;
    }
  }, [paginationModel.page]);

  // 行クリックで詳細ページへ遷移
  const handleRowClick = useCallback(
    (id: string) => {
      navigate(`/detail/${id}`);
    },
    [navigate]
  );

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
          <BidListHeader
            filters={filters}
            onFilterChange={setFilters}
            onClearFilters={clearAllFilters}
            totalFilterCount={totalFilterCount}
            onOpenFilterModal={() => setShowFilterModal(true)}
          />

          {/* カード一覧 */}
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
            {isLoading ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', p: 8 }}>
                <CircularProgress />
              </Box>
            ) : error ? (
              <Box sx={{ p: 4 }}>
                <Alert severity="error">データの取得に失敗しました: {error}</Alert>
              </Box>
            ) : rows.length === 0 ? (
              <Box sx={{ p: 4, textAlign: 'center', color: colors.text.muted }}>
                該当するデータがありません
              </Box>
            ) : (
              rows.map((row) => (
                <EvaluationCard
                  key={row.id}
                  row={row as RowData}
                  onClick={() => handleRowClick(row.id)}
                />
              ))
            )}
          </Box>

          {/* カスタムページネーション */}
          <CustomPagination
            page={paginationModel.page}
            pageSize={paginationModel.pageSize}
            rowCount={totalCount}
            onPageChange={(page) =>
              handlePaginationModelChange({ ...paginationModel, page })
            }
            onPageSizeChange={(pageSize) =>
              handlePaginationModelChange({ page: 0, pageSize })
            }
          />
        </Paper>
      </Box>

      {/* 右サイドパネル（表示条件） */}
      <RightSidePanel
        open={rightPanelOpen}
        onToggle={toggleRightPanel}
        onClose={closeRightPanel}
        onOpenWithTab={handleOpenWithTab}
        isMobile={isMobile}
      >
        <DisplayConditionsPanel
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          sortModel={sortModel}
          onSortModelChange={handleSortModelChange}
          filters={filters}
          onFilterChange={setFilters}
          onClearAll={clearAllFilters}
          statusCounts={statusCounts}
          activeTab={conditionTab}
          onTabChange={setConditionTab}
        />
      </RightSidePanel>
      {showFilterModal && (
        <FilterModal
          filters={filters}
          gridFilterModel={gridFilterModel}
          onApply={setFilters}
          onGridFilterApply={handleGridFilterChange}
          onClose={() => setShowFilterModal(false)}
          statusCounts={statusCounts}
        />
      )}
    </Box>
  );
}
