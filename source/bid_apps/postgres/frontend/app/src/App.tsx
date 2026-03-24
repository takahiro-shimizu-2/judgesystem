import { lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { ThemeProvider, createTheme, CssBaseline, CircularProgress, Box } from '@mui/material';
import { MainLayout } from './components/layout';
import { StaffProvider } from './contexts/StaffContext';

// Route-based code splitting with React.lazy
const BidListPage = lazy(() => import('./pages/BidListPage'));
const BidDetailPage = lazy(() => import('./pages/BidDetailPage'));
const AnnouncementListPage = lazy(() => import('./pages/AnnouncementListPage'));
const AnnouncementDetailPage = lazy(() => import('./pages/AnnouncementDetailPage'));
const PartnerListPage = lazy(() => import('./pages/PartnerListPage'));
const PartnerDetailPage = lazy(() => import('./pages/PartnerDetailPage'));
const OrdererListPage = lazy(() => import('./pages/OrdererListPage'));
const OrdererDetailPage = lazy(() => import('./pages/OrdererDetailPage'));
const StaffListPage = lazy(() => import('./pages/StaffListPage'));
const AnalyticsPage = lazy(() => import('./pages/AnalyticsPage'));
const MasterRegisterPage = lazy(() => import('./pages/MasterRegisterPage'));
const MasterRegisterConfirmPage = lazy(() => import('./pages/MasterRegisterConfirmPage'));

const theme = createTheme({
  palette: {
    primary: {
      main: '#1976d2',
    },
    secondary: {
      main: '#9c27b0',
    },
    success: {
      main: '#2e7d32',
      light: '#4caf50',
    },
    warning: {
      main: '#ed6c02',
      light: '#ff9800',
    },
    error: {
      main: '#d32f2f',
      light: '#ef5350',
    },
  },
  typography: {
    fontFamily: [
      '-apple-system',
      'BlinkMacSystemFont',
      '"Segoe UI"',
      'Roboto',
      '"Helvetica Neue"',
      'Arial',
      'sans-serif',
      '"Apple Color Emoji"',
      '"Segoe UI Emoji"',
      '"Segoe UI Symbol"',
    ].join(','),
  },
});

function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <StaffProvider>
        <Router>
          <MainLayout>
            <Suspense fallback={<Box display="flex" justifyContent="center" alignItems="center" minHeight="200px"><CircularProgress /></Box>}>
              <Routes>
                <Route path="/" element={<BidListPage />} />
                <Route path="/detail/:id" element={<BidDetailPage />} />
                <Route path="/announcements" element={<AnnouncementListPage />} />
                <Route path="/announcements/:id" element={<AnnouncementDetailPage />} />
                <Route path="/partners" element={<PartnerListPage />} />
                <Route path="/partners/:id" element={<PartnerDetailPage />} />
                <Route path="/orderers" element={<OrdererListPage />} />
                <Route path="/orderers/:id" element={<OrdererDetailPage />} />
                <Route path="/staff" element={<StaffListPage />} />
                <Route path="/analytics" element={<AnalyticsPage />} />
                <Route path="/master/register" element={<MasterRegisterPage />} />
                <Route path="/master/register/confirm" element={<MasterRegisterConfirmPage />} />
              </Routes>
            </Suspense>
          </MainLayout>
        </Router>
      </StaffProvider>
    </ThemeProvider>
  );
}

export default App;
