import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { ThemeProvider, createTheme, CssBaseline } from '@mui/material';
import { MainLayout } from './components/layout';
import BidListPage from './pages/BidListPage';
import BidDetailPage from './pages/BidDetailPage';
import AnnouncementListPage from './pages/AnnouncementListPage';
import AnnouncementDetailPage from './pages/AnnouncementDetailPage';
import PartnerListPage from './pages/PartnerListPage';
import PartnerDetailPage from './pages/PartnerDetailPage';
import OrdererListPage from './pages/OrdererListPage';
import OrdererDetailPage from './pages/OrdererDetailPage';
import StaffListPage from './pages/StaffListPage';
import AnalyticsPage from './pages/AnalyticsPage';
import MasterRegisterPage from './pages/MasterRegisterPage';
import MasterRegisterConfirmPage from './pages/MasterRegisterConfirmPage';
import { StaffProvider } from './contexts/StaffContext';

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
          </MainLayout>
        </Router>
      </StaffProvider>
    </ThemeProvider>
  );
}

export default App;
