import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Box, Paper, Typography, Button, Chip, Snackbar, Alert } from '@mui/material';
import { ArrowBackIcon, CheckIcon, BusinessIcon, OrdererIcon, PersonIcon } from '../constants/icons';
import {
  CompanyConfirmView,
  OrdererConfirmView,
  StaffConfirmView,
} from '../components/master/confirm';
import { formPageStyles, formSubmitButtonStyles, formResetButtonStyles } from '../constants/formStyles';
import { colors, fontSizes } from '../constants/styles';
import type { CompanyFormData } from '../hooks/useCompanyForm';
import type { OrdererFormData } from '../hooks/useOrdererForm';
import type { StaffFormData } from '../hooks/useStaffForm';
import { useStaffDirectory } from '../contexts/StaffContext';
import { createOrdererRecord, updateOrdererRecord } from '../data/orderers';
import { createCompanyRecord, updateCompanyRecord } from '../data/companies-master';
import type { CompanyUpdateData } from '../data/companies-master';

type FormType = 'partner' | 'orderer' | 'staff';

interface ConfirmPageState {
  formData: CompanyFormData | OrdererFormData | StaffFormData;
  formType: FormType;
  editMode?: boolean;
  entityId?: string;
}

const VALID_FORM_TYPES: readonly FormType[] = ['partner', 'orderer', 'staff'] as const;

/** location.state が ConfirmPageState の構造を持つかランタイムで検証する */
function isConfirmPageState(value: unknown): value is ConfirmPageState {
  if (typeof value !== 'object' || value === null) return false;
  const obj = value as Record<string, unknown>;
  if (typeof obj.formData !== 'object' || obj.formData === null) return false;
  if (typeof obj.formType !== 'string') return false;
  if (!VALID_FORM_TYPES.includes(obj.formType as FormType)) return false;
  return true;
}

/** CompanyFormData を API 更新用の CompanyUpdateData に変換する */
function toCompanyUpdateData(formData: CompanyFormData): CompanyUpdateData {
  return {
    name: formData.name,
    postalCode: formData.postalCode,
    address: formData.address,
    phone: formData.phone,
    fax: formData.fax,
    email: formData.email,
    url: formData.url,
    representative: formData.representative,
    established: formData.established,
    capital: formData.capital,
    employeeCount: formData.employeeCount,
    categories: formData.categories,
    branches: formData.branches,
    surveyCount: formData.surveyCount,
    resultCount: formData.resultCount,
    rating: formData.rating,
  };
}

const formTypeConfig: Record<FormType, { label: string; icon: React.ReactElement; tabIndex: number }> = {
  partner: { label: '企業登録', icon: <BusinessIcon sx={{ fontSize: 16 }} />, tabIndex: 0 },
  orderer: { label: '発注者登録', icon: <OrdererIcon sx={{ fontSize: 16 }} />, tabIndex: 1 },
  staff: { label: '担当者登録', icon: <PersonIcon sx={{ fontSize: 16 }} />, tabIndex: 2 },
};

export default function MasterRegisterConfirmPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const state: ConfirmPageState | null = isConfirmPageState(location.state)
    ? location.state
    : null;
  const { createStaff: createStaffEntry, updateStaff: updateStaffEntry } = useStaffDirectory();

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [snackbar, setSnackbar] = useState<{
    open: boolean;
    message: string;
    severity: 'success' | 'error';
  }>({ open: false, message: '', severity: 'success' });

  // stateがない場合は登録ページにリダイレクト
  useEffect(() => {
    if (!state?.formData || !state?.formType) {
      navigate('/master/register', { replace: true });
    }
  }, [state, navigate]);

  if (!state?.formData || !state?.formType) {
    return null;
  }

  const { formData, formType, editMode, entityId } = state;
  const config = formTypeConfig[formType];

  const handleBack = () => {
    navigate('/master/register', {
      state: {
        formData,
        formType,
        activeTab: config.tabIndex,
        editMode,
        entityId,
      },
    });
  };

  const handleSubmit = async () => {
    if (isSubmitting) return;

    const redirectPath = {
      partner: '/companies',
      orderer: '/orderers',
      staff: '/staff',
    }[formType];

    setIsSubmitting(true);
    try {
      if (formType === 'staff') {
        if (editMode && entityId) {
          const updated = await updateStaffEntry(entityId, formData as StaffFormData);
          if (!updated) throw new Error('Failed to update staff');
        } else {
          const created = await createStaffEntry(formData as StaffFormData);
          if (!created) throw new Error('Failed to create staff');
        }
      } else if (formType === 'orderer') {
        const ordererData = formData as OrdererFormData;
        const { name, category, address, phone, fax, email } = ordererData;
        if (!category) throw new Error('カテゴリが未選択です');
        const apiData = { name, category, address, phone, fax, email };
        if (editMode && entityId) {
          const updated = await updateOrdererRecord(entityId, apiData);
          if (!updated) throw new Error('Failed to update orderer');
        } else {
          const created = await createOrdererRecord(apiData);
          if (!created) throw new Error('Failed to create orderer');
        }
      } else if (formType === 'partner') {
        const partnerData = formData as CompanyFormData;
        if (editMode && entityId) {
          const updated = await updateCompanyRecord(entityId, toCompanyUpdateData(partnerData));
          if (!updated) throw new Error('Failed to update partner');
        } else {
          const created = await createCompanyRecord({
            ...partnerData,
            categories: partnerData.categories.map((name) => ({ group: null, name })),
          });
          if (!created) throw new Error('Failed to create partner');
        }
      }

      setSnackbar({
        open: true,
        message: editMode ? '更新が完了しました' : '登録が完了しました',
        severity: 'success',
      });
      // 成功Snackbarを短時間表示してからナビゲート
      setTimeout(() => navigate(redirectPath), 1000);
    } catch (error) {
      console.error('Failed to submit registration:', error);
      setSnackbar({
        open: true,
        message: editMode
          ? '更新に失敗しました。時間をおいて再度お試しください。'
          : '登録に失敗しました。時間をおいて再度お試しください。',
        severity: 'error',
      });
      setIsSubmitting(false);
    }
  };

  const renderConfirmView = () => {
    switch (formType) {
      case 'partner':
        return <CompanyConfirmView data={formData as CompanyFormData} />;
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
              <Typography sx={formPageStyles.title}>
                {editMode ? '更新内容の確認' : '登録内容の確認'}
              </Typography>
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
                disabled={isSubmitting}
                startIcon={<CheckIcon />}
                sx={formSubmitButtonStyles}
              >
                {isSubmitting ? '処理中...' : editMode ? '更新する' : '登録する'}
              </Button>
            </Box>
          </Box>
        </Paper>
      </Box>

      <Snackbar
        open={snackbar.open}
        autoHideDuration={snackbar.severity === 'error' ? 6000 : 3000}
        onClose={() => setSnackbar((prev) => ({ ...prev, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          onClose={() => setSnackbar((prev) => ({ ...prev, open: false }))}
          severity={snackbar.severity}
          variant="filled"
          sx={{ width: '100%' }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
