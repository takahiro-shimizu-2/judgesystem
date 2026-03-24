import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  TextField,
  Button,
  Rating,
  Typography,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  IconButton,
  Autocomplete,
} from '@mui/material';
import {
  BusinessIcon,
  InfoIcon,
  CategoryIcon,
  AssessmentIcon,
  LocationIcon,
  VerifiedUserIcon,
  AddIcon,
  DeleteIcon,
  ArrowForwardIcon,
} from '../../constants/icons';
import { FormSection } from './FormSection';
import { DynamicArrayInput } from './DynamicArrayInput';
import { CategoryMultiSelect } from './CategoryMultiSelect';
import { usePartnerForm, type PartnerFormData } from '../../hooks/usePartnerForm';
import {
  formFieldStyles,
  formGridStyles,
  formPageStyles,
  formSubmitButtonStyles,
  formResetButtonStyles,
  formSelectStyles,
  dynamicArrayItemStyles,
  addButtonStyles,
} from '../../constants/formStyles';
import { colors, fontSizes, borderRadius } from '../../constants/styles';
import { categories } from '../../constants/categories';
import {
  unifiedMainCategories,
  unifiedSubCategories,
  unifiedRegions,
  ordererCategories,
  ordererRegions,
  ordererOrganizations,
  grades,
  type UnifiedMainCategory,
} from '../../constants/qualifications';

interface PartnerRegisterFormProps {
  onSubmit?: (data: PartnerFormData) => void;
  initialData?: PartnerFormData;
  editMode?: boolean;
  entityId?: string;
}

export function PartnerRegisterForm({ onSubmit, initialData, editMode, entityId }: PartnerRegisterFormProps) {
  const navigate = useNavigate();
  const {
    formData,
    errors,
    touched,
    updateField,
    setFieldTouched,
    validateAll,
    resetForm,
    addBranch,
    updateBranch,
    removeBranch,
    addUnifiedQualification,
    updateUnifiedQualification,
    removeUnifiedQualification,
    addOrdererQualification,
    updateOrdererQualificationName,
    removeOrdererQualification,
    addOrdererQualificationItem,
    updateOrdererQualificationItem,
    removeOrdererQualificationItem,
    addOrdererQualificationItemsForAllRegions,
  } = usePartnerForm();

  // 全地域一括追加用の状態（発注者ごとに管理）
  const [bulkAddState, setBulkAddState] = useState<Record<number, { category: string; value: string; grade: string }>>({});

  // 確認画面から戻った場合、データを復元
  useEffect(() => {
    if (initialData) {
      Object.entries(initialData).forEach(([key, value]) => {
        updateField(key as keyof PartnerFormData, value as PartnerFormData[keyof PartnerFormData]);
      });
    }
  }, [initialData, updateField]);

  const handleConfirm = () => {
    if (validateAll()) {
      onSubmit?.(formData);
      navigate('/master/register/confirm', {
        state: { formData, formType: 'partner', editMode, entityId },
      });
    }
  };

  const showError = (field: keyof PartnerFormData) => touched[field] && errors[field];

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {/* 上段: 基本情報 と 会社概要 を横並び */}
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
              label="会社名"
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
              label="郵便番号"
              required
              size="small"
              value={formData.postalCode}
              onChange={(e) => updateField('postalCode', e.target.value)}
              onBlur={() => setFieldTouched('postalCode')}
              error={!!showError('postalCode')}
              helperText={showError('postalCode') || ''}
              sx={formFieldStyles}
              fullWidth
            />
          </Box>
          <TextField
            label="住所"
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
          <Box sx={{ ...formGridStyles.twoColumn, mt: 2 }}>
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
              label="メールアドレス"
              required
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
          </Box>
          <Box sx={{ ...formGridStyles.twoColumn, mt: 2 }}>
            <TextField
              label="FAX"
              size="small"
              value={formData.fax}
              onChange={(e) => updateField('fax', e.target.value)}
              sx={formFieldStyles}
              fullWidth
            />
            <TextField
              label="ホームページURL"
              size="small"
              value={formData.url}
              onChange={(e) => updateField('url', e.target.value)}
              onBlur={() => setFieldTouched('url')}
              error={!!showError('url')}
              helperText={showError('url') || ''}
              sx={formFieldStyles}
              fullWidth
            />
          </Box>
        </FormSection>

        {/* 右カラム: 会社概要 + 実績・評価 */}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <FormSection title="会社概要" icon={<InfoIcon sx={{ fontSize: 18 }} />}>
            <Box sx={formGridStyles.twoColumn}>
              <TextField
                label="代表者"
                size="small"
                value={formData.representative}
                onChange={(e) => updateField('representative', e.target.value)}
                sx={formFieldStyles}
                fullWidth
              />
              <TextField
                label="設立年"
                size="small"
                value={formData.established}
                onChange={(e) => updateField('established', e.target.value)}
                onBlur={() => setFieldTouched('established')}
                error={!!showError('established')}
                helperText={showError('established') || ''}
                sx={formFieldStyles}
                fullWidth
              />
            </Box>
            <Box sx={{ ...formGridStyles.twoColumn, mt: 2 }}>
              <TextField
                label="資本金（円）"
                type="number"
                size="small"
                value={formData.capital}
                onChange={(e) => updateField('capital', e.target.value)}
                sx={formFieldStyles}
                fullWidth
              />
              <TextField
                label="従業員数"
                type="number"
                size="small"
                value={formData.employeeCount}
                onChange={(e) => updateField('employeeCount', e.target.value)}
                sx={formFieldStyles}
                fullWidth
              />
            </Box>
          </FormSection>

          <FormSection title="実績・評価" icon={<AssessmentIcon sx={{ fontSize: 18 }} />}>
            <Box sx={formGridStyles.threeColumn}>
              <TextField
                label="現地調査回数"
                type="number"
                size="small"
                value={formData.surveyCount}
                onChange={(e) => updateField('surveyCount', e.target.value)}
                sx={formFieldStyles}
                fullWidth
              />
              <TextField
                label="実績数"
                type="number"
                size="small"
                value={formData.resultCount}
                onChange={(e) => updateField('resultCount', e.target.value)}
                sx={formFieldStyles}
                fullWidth
              />
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Typography sx={{ fontSize: fontSizes.sm, color: colors.text.muted }}>評価</Typography>
                <Rating
                  value={formData.rating}
                  onChange={(_, value) => updateField('rating', value ?? 0)}
                  precision={0.5}
                  max={3}
                  size="small"
                />
              </Box>
            </Box>
          </FormSection>
        </Box>
      </Box>

      {/* 中段: 業種 と 拠点 を横並び */}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', lg: '1fr 1fr' },
          gap: 2,
          alignItems: 'start',
        }}
      >
        <FormSection title="業種" icon={<CategoryIcon sx={{ fontSize: 18 }} />} defaultExpanded={false}>
          <CategoryMultiSelect
            selected={formData.categories}
            onChange={(selected) => updateField('categories', selected)}
            options={categories}
            placeholder="業種を検索..."
          />
        </FormSection>

        <FormSection title="拠点一覧" icon={<LocationIcon sx={{ fontSize: 18 }} />} defaultExpanded={false}>
          <DynamicArrayInput
            items={formData.branches}
            onAdd={addBranch}
            onRemove={removeBranch}
            addLabel="拠点を追加"
            emptyMessage="拠点が登録されていません"
            renderItem={(branch, index) => (
              <>
                <TextField
                  label="拠点名"
                  size="small"
                  value={branch.name}
                  onChange={(e) => updateBranch(index, 'name', e.target.value)}
                  sx={formFieldStyles}
                  fullWidth
                />
                <TextField
                  label="住所"
                  size="small"
                  value={branch.address}
                  onChange={(e) => updateBranch(index, 'address', e.target.value)}
                  sx={formFieldStyles}
                  fullWidth
                />
              </>
            )}
          />
        </FormSection>
      </Box>

      {/* 下段: 競争参加資格（全幅） */}
      <FormSection title="競争参加資格" icon={<VerifiedUserIcon sx={{ fontSize: 18 }} />} defaultExpanded={false}>
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', lg: '1fr 1fr' },
            gap: 2,
            alignItems: 'start',
          }}
        >
          {/* 左: 全省庁統一資格 */}
          <Box
            sx={{
              pr: { lg: 2 },
              borderRight: { lg: `1px solid ${colors.border.main}` },
            }}
          >
            <Typography sx={{ fontSize: fontSizes.xs, fontWeight: 600, color: colors.text.secondary, mb: 1 }}>
              全省庁統一資格
            </Typography>
            {formData.unifiedQualifications.length === 0 && (
              <Typography sx={{ color: colors.text.light, fontSize: '0.875rem', textAlign: 'center', py: 3 }}>
                登録されていません
              </Typography>
            )}
            {formData.unifiedQualifications.map((qual, index) => (
              <Box
                key={index}
                sx={{
                  border: `1px solid ${colors.border.main}`,
                  borderRadius: borderRadius.xs,
                  p: 1.5,
                  mb: 1.5,
                  backgroundColor: colors.background.default,
                }}
              >
                <Box sx={{ display: 'flex', gap: 1, mb: 1.5 }}>
                  <FormControl size="small" sx={{ flex: 1 }}>
                    <InputLabel>大カテゴリー</InputLabel>
                    <Select
                      value={qual.mainCategory}
                      label="大カテゴリー"
                      onChange={(e) => {
                        updateUnifiedQualification(index, 'mainCategory', e.target.value);
                        updateUnifiedQualification(index, 'category', '');
                      }}
                      sx={formSelectStyles}
                    >
                      {unifiedMainCategories.map((cat) => (
                        <MenuItem key={cat} value={cat}>
                          {cat}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                  <IconButton
                    onClick={() => removeUnifiedQualification(index)}
                    sx={dynamicArrayItemStyles.deleteButton}
                    size="small"
                  >
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </Box>
                <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5, mb: 1.5 }}>
                  <Autocomplete
                    freeSolo
                    size="small"
                    options={qual.mainCategory && unifiedSubCategories[qual.mainCategory as UnifiedMainCategory] ? [...unifiedSubCategories[qual.mainCategory as UnifiedMainCategory]] : []}
                    value={qual.category}
                    onChange={(_, newValue) => updateUnifiedQualification(index, 'category', newValue || '')}
                    onInputChange={(_, newValue) => updateUnifiedQualification(index, 'category', newValue)}
                    renderInput={(params) => <TextField {...params} label="種別" sx={formFieldStyles} />}
                    disabled={!qual.mainCategory}
                  />
                  <FormControl size="small">
                    <InputLabel>競争参加地域</InputLabel>
                    <Select
                      value={qual.region}
                      label="競争参加地域"
                      onChange={(e) => updateUnifiedQualification(index, 'region', e.target.value)}
                      sx={formSelectStyles}
                    >
                      {unifiedRegions.map((region) => (
                        <MenuItem key={region} value={region}>
                          {region}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Box>
                <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5 }}>
                  <TextField
                    label="数値"
                    size="small"
                    type="number"
                    value={qual.value}
                    onChange={(e) => updateUnifiedQualification(index, 'value', e.target.value)}
                    sx={formFieldStyles}
                  />
                  <FormControl size="small">
                    <InputLabel>等級</InputLabel>
                    <Select
                      value={qual.grade}
                      label="等級"
                      onChange={(e) => updateUnifiedQualification(index, 'grade', e.target.value)}
                      sx={formSelectStyles}
                    >
                      {grades.map((grade) => (
                        <MenuItem key={grade} value={grade}>
                          {grade}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Box>
              </Box>
            ))}
            <Button fullWidth startIcon={<AddIcon />} onClick={addUnifiedQualification} sx={addButtonStyles}>
              統一資格を追加
            </Button>
          </Box>

          {/* 右: 発注者別資格 */}
          <Box>
            <Typography sx={{ fontSize: fontSizes.xs, fontWeight: 600, color: colors.text.secondary, mb: 1 }}>
              発注者別資格
            </Typography>
            {formData.ordererQualifications.length === 0 && (
              <Typography sx={{ color: colors.text.light, fontSize: '0.875rem', textAlign: 'center', py: 3 }}>
                登録されていません
              </Typography>
            )}
            {formData.ordererQualifications.map((ordererQual, ordererIndex) => (
              <Box
                key={ordererIndex}
                sx={{
                  border: `1px solid ${colors.border.main}`,
                  borderRadius: borderRadius.xs,
                  p: 1.5,
                  mb: 1.5,
                  backgroundColor: colors.background.default,
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
                  <Autocomplete
                    freeSolo
                    size="small"
                    options={ordererOrganizations}
                    value={ordererQual.ordererName}
                    onChange={(_, newValue) => updateOrdererQualificationName(ordererIndex, newValue || '')}
                    onInputChange={(_, newValue) => updateOrdererQualificationName(ordererIndex, newValue)}
                    renderInput={(params) => <TextField {...params} label="発注者機関" sx={formFieldStyles} />}
                    sx={{ flex: 1 }}
                  />
                  <IconButton
                    onClick={() => removeOrdererQualification(ordererIndex)}
                    sx={dynamicArrayItemStyles.deleteButton}
                    size="small"
                  >
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </Box>

                {ordererQual.items.map((item, itemIndex) => (
                  <Box
                    key={itemIndex}
                    sx={{
                      border: `1px solid ${colors.border.light}`,
                      borderRadius: borderRadius.xs,
                      p: 1,
                      mb: 1,
                      backgroundColor: colors.background.paper,
                    }}
                  >
                    <Box sx={{ display: 'flex', gap: 1, mb: 1 }}>
                      <Autocomplete
                        freeSolo
                        size="small"
                        options={[...ordererCategories]}
                        value={item.category}
                        onChange={(_, newValue) =>
                          updateOrdererQualificationItem(ordererIndex, itemIndex, 'category', newValue || '')
                        }
                        onInputChange={(_, newValue) =>
                          updateOrdererQualificationItem(ordererIndex, itemIndex, 'category', newValue)
                        }
                        renderInput={(params) => <TextField {...params} label="種別" sx={formFieldStyles} />}
                        sx={{ flex: 1 }}
                      />
                      <Autocomplete
                        freeSolo
                        size="small"
                        options={ordererRegions[ordererQual.ordererName] ? [...ordererRegions[ordererQual.ordererName]] : []}
                        value={item.region}
                        onChange={(_, newValue) =>
                          updateOrdererQualificationItem(ordererIndex, itemIndex, 'region', newValue || '')
                        }
                        onInputChange={(_, newValue) =>
                          updateOrdererQualificationItem(ordererIndex, itemIndex, 'region', newValue)
                        }
                        renderInput={(params) => <TextField {...params} label="競争参加地域" sx={formFieldStyles} />}
                        sx={{ flex: 1 }}
                      />
                      <IconButton
                        onClick={() => removeOrdererQualificationItem(ordererIndex, itemIndex)}
                        sx={dynamicArrayItemStyles.deleteButton}
                        size="small"
                      >
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Box>
                    <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
                      <TextField
                        label="数値"
                        size="small"
                        type="number"
                        value={item.value}
                        onChange={(e) =>
                          updateOrdererQualificationItem(ordererIndex, itemIndex, 'value', e.target.value)
                        }
                        sx={formFieldStyles}
                      />
                      <FormControl size="small">
                        <InputLabel>等級</InputLabel>
                        <Select
                          value={item.grade}
                          label="等級"
                          onChange={(e) =>
                            updateOrdererQualificationItem(ordererIndex, itemIndex, 'grade', e.target.value)
                          }
                          sx={formSelectStyles}
                        >
                          {grades.map((grade) => (
                            <MenuItem key={grade} value={grade}>
                              {grade}
                            </MenuItem>
                          ))}
                        </Select>
                      </FormControl>
                    </Box>
                  </Box>
                ))}

                {/* 全地域一括追加 */}
                {ordererRegions[ordererQual.ordererName] && ordererRegions[ordererQual.ordererName].length > 0 && (
                  <Box
                    sx={{
                      border: `1px dashed ${colors.accent.blue}`,
                      borderRadius: borderRadius.xs,
                      p: 1,
                      mb: 1,
                      backgroundColor: colors.status.info.bg,
                    }}
                  >
                    <Typography sx={{ fontSize: fontSizes.xs, fontWeight: 600, color: colors.accent.blue, mb: 1 }}>
                      全地域一括追加（{ordererRegions[ordererQual.ordererName].length}地域）
                    </Typography>
                    <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                      <Autocomplete
                        freeSolo
                        size="small"
                        options={[...ordererCategories]}
                        value={bulkAddState[ordererIndex]?.category || ''}
                        onChange={(_, newValue) =>
                          setBulkAddState((prev) => ({
                            ...prev,
                            [ordererIndex]: { ...prev[ordererIndex], category: newValue || '' },
                          }))
                        }
                        onInputChange={(_, newValue) =>
                          setBulkAddState((prev) => ({
                            ...prev,
                            [ordererIndex]: { ...prev[ordererIndex], category: newValue },
                          }))
                        }
                        renderInput={(params) => <TextField {...params} label="種別" sx={formFieldStyles} />}
                        sx={{ minWidth: 150, flex: 1 }}
                      />
                      <TextField
                        label="数値"
                        size="small"
                        type="number"
                        value={bulkAddState[ordererIndex]?.value || ''}
                        onChange={(e) =>
                          setBulkAddState((prev) => ({
                            ...prev,
                            [ordererIndex]: { ...prev[ordererIndex], value: e.target.value },
                          }))
                        }
                        sx={{ ...formFieldStyles, width: 100 }}
                      />
                      <FormControl size="small" sx={{ minWidth: 80 }}>
                        <InputLabel>等級</InputLabel>
                        <Select
                          value={bulkAddState[ordererIndex]?.grade || ''}
                          label="等級"
                          onChange={(e) =>
                            setBulkAddState((prev) => ({
                              ...prev,
                              [ordererIndex]: { ...prev[ordererIndex], grade: e.target.value },
                            }))
                          }
                          sx={formSelectStyles}
                        >
                          {grades.map((grade) => (
                            <MenuItem key={grade} value={grade}>
                              {grade}
                            </MenuItem>
                          ))}
                        </Select>
                      </FormControl>
                      <Button
                        variant="contained"
                        size="small"
                        onClick={() => {
                          const state = bulkAddState[ordererIndex];
                          if (state?.category) {
                            addOrdererQualificationItemsForAllRegions(
                              ordererIndex,
                              [...ordererRegions[ordererQual.ordererName]],
                              state.category,
                              state.value || '',
                              state.grade || ''
                            );
                            // 入力をリセット
                            setBulkAddState((prev) => ({
                              ...prev,
                              [ordererIndex]: { category: '', value: '', grade: '' },
                            }));
                          }
                        }}
                        disabled={!bulkAddState[ordererIndex]?.category}
                        sx={{
                          backgroundColor: colors.accent.blue,
                          '&:hover': { backgroundColor: colors.primary.main },
                          fontSize: fontSizes.xs,
                          whiteSpace: 'nowrap',
                        }}
                      >
                        一括追加
                      </Button>
                    </Box>
                  </Box>
                )}

                <Button
                  startIcon={<AddIcon />}
                  onClick={() => addOrdererQualificationItem(ordererIndex)}
                  sx={{ ...addButtonStyles, mt: 0.5 }}
                  size="small"
                >
                  資格を追加
                </Button>
              </Box>
            ))}
            <Button fullWidth startIcon={<AddIcon />} onClick={addOrdererQualification} sx={addButtonStyles}>
              発注者を追加
            </Button>
          </Box>
        </Box>
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
