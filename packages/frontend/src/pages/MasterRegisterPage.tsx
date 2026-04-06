import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Box, Paper, Typography, Tabs, Tab, Chip } from '@mui/material';
import { BusinessIcon, OrdererIcon, PersonIcon } from '../constants/icons';
import { CompanyRegisterForm, OrdererRegisterForm, StaffRegisterForm } from '../components/master';
import { formPageStyles } from '../constants/formStyles';
import { colors, fontSizes } from '../constants/styles';
import type { CompanyFormData } from '../hooks/useCompanyForm';
import type { OrdererFormData } from '../hooks/useOrdererForm';
import type { StaffFormData } from '../hooks/useStaffForm';

type FormType = 'partner' | 'orderer' | 'staff';

interface PageState {
  formData?: CompanyFormData | OrdererFormData | StaffFormData;
  formType?: FormType;
  activeTab?: number;
  editMode?: boolean;
  entityId?: string;
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

  const editMode = pageState?.editMode ?? false;
  const entityId = pageState?.entityId;

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

  const pageTitle = editMode ? 'マスター編集' : 'マスター登録';

  return (
    <Box sx={formPageStyles.container}>
      <Box sx={formPageStyles.contentArea}>
        <Paper sx={formPageStyles.paper}>
          <Box sx={formPageStyles.header}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <Typography sx={formPageStyles.title}>{pageTitle}</Typography>
              {editMode && (
                <Chip
                  label="編集モード"
                  size="small"
                  sx={{
                    backgroundColor: `${colors.accent.blue}15`,
                    color: colors.accent.blue,
                    fontWeight: 600,
                    fontSize: fontSizes.xs,
                  }}
                />
              )}
            </Box>
          </Box>

          <Box sx={formPageStyles.tabsContainer}>
            <Tabs
              value={activeTab}
              onChange={editMode ? undefined : handleTabChange}
              sx={{
                '& .MuiTab-root': formPageStyles.tab,
                '& .Mui-selected': { color: colors.accent.blue },
                '& .MuiTabs-indicator': { backgroundColor: colors.accent.blue },
              }}
            >
              <Tab icon={<BusinessIcon sx={{ fontSize: 20 }} />} iconPosition="start" label="企業登録" disabled={editMode && activeTab !== 0} />
              <Tab icon={<OrdererIcon sx={{ fontSize: 20 }} />} iconPosition="start" label="発注者登録" disabled={editMode && activeTab !== 1} />
              <Tab icon={<PersonIcon sx={{ fontSize: 20 }} />} iconPosition="start" label="担当者登録" disabled={editMode && activeTab !== 2} />
            </Tabs>
          </Box>

          <Box sx={formPageStyles.formContent}>
            <TabPanel value={activeTab} index={0}>
              <CompanyRegisterForm
                initialData={getInitialData('partner') as CompanyFormData | undefined}
                editMode={editMode}
                entityId={entityId}
              />
            </TabPanel>
            <TabPanel value={activeTab} index={1}>
              <OrdererRegisterForm
                initialData={getInitialData('orderer') as OrdererFormData | undefined}
                editMode={editMode}
                entityId={entityId}
              />
            </TabPanel>
            <TabPanel value={activeTab} index={2}>
              <StaffRegisterForm
                initialData={getInitialData('staff') as StaffFormData | undefined}
                editMode={editMode}
                entityId={entityId}
              />
            </TabPanel>
          </Box>
        </Paper>
      </Box>
    </Box>
  );
}
