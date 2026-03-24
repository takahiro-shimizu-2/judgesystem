/**
 * 右サイドパネルコンポーネント
 * 左サイドバーと同じパターンで開閉可能（Boxベース）
 */
import { Box, Drawer, IconButton, Tooltip, Typography } from '@mui/material';
import {
  Close as CloseIcon,
  ChevronRight as ChevronRightIcon,
  Search as SearchIcon,
  SwapVert as SortIcon,
  FilterAlt as FilterIcon,
} from '@mui/icons-material';
import { colors, rightPanelColors, fontSizes, iconStyles } from '../../constants/styles';

const PANEL_WIDTH_OPEN = 320;
const PANEL_WIDTH_CLOSED = 56;
const PANEL_WIDTH_MOBILE = 300;

interface RightSidePanelProps {
  children: React.ReactNode;
  title?: string;
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
  onOpenWithTab?: (tab: 'sort' | 'filter') => void;
  isMobile: boolean;
}

export function RightSidePanel({
  children,
  title = '表示条件',
  open,
  onToggle,
  onClose,
  onOpenWithTab,
  isMobile,
}: RightSidePanelProps) {
  const panelWidth = open ? PANEL_WIDTH_OPEN : PANEL_WIDTH_CLOSED;
  const isExpanded = open;

  // モバイル: temporaryドロワー
  if (isMobile) {
    return (
      <Drawer
        anchor="right"
        variant="temporary"
        open={open}
        onClose={onClose}
        ModalProps={{ keepMounted: true }}
        sx={{
          display: { xs: 'block', md: 'none' },
          '& .MuiDrawer-paper': {
            width: PANEL_WIDTH_MOBILE,
            boxSizing: 'border-box',
            backgroundColor: rightPanelColors.background,
            borderLeft: `1px solid ${rightPanelColors.border}`,
          },
        }}
      >
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            height: '100%',
          }}
        >
          {/* ヘッダー */}
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              px: 2,
              py: 2,
              minHeight: 56,
              backgroundColor: rightPanelColors.headerBg,
              borderBottom: `1px solid ${rightPanelColors.border}`,
            }}
          >
            <Typography
              sx={{
                fontSize: fontSizes.base,
                fontWeight: 600,
                color: rightPanelColors.text,
              }}
            >
              {title}
            </Typography>
            <IconButton
              onClick={onClose}
              sx={{
                color: rightPanelColors.textMuted,
                p: 0.75,
                '&:hover': {
                  backgroundColor: 'rgba(255, 255, 255, 0.08)',
                  color: rightPanelColors.text,
                },
              }}
            >
              <CloseIcon sx={iconStyles.medium} />
            </IconButton>
          </Box>
          {/* コンテンツ */}
          <Box sx={{ flex: 1, overflowY: 'auto', px: 2.5, py: 2 }}>
            {children}
          </Box>
        </Box>
      </Drawer>
    );
  }

  // デスクトップ: Boxベースのパネル（flexレイアウト用）
  return (
    <Box
      sx={{
        display: { xs: 'none', md: 'flex' },
        flexDirection: 'column',
        width: panelWidth,
        minWidth: panelWidth,
        height: '100%',
        backgroundColor: rightPanelColors.background,
        borderLeft: `1px solid ${colors.accent.blue}4d`,
        boxShadow: '-8px 0 24px rgba(0, 0, 0, 0.2)',
        transition: 'width 0.2s ease, min-width 0.2s ease',
        overflow: 'hidden',
      }}
    >
      {/* ヘッダー（展開時のみ表示） */}
      {isExpanded && (
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            px: 2.5,
            py: 2,
            minHeight: 56,
            background: 'linear-gradient(135deg, #1a2332 0%, #0f172a 100%)',
            borderBottom: `1px solid ${colors.accent.blue}33`,
          }}
        >
          <Typography
            sx={{
              fontSize: fontSizes.base,
              fontWeight: 600,
              color: colors.text.white,
              letterSpacing: '0.02em',
              display: 'flex',
              alignItems: 'center',
              gap: 1,
              '&::before': {
                content: '""',
                display: 'block',
                width: '3px',
                height: '1em',
                background: 'linear-gradient(180deg, #3b82f6 0%, #2563eb 100%)',
                borderRadius: '2px',
              },
            }}
          >
            {title}
          </Typography>
          <Tooltip title="閉じる" placement="left" arrow>
            <IconButton
              onClick={onToggle}
              sx={{
                color: 'rgba(255, 255, 255, 0.5)',
                p: 0.5,
                '&:hover': {
                  backgroundColor: 'rgba(255, 255, 255, 0.05)',
                  color: colors.accent.blue,
                },
              }}
            >
              <ChevronRightIcon sx={iconStyles.medium} />
            </IconButton>
          </Tooltip>
        </Box>
      )}

      {/* コンテンツ */}
      {isExpanded ? (
        <Box
          sx={{
            flex: 1,
            overflowY: 'auto',
            px: 2.5,
            py: 2,
            backgroundColor: colors.primary.dark,
          }}
        >
          {children}
        </Box>
      ) : (
        /* 閉じた状態: アイコンを縦に表示 */
        <Box
          sx={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            pt: 2,
            gap: 0.5,
            backgroundColor: colors.primary.dark,
          }}
        >
          <Tooltip title="検索" placement="left" arrow>
            <IconButton
              onClick={() => onOpenWithTab ? onOpenWithTab('sort') : onToggle()}
              sx={{
                color: 'rgba(255, 255, 255, 0.4)',
                p: 1,
                '&:hover': {
                  backgroundColor: 'rgba(255, 255, 255, 0.05)',
                  color: colors.accent.blue,
                },
              }}
            >
              <SearchIcon sx={iconStyles.medium} />
            </IconButton>
          </Tooltip>
          <Tooltip title="ソート" placement="left" arrow>
            <IconButton
              onClick={() => onOpenWithTab ? onOpenWithTab('sort') : onToggle()}
              sx={{
                color: 'rgba(255, 255, 255, 0.4)',
                p: 1,
                '&:hover': {
                  backgroundColor: 'rgba(255, 255, 255, 0.05)',
                  color: colors.accent.blue,
                },
              }}
            >
              <SortIcon sx={iconStyles.medium} />
            </IconButton>
          </Tooltip>
          <Tooltip title="フィルター" placement="left" arrow>
            <IconButton
              onClick={() => onOpenWithTab ? onOpenWithTab('filter') : onToggle()}
              sx={{
                color: 'rgba(255, 255, 255, 0.4)',
                p: 1,
                '&:hover': {
                  backgroundColor: 'rgba(255, 255, 255, 0.05)',
                  color: colors.accent.blue,
                },
              }}
            >
              <FilterIcon sx={iconStyles.medium} />
            </IconButton>
          </Tooltip>
        </Box>
      )}
    </Box>
  );
}

export const RIGHT_PANEL_WIDTH_OPEN = PANEL_WIDTH_OPEN;
export const RIGHT_PANEL_WIDTH_CLOSED = PANEL_WIDTH_CLOSED;
