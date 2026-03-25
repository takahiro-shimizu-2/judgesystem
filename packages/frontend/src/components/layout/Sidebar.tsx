import { useLocation, useNavigate } from 'react-router-dom';
import {
  Box,
  Drawer,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  IconButton,
  Tooltip,
  Typography,
} from '@mui/material';
import {
  Description as DescriptionIcon,
  Business as BusinessIcon,
  AccountBalance as AccountBalanceIcon,
  Person as PersonIcon,
  BarChart as BarChartIcon,
  Gavel as GavelIcon,
  ViewSidebar as ViewSidebarIcon,
  Close as CloseIcon,
  AddBox as AddBoxIcon,
} from '@mui/icons-material';
import { colors, fontSizes, iconStyles, borderRadius } from '../../constants/styles';

const DRAWER_WIDTH_OPEN = 160;
const DRAWER_WIDTH_CLOSED = 64;
const DRAWER_WIDTH_MOBILE = 240;

interface MenuItem {
  id: string;
  label: string;
  path: string;
  icon: React.ReactNode;
}

const menuItems: MenuItem[] = [
  {
    id: 'bid-evaluations',
    label: '判定結果',
    path: '/',
    icon: <GavelIcon />,
  },
  {
    id: 'announcements',
    label: '入札情報',
    path: '/announcements',
    icon: <DescriptionIcon />,
  },
  {
    id: 'partners',
    label: '会社情報',
    path: '/partners',
    icon: <BusinessIcon />,
  },
  {
    id: 'orderers',
    label: '発注者',
    path: '/orderers',
    icon: <AccountBalanceIcon />,
  },
  {
    id: 'staff',
    label: '担当者',
    path: '/staff',
    icon: <PersonIcon />,
  },
  {
    id: 'master-register',
    label: '登録',
    path: '/master/register',
    icon: <AddBoxIcon />,
  },
  {
    id: 'analytics',
    label: '分析',
    path: '/analytics',
    icon: <BarChartIcon />,
  },
];

interface SidebarProps {
  open: boolean;
  onToggle: () => void;
  isMobile: boolean;
  mobileOpen: boolean;
  onMobileClose: () => void;
}

export function Sidebar({ open, onToggle, isMobile, mobileOpen, onMobileClose }: SidebarProps) {
  const location = useLocation();
  const navigate = useNavigate();

  const drawerWidth = isMobile ? DRAWER_WIDTH_MOBILE : open ? DRAWER_WIDTH_OPEN : DRAWER_WIDTH_CLOSED;
  const isExpanded = isMobile ? true : open;

  const isActive = (path: string) => {
    if (path === '/') {
      return location.pathname === '/' || location.pathname.startsWith('/detail');
    }
    return location.pathname.startsWith(path);
  };

  const handleNavigate = (path: string) => {
    navigate(path);
    if (isMobile) {
      onMobileClose();
    }
  };

  const drawerContent = (
    <>
      {/* ヘッダー: タイトルと開閉ボタン */}
      <Box
        sx={{
          px: isExpanded ? 2 : 0,
          py: 2,
          display: 'flex',
          alignItems: 'center',
          justifyContent: isExpanded ? 'space-between' : 'center',
          minHeight: 56,
          borderBottom: `1px solid ${colors.accent.blue}33`,
        }}
      >
        {isExpanded && (
          <Typography
            sx={{
              color: colors.text.white,
              fontWeight: 600,
              fontSize: fontSizes.base,
              letterSpacing: '0.02em',
              whiteSpace: 'nowrap',
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
            入札管理
          </Typography>
        )}
        {isMobile ? (
          <IconButton
            onClick={onMobileClose}
            sx={{
              color: 'rgba(255, 255, 255, 0.5)',
              p: 0.5,
              '&:hover': {
                backgroundColor: 'rgba(255, 255, 255, 0.05)',
                color: colors.accent.blue,
              },
            }}
          >
            <CloseIcon sx={iconStyles.medium} />
          </IconButton>
        ) : (
          <Tooltip title={open ? 'サイドバーを閉じる' : 'サイドバーを開く'} placement="right" arrow>
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
              <ViewSidebarIcon sx={iconStyles.medium} />
            </IconButton>
          </Tooltip>
        )}
      </Box>

      <List sx={{ pt: 1, flex: 1 }}>
        {menuItems.map((item) => {
          const active = isActive(item.path);
          return (
            <ListItem key={item.id} disablePadding sx={{ px: isExpanded ? 1 : 0.75, py: 0.25 }}>
              <Tooltip title={isExpanded ? '' : item.label} placement="right" arrow>
                <ListItemButton
                  onClick={() => handleNavigate(item.path)}
                  sx={{
                    borderRadius: borderRadius.xs,
                    px: isExpanded ? 1.5 : 1.25,
                    py: 1,
                    justifyContent: isExpanded ? 'flex-start' : 'center',
                    '&:hover': {
                      backgroundColor: 'rgba(255, 255, 255, 0.05)',
                    },
                    ...(active && {
                      backgroundColor: `${colors.accent.blue}26`,
                      borderLeft: `2px solid ${colors.accent.blue}`,
                      '&:hover': {
                        backgroundColor: `${colors.accent.blue}33`,
                      },
                    }),
                  }}
                >
                  <ListItemIcon
                    sx={{
                      minWidth: isExpanded ? 36 : 'auto',
                      color: active ? colors.accent.blue : 'rgba(255, 255, 255, 0.4)',
                    }}
                  >
                    {item.icon}
                  </ListItemIcon>
                  {isExpanded && (
                    <ListItemText
                      primary={item.label}
                      sx={{
                        '& .MuiListItemText-primary': {
                          fontSize: fontSizes.sm,
                          fontWeight: active ? 600 : 400,
                          color: active ? colors.accent.blue : 'rgba(255, 255, 255, 0.6)',
                          whiteSpace: 'nowrap',
                          letterSpacing: '0.01em',
                        },
                      }}
                    />
                  )}
                </ListItemButton>
              </Tooltip>
            </ListItem>
          );
        })}
      </List>
    </>
  );

  // モバイル: temporaryドロワー
  if (isMobile) {
    return (
      <Drawer
        variant="temporary"
        open={mobileOpen}
        onClose={onMobileClose}
        ModalProps={{ keepMounted: true }}
        sx={{
          display: { xs: 'block', md: 'none' },
          '& .MuiDrawer-paper': {
            width: DRAWER_WIDTH_MOBILE,
            boxSizing: 'border-box',
            backgroundColor: colors.primary.dark,
            borderRight: 'none',
          },
        }}
      >
        {drawerContent}
      </Drawer>
    );
  }

  // デスクトップ: permanentドロワー
  return (
    <Drawer
      variant="permanent"
      sx={{
        display: { xs: 'none', md: 'block' },
        width: drawerWidth,
        flexShrink: 0,
        transition: 'width 0.2s ease',
        '& .MuiDrawer-paper': {
          width: drawerWidth,
          boxSizing: 'border-box',
          backgroundColor: colors.primary.dark,
          borderRight: `1px solid ${colors.accent.blue}4d`,
          boxShadow: '4px 0 16px rgba(0, 0, 0, 0.2)',
          transition: 'width 0.2s ease',
          overflowX: 'hidden',
        },
      }}
    >
      {drawerContent}
    </Drawer>
  );
}

export const SIDEBAR_WIDTH_OPEN = DRAWER_WIDTH_OPEN;
export const SIDEBAR_WIDTH_CLOSED = DRAWER_WIDTH_CLOSED;
