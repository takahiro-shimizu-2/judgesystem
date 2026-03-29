/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import type { ReactNode } from 'react';
import { useMediaQuery, useTheme } from '@mui/material';

interface SidebarContextType {
  // 左サイドバー
  isOpen: boolean;
  isMobile: boolean;
  mobileOpen: boolean;
  toggle: () => void;
  toggleMobile: () => void;
  closeMobile: () => void;
  // 右パネル
  rightPanelOpen: boolean;
  toggleRightPanel: () => void;
  closeRightPanel: () => void;
}

const SidebarContext = createContext<SidebarContextType | undefined>(undefined);

export function SidebarProvider({ children }: { children: ReactNode }) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const [isOpen, setIsOpen] = useState(false);
  const [mobileStateOpen, setMobileStateOpen] = useState(false);
  const [rightPanelOpen, setRightPanelOpen] = useState(true);
  const mobileOpen = isMobile ? mobileStateOpen : false;

  useEffect(() => {
    if (!isMobile) {
      setMobileStateOpen(false);
    }
  }, [isMobile]);

  const toggle = useCallback(() => {
    setIsOpen((prev) => !prev);
  }, []);

  const toggleMobile = useCallback(() => {
    setMobileStateOpen((prev) => !prev);
  }, []);

  const closeMobile = useCallback(() => {
    setMobileStateOpen(false);
  }, []);

  const toggleRightPanel = useCallback(() => {
    setRightPanelOpen((prev) => !prev);
  }, []);

  const closeRightPanel = useCallback(() => {
    setRightPanelOpen(false);
  }, []);

  return (
    <SidebarContext.Provider value={{ isOpen, isMobile, mobileOpen, toggle, toggleMobile, closeMobile, rightPanelOpen, toggleRightPanel, closeRightPanel }}>
      {children}
    </SidebarContext.Provider>
  );
}

export function useSidebar() {
  const context = useContext(SidebarContext);
  if (!context) {
    throw new Error('useSidebar must be used within a SidebarProvider');
  }
  return context;
}
