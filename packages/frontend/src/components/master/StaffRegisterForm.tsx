import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, TextField, Button } from '@mui/material';
import { PersonIcon, ContactPhoneIcon, ArrowForwardIcon } from '../../constants/icons';
import { FormSection } from './FormSection';
import { useStaffForm, type StaffFormData } from '../../hooks/useStaffForm';
import {
  formFieldStyles,
  formGridStyles,
  formPageStyles,
  formSubmitButtonStyles,
  formResetButtonStyles,
} from '../../constants/formStyles';

interface StaffRegisterFormProps {
  onSubmit?: (data: StaffFormData) => void;
  initialData?: StaffFormData;
  editMode?: boolean;
  entityId?: string;
}

export function StaffRegisterForm({ onSubmit, initialData, editMode, entityId }: StaffRegisterFormProps) {
  const navigate = useNavigate();
  const {
    formData,
    errors,
    touched,
    updateField,
    setFieldTouched,
    validateAll,
    resetForm,
  } = useStaffForm();

  // 確認画面から戻った場合 or 編集モードの場合、データを復元
  useEffect(() => {
    if (initialData) {
      Object.entries(initialData).forEach(([key, value]) => {
        updateField(key as keyof StaffFormData, value);
      });
    }
  }, [initialData, updateField]);

  const handleConfirm = () => {
    if (validateAll()) {
      onSubmit?.(formData);
      navigate('/master/register/confirm', {
        state: { formData, formType: 'staff', editMode, entityId },
      });
    }
  };

  const showError = (field: keyof StaffFormData) => touched[field] && errors[field];

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {/* 2カラムレイアウト */}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', lg: '1fr 1fr' },
          gap: 2,
          alignItems: 'start',
        }}
      >
        {/* 左カラム: 基本情報 */}
        <FormSection title="基本情報" icon={<PersonIcon sx={{ fontSize: 18 }} />}>
          <Box sx={formGridStyles.twoColumn}>
            <TextField
              label="氏名"
              required
              size="small"
              value={formData.name}
              onChange={(e) => updateField('name', e.target.value)}
              onBlur={() => setFieldTouched('name')}
              error={!!showError('name')}
              helperText={showError('name') || ''}
              sx={formFieldStyles}
              fullWidth
            />
            <TextField
              label="部署"
              required
              size="small"
              value={formData.department}
              onChange={(e) => updateField('department', e.target.value)}
              onBlur={() => setFieldTouched('department')}
              error={!!showError('department')}
              helperText={showError('department') || ''}
              sx={formFieldStyles}
              fullWidth
            />
          </Box>
        </FormSection>

        {/* 右カラム: 連絡先 */}
        <FormSection title="連絡先" icon={<ContactPhoneIcon sx={{ fontSize: 18 }} />}>
          <Box sx={formGridStyles.twoColumn}>
            <TextField
              label="メールアドレス"
              type="email"
              required
              size="small"
              value={formData.email}
              onChange={(e) => updateField('email', e.target.value)}
              onBlur={() => setFieldTouched('email')}
              error={!!showError('email')}
              helperText={showError('email') || ''}
              sx={formFieldStyles}
              fullWidth
            />
            <TextField
              label="電話番号"
              required
              size="small"
              value={formData.phone}
              onChange={(e) => updateField('phone', e.target.value)}
              onBlur={() => setFieldTouched('phone')}
              error={!!showError('phone')}
              helperText={showError('phone') || ''}
              sx={formFieldStyles}
              fullWidth
            />
          </Box>
        </FormSection>
      </Box>

      <Box sx={formPageStyles.submitArea}>
        <Button onClick={resetForm} sx={formResetButtonStyles}>
          リセット
        </Button>
        <Button onClick={handleConfirm} endIcon={<ArrowForwardIcon />} sx={formSubmitButtonStyles}>
          確認画面へ
        </Button>
      </Box>
    </Box>
  );
}
