import { useState, useRef, useEffect } from 'react';
import { Button, IconButton, Box, Typography, Fade } from '@mui/material';
import {
  ArrowBack as ArrowBackIcon,
  KeyboardArrowUp as KeyboardArrowUpIcon,
  Menu as MenuIcon,
  Close as CloseIcon,
  CheckCircle as CheckCircleIcon,
  Lock as LockIcon,
} from '@mui/icons-material';
import { useSidebar } from '../../contexts/SidebarContext';
import { colors, fontSizes, iconStyles, borderRadius } from '../../constants/styles';
import { SIDEBAR_WIDTH_OPEN, SIDEBAR_WIDTH_CLOSED } from '../layout/Sidebar';

const BUTTON_STYLES = {
  base: {
    backgroundColor: colors.primary.main,
    color: colors.text.white,
    boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
    '&:hover': { backgroundColor: colors.primary.dark },
  },
  scrollTopButtonOverride: {
    backgroundColor: 'rgba(30, 58, 95, 0.35)',
    '&:hover': { backgroundColor: 'rgba(30, 58, 95, 0.6)' },
  },
  backButton: {
    display: 'flex',
    position: 'fixed',
    bottom: 20,
    fontWeight: 600,
    px: 2.5,
    py: 1.25,
    borderRadius: borderRadius.xs,
    fontSize: fontSizes.sm,
    textTransform: 'none',
    transition: 'left 0.2s ease',
  },
  scrollTopButton: {
    position: 'fixed',
    bottom: 20,
    right: 20,
    width: 48,
    height: 48,
  },
} as const;

export interface FloatingBackButtonProps {
  onClick: () => void;
  label?: string;
}

/**
 * フローティング戻るボタン（サイドバーの状態に応じて位置が変わる）
 */
export function FloatingBackButton({ onClick, label = '一覧に戻る' }: FloatingBackButtonProps) {
  const { isOpen, isMobile } = useSidebar();
  const sidebarWidth = isMobile ? 0 : isOpen ? SIDEBAR_WIDTH_OPEN : SIDEBAR_WIDTH_CLOSED;
  const leftPosition = sidebarWidth + 24;

  return (
    <Button
      startIcon={<ArrowBackIcon />}
      onClick={onClick}
      sx={{ ...BUTTON_STYLES.base, ...BUTTON_STYLES.scrollTopButtonOverride, ...BUTTON_STYLES.backButton, left: leftPosition }}
    >
      {label}
    </Button>
  );
}

/**
 * 上に戻るフローティングボタン
 */
export function ScrollToTopButton() {
  const handleClick = () => {
    // MainLayout内のスクロール可能な要素を探す
    const scrollableElement = document.querySelector('[data-scroll-container]') as HTMLElement;
    if (scrollableElement) {
      scrollableElement.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  return (
    <IconButton onClick={handleClick} sx={{ ...BUTTON_STYLES.base, ...BUTTON_STYLES.scrollTopButton, ...BUTTON_STYLES.scrollTopButtonOverride }}>
      <KeyboardArrowUpIcon />
    </IconButton>
  );
}

// ============================================================================
// フローティングワークフローメニュー
// ============================================================================

export interface WorkflowMenuItem {
  id: string;
  label: string;
  icon: React.ReactNode;
  status: 'completed' | 'current' | 'locked';
}

export interface FloatingWorkflowMenuProps {
  items: WorkflowMenuItem[];
  onItemClick: (itemId: string) => void;
}

const MENU_STYLES = {
  container: {
    position: 'fixed',
    bottom: 20,
    right: 80,
    zIndex: 1000,
  },
  menuButton: {
    width: 48,
    height: 48,
    backgroundColor: 'rgba(30, 58, 95, 0.35)',
    color: colors.text.white,
    boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
    '&:hover': { backgroundColor: 'rgba(30, 58, 95, 0.6)' },
  },
  menuPanel: {
    position: 'absolute',
    bottom: 58,
    right: 0,
    backgroundColor: colors.background.paper,
    borderRadius: borderRadius.xl,
    boxShadow: '0 8px 32px rgba(0,0,0,0.15)',
    p: 1.5,
    minWidth: 200,
  },
  menuItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 1.5,
    px: 2,
    py: 1.5,
    borderRadius: borderRadius.xs,
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    '&:hover': {
      backgroundColor: 'rgba(30, 58, 95, 0.08)',
    },
  },
  menuItemLocked: {
    opacity: 0.5,
    cursor: 'not-allowed',
    '&:hover': {
      backgroundColor: 'transparent',
    },
  },
  iconBox: {
    width: 36,
    height: 36,
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
} as const;

const STATUS_COLORS = {
  completed: { bg: colors.accent.greenDark, icon: colors.text.white },
  current: { bg: colors.primary.main, icon: colors.text.white, border: `2px solid ${colors.accent.blue}` },
  locked: { bg: colors.border.main, icon: colors.text.light },
} as const;

/**
 * フローティングワークフローナビゲーションメニュー
 */
export function FloatingWorkflowMenu({ items, onItemClick }: FloatingWorkflowMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // メニュー外クリックで閉じる
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const handleToggle = () => setIsOpen((prev) => !prev);

  const handleItemClick = (itemId: string, status: WorkflowMenuItem['status']) => {
    if (status === 'locked') return;
    onItemClick(itemId);
    setIsOpen(false);
  };

  const getIconBoxStyle = (status: WorkflowMenuItem['status']) => {
    const isCompleted = status === 'completed';
    const isCurrent = status === 'current';
    return {
      ...MENU_STYLES.iconBox,
      backgroundColor: STATUS_COLORS[status].bg,
      border: isCurrent ? `3px solid ${colors.accent.blue}` : 'none',
      boxShadow: isCurrent
        ? '0 0 0 4px rgba(59, 130, 246, 0.2)'
        : isCompleted
        ? '0 2px 8px rgba(5, 150, 105, 0.3)'
        : 'none',
    };
  };

  const renderIcon = (item: WorkflowMenuItem) => {
    if (item.status === 'completed') {
      return <CheckCircleIcon sx={{ ...iconStyles.medium, color: colors.text.white }} />;
    }
    if (item.status === 'locked') {
      return <LockIcon sx={{ ...iconStyles.medium, color: STATUS_COLORS.locked.icon }} />;
    }
    return (
      <Box sx={{ color: colors.text.white, display: 'flex', '& svg': iconStyles.medium }}>
        {item.icon}
      </Box>
    );
  };

  return (
    <Box ref={containerRef} sx={MENU_STYLES.container}>
      <Fade in={isOpen}>
        <Box sx={MENU_STYLES.menuPanel}>
          {items.map((item) => (
            <Box
              key={item.id}
              onClick={() => handleItemClick(item.id, item.status)}
              sx={{
                ...MENU_STYLES.menuItem,
                ...(item.status === 'locked' ? MENU_STYLES.menuItemLocked : {}),
              }}
            >
              <Box sx={getIconBoxStyle(item.status)}>{renderIcon(item)}</Box>
              <Typography
                sx={{
                  fontSize: fontSizes.sm,
                  fontWeight: item.status === 'current' ? 600 : 500,
                  color: item.status === 'locked' ? colors.text.light : colors.primary.main,
                }}
              >
                {item.label}
              </Typography>
            </Box>
          ))}
        </Box>
      </Fade>
      <IconButton onClick={handleToggle} sx={MENU_STYLES.menuButton}>
        {isOpen ? <CloseIcon /> : <MenuIcon />}
      </IconButton>
    </Box>
  );
}
