import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { Box, Paper, Typography, Tabs, Tab } from '@mui/material';
import { BusinessIcon, OrdererIcon, PersonIcon } from '../constants/icons';
import { PartnerRegisterForm, OrdererRegisterForm, StaffRegisterForm } from '../components/master';
import { formPageStyles } from '../constants/formStyles';
import { colors } from '../constants/styles';
import type { PartnerFormData } from '../hooks/usePartnerForm';
import type { OrdererFormData } from '../hooks/useOrdererForm';
import type { StaffFormData } from '../hooks/useStaffForm';

type FormType = 'partner' | 'orderer' | 'staff';

interface PageState {
  formData?: PartnerFormData | OrdererFormData | StaffFormData;
  formType?: FormType;
  activeTab?: number;
}

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel({ children, value, index }: TabPanelProps) {
  return (
    <Box role="tabpanel" hidden={value !== index} sx={{ display: value === index ? 'block' : 'none' }}>
      {value === index && children}
    </Box>
  );
}

export default function MasterRegisterPage() {
  const location = useLocation();
  const pageState = location.state as PageState | null;

  const [activeTab, setActiveTab] = useState(pageState?.activeTab ?? 0);

  // 確認画面から戻った場合、タブを復元
  useEffect(() => {
    if (pageState?.activeTab !== undefined) {
      setActiveTab(pageState.activeTab);
    }
  }, [pageState?.activeTab]);

  const handleTabChange = (_: React.SyntheticEvent, newValue: number) => {
    setActiveTab(newValue);
  };

  // 確認画面から戻った場合のデータ
  const getInitialData = (type: FormType) => {
    if (pageState?.formType === type && pageState?.formData) {
      return pageState.formData;
    }
    return undefined;
  };

  return (
    <Box sx={formPageStyles.container}>
      <Box sx={formPageStyles.contentArea}>
        <Paper sx={formPageStyles.paper}>
          <Box sx={formPageStyles.header}>
            <Typography sx={formPageStyles.title}>マスター登録</Typography>
          </Box>

          <Box sx={formPageStyles.tabsContainer}>
            <Tabs
              value={activeTab}
              onChange={handleTabChange}
              sx={{
                '& .MuiTab-root': formPageStyles.tab,
                '& .Mui-selected': { color: colors.accent.blue },
                '& .MuiTabs-indicator': { backgroundColor: colors.accent.blue },
              }}
            >
              <Tab icon={<BusinessIcon sx={{ fontSize: 20 }} />} iconPosition="start" label="企業登録" />
              <Tab icon={<OrdererIcon sx={{ fontSize: 20 }} />} iconPosition="start" label="発注者登録" />
              <Tab icon={<PersonIcon sx={{ fontSize: 20 }} />} iconPosition="start" label="担当者登録" />
            </Tabs>
          </Box>

          <Box sx={formPageStyles.formContent}>
            <TabPanel value={activeTab} index={0}>
              <PartnerRegisterForm initialData={getInitialData('partner') as PartnerFormData | undefined} />
            </TabPanel>
            <TabPanel value={activeTab} index={1}>
              <OrdererRegisterForm initialData={getInitialData('orderer') as OrdererFormData | undefined} />
            </TabPanel>
            <TabPanel value={activeTab} index={2}>
              <StaffRegisterForm initialData={getInitialData('staff') as StaffFormData | undefined} />
            </TabPanel>
          </Box>
        </Paper>
      </Box>
    </Box>
  );
}
