import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, TextField, Select, MenuItem, FormControl, InputLabel, Button, FormHelperText } from '@mui/material';
import { BusinessIcon, ContactPhoneIcon, AccountTreeIcon, ArrowForwardIcon } from '../../constants/icons';
import { FormSection } from './FormSection';
import { DynamicArrayInput } from './DynamicArrayInput';
import { useOrdererForm, type OrdererFormData } from '../../hooks/useOrdererForm';
import {
  formFieldStyles,
  formGridStyles,
  formSelectStyles,
  formPageStyles,
  formSubmitButtonStyles,
  formResetButtonStyles,
} from '../../constants/formStyles';
import { ordererCategoryConfig } from '../../constants/ordererCategory';
import type { OrdererCategory } from '../../types/orderer';

interface OrdererRegisterFormProps {
  onSubmit?: (data: OrdererFormData) => void;
  initialData?: OrdererFormData;
}

export function OrdererRegisterForm({ onSubmit, initialData }: OrdererRegisterFormProps) {
  const navigate = useNavigate();
  const {
    formData,
    errors,
    touched,
    updateField,
    setFieldTouched,
    validateAll,
    resetForm,
    addDepartment,
    updateDepartment,
    removeDepartment,
  } = useOrdererForm();

  // 確認画面から戻った場合、データを復元
  useEffect(() => {
    if (initialData) {
      Object.entries(initialData).forEach(([key, value]) => {
        updateField(key as keyof OrdererFormData, value as OrdererFormData[keyof OrdererFormData]);
      });
    }
  }, [initialData, updateField]);

  const handleConfirm = () => {
    if (validateAll()) {
      onSubmit?.(formData);
      navigate('/master/register/confirm', {
        state: { formData, formType: 'orderer' },
      });
    }
  };

  const showError = (field: keyof OrdererFormData) => touched[field] && errors[field];

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
        <FormSection title="基本情報" icon={<BusinessIcon sx={{ fontSize: 18 }} />}>
          <Box sx={formGridStyles.twoColumn}>
            <TextField
              label="機関名"
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
            <FormControl size="small" fullWidth error={!!showError('category')}>
              <InputLabel required>種別</InputLabel>
              <Select
                value={formData.category}
                label="種別"
                onChange={(e) => updateField('category', e.target.value as OrdererCategory)}
                onBlur={() => setFieldTouched('category')}
                sx={formSelectStyles}
              >
                {(Object.entries(ordererCategoryConfig) as [OrdererCategory, { label: string }][]).map(
                  ([value, config]) => (
                    <MenuItem key={value} value={value}>
                      {config.label}
                    </MenuItem>
                  )
                )}
              </Select>
              {showError('category') && <FormHelperText>{errors.category}</FormHelperText>}
            </FormControl>
          </Box>
          <TextField
            label="所在地"
            required
            size="small"
            value={formData.address}
            onChange={(e) => updateField('address', e.target.value)}
            onBlur={() => setFieldTouched('address')}
            error={!!showError('address')}
            helperText={showError('address') || ''}
            sx={{ ...formFieldStyles, mt: 2 }}
            fullWidth
          />
        </FormSection>

        {/* 右カラム: 連絡先 */}
        <FormSection title="連絡先" icon={<ContactPhoneIcon sx={{ fontSize: 18 }} />}>
          <Box sx={formGridStyles.twoColumn}>
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
            <TextField
              label="FAX"
              size="small"
              value={formData.fax}
              onChange={(e) => updateField('fax', e.target.value)}
              sx={formFieldStyles}
              fullWidth
            />
          </Box>
          <Box sx={{ ...formGridStyles.twoColumn, mt: 2 }}>
            <TextField
              label="メールアドレス"
              type="email"
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
              label="ウェブサイト"
              size="small"
              value={formData.website}
              onChange={(e) => updateField('website', e.target.value)}
              onBlur={() => setFieldTouched('website')}
              error={!!showError('website')}
              helperText={showError('website') || ''}
              sx={formFieldStyles}
              fullWidth
            />
          </Box>
        </FormSection>
      </Box>

      {/* 組織（部署一覧）- 折りたたみ */}
      <FormSection title="組織（部署一覧）" icon={<AccountTreeIcon sx={{ fontSize: 18 }} />} defaultExpanded={false}>
        <DynamicArrayInput
          items={formData.departments}
          onAdd={addDepartment}
          onRemove={removeDepartment}
          addLabel="部署を追加"
          emptyMessage="部署が登録されていません"
          renderItem={(dept, index) => (
            <TextField
              label={`部署 ${index + 1}`}
              size="small"
              value={dept}
              onChange={(e) => updateDepartment(index, e.target.value)}
              sx={{ ...formFieldStyles, gridColumn: '1 / -1' }}
              fullWidth
            />
          )}
        />
      </FormSection>

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
