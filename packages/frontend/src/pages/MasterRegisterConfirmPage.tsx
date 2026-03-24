import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Box, Paper, Typography, Button, Chip } from '@mui/material';
import { ArrowBackIcon, CheckIcon, BusinessIcon, OrdererIcon, PersonIcon } from '../constants/icons';
import {
  PartnerConfirmView,
  OrdererConfirmView,
  StaffConfirmView,
} from '../components/master/confirm';
import { formPageStyles, formSubmitButtonStyles, formResetButtonStyles } from '../constants/formStyles';
import { colors, fontSizes } from '../constants/styles';
import type { PartnerFormData } from '../hooks/usePartnerForm';
import type { OrdererFormData } from '../hooks/useOrdererForm';
import type { StaffFormData } from '../hooks/useStaffForm';
import { useStaffDirectory } from '../contexts/StaffContext';

type FormType = 'partner' | 'orderer' | 'staff';

interface ConfirmPageState {
  formData: PartnerFormData | OrdererFormData | StaffFormData;
  formType: FormType;
}

const formTypeConfig: Record<FormType, { label: string; icon: React.ReactElement; tabIndex: number }> = {
  partner: { label: '企業登録', icon: <BusinessIcon sx={{ fontSize: 16 }} />, tabIndex: 0 },
  orderer: { label: '発注者登録', icon: <OrdererIcon sx={{ fontSize: 16 }} />, tabIndex: 1 },
  staff: { label: '担当者登録', icon: <PersonIcon sx={{ fontSize: 16 }} />, tabIndex: 2 },
};

export default function MasterRegisterConfirmPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const state = location.state as ConfirmPageState | null;
  const { createStaff: createStaffEntry } = useStaffDirectory();

  // stateがない場合は登録ページにリダイレクト
  useEffect(() => {
    if (!state?.formData || !state?.formType) {
      navigate('/master/register', { replace: true });
    }
  }, [state, navigate]);

  if (!state?.formData || !state?.formType) {
    return null;
  }

  const { formData, formType } = state;
  const config = formTypeConfig[formType];

  const handleBack = () => {
    navigate('/master/register', {
      state: {
        formData,
        formType,
        activeTab: config.tabIndex,
      },
    });
  };

  const handleSubmit = async () => {
    const redirectPath = {
      partner: '/partners',
      orderer: '/orderers',
      staff: '/staff',
    }[formType];

    try {
      if (formType === 'staff') {
        const created = await createStaffEntry(formData as StaffFormData);
        if (!created) {
          throw new Error('Failed to create staff');
        }
      } else {
        // TODO: partner/orderer registration API call
      }
      alert('登録が完了しました');
      navigate(redirectPath);
    } catch (error) {
      console.error('Failed to submit registration:', error);
      alert('登録に失敗しました。時間をおいて再度お試しください。');
    }
  };

  const renderConfirmView = () => {
    switch (formType) {
      case 'partner':
        return <PartnerConfirmView data={formData as PartnerFormData} />;
      case 'orderer':
        return <OrdererConfirmView data={formData as OrdererFormData} />;
      case 'staff':
        return <StaffConfirmView data={formData as StaffFormData} />;
      default:
        return null;
    }
  };

  return (
    <Box sx={formPageStyles.container}>
      <Box sx={formPageStyles.contentArea}>
        <Paper sx={formPageStyles.paper}>
          <Box sx={formPageStyles.header}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <Typography sx={formPageStyles.title}>登録内容の確認</Typography>
              <Chip
                icon={config.icon}
                label={config.label}
                size="small"
                sx={{
                  backgroundColor: colors.background.default,
                  border: `1px solid ${colors.border.main}`,
                  fontWeight: 500,
                  fontSize: fontSizes.xs,
                  '& .MuiChip-icon': {
                    color: colors.text.secondary,
                  },
                }}
              />
            </Box>
          </Box>

          <Box sx={formPageStyles.formContent}>
            {renderConfirmView()}

            {/* ボタンエリア */}
            <Box sx={formPageStyles.submitArea}>
              <Button
                onClick={handleBack}
                startIcon={<ArrowBackIcon />}
                sx={formResetButtonStyles}
              >
                戻る
              </Button>
              <Button
                onClick={handleSubmit}
                startIcon={<CheckIcon />}
                sx={formSubmitButtonStyles}
              >
                登録する
              </Button>
            </Box>
          </Box>
        </Paper>
      </Box>
    </Box>
  );
}
