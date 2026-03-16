import { Box, AppBar, Toolbar, IconButton, Typography } from '@mui/material';
import { Menu as MenuIcon } from '@mui/icons-material';
import { Sidebar } from './Sidebar';
import { SidebarProvider, useSidebar } from '../../contexts/SidebarContext';
import { colors } from '../../constants/styles';

interface MainLayoutProps {
  children: React.ReactNode;
}

function MainLayoutInner({ children }: MainLayoutProps) {
  const { isOpen, toggle, isMobile, mobileOpen, toggleMobile, closeMobile } = useSidebar();

  return (
    <Box sx={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      <Sidebar
        open={isOpen}
        onToggle={toggle}
        isMobile={isMobile}
        mobileOpen={mobileOpen}
        onMobileClose={closeMobile}
      />
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          height: '100%',
          backgroundColor: colors.background.hover,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* モバイルヘッダー */}
        <AppBar
          position="sticky"
          elevation={0}
          sx={{
            display: { xs: 'block', md: 'none' },
            backgroundColor: colors.primary.dark,
          }}
        >
          <Toolbar sx={{ minHeight: 56 }}>
            <IconButton
              color="inherit"
              edge="start"
              onClick={toggleMobile}
              sx={{ mr: 2 }}
            >
              <MenuIcon />
            </IconButton>
            <Typography variant="h6" noWrap component="div" sx={{ fontWeight: 600 }}>
              入札管理
            </Typography>
          </Toolbar>
        </AppBar>
        <Box data-scroll-container sx={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
          {children}
        </Box>
      </Box>
    </Box>
  );
}

export function MainLayout({ children }: MainLayoutProps) {
  return (
    <SidebarProvider>
      <MainLayoutInner>{children}</MainLayoutInner>
    </SidebarProvider>
  );
}
