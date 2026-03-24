/**
 * フォーム関連のスタイル定数
 */
import { colors, fontSizes, borderRadius, sectionStyles } from './styles';

// フォームフィールド共通スタイル
export const formFieldStyles = {
  ...sectionStyles.textField,
  '& .MuiOutlinedInput-root': {
    fontSize: fontSizes.sm,
    backgroundColor: colors.background.white,
    borderRadius: borderRadius.xs,
    '& fieldset': {
      borderColor: colors.border.main,
    },
    '&:hover fieldset': {
      borderColor: colors.border.dark,
    },
    '&.Mui-focused fieldset': {
      borderColor: colors.accent.blue,
      borderWidth: '2px',
    },
    '&.Mui-error fieldset': {
      borderColor: colors.status.error.main,
    },
  },
  '& .MuiFormHelperText-root': {
    fontSize: fontSizes.xs,
    marginLeft: 0,
    '&.Mui-error': {
      color: colors.status.error.main,
    },
  },
  '& .MuiInputLabel-root': {
    fontSize: fontSizes.sm,
    '&.Mui-focused': {
      color: colors.accent.blue,
    },
    '&.Mui-error': {
      color: colors.status.error.main,
    },
  },
} as const;

// Accordion（折りたたみセクション）スタイル
export const formAccordionStyles = {
  boxShadow: 'none',
  border: `1px solid ${colors.border.main}`,
  borderRadius: `${borderRadius.xs} !important`,
  '&:before': { display: 'none' },
  '&.Mui-expanded': { margin: 0 },
  '&:not(:last-child)': {
    marginBottom: '12px',
  },
} as const;

// AccordionSummary スタイル
export const formAccordionSummaryStyles = {
  backgroundColor: colors.background.default,
  borderRadius: borderRadius.xs,
  minHeight: 48,
  '&.Mui-expanded': {
    minHeight: 48,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
  },
  '& .MuiAccordionSummary-content': {
    margin: '12px 0',
    '&.Mui-expanded': {
      margin: '12px 0',
    },
  },
} as const;

// AccordionDetails スタイル
export const formAccordionDetailsStyles = {
  padding: '16px 20px',
  backgroundColor: colors.background.white,
} as const;

// セクションタイトルスタイル
export const formSectionTitleStyles = {
  fontSize: fontSizes.sm,
  fontWeight: 600,
  color: colors.text.secondary,
  display: 'flex',
  alignItems: 'center',
  gap: 1,
} as const;

// フォームグリッドスタイル
export const formGridStyles = {
  twoColumn: {
    display: 'grid',
    gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
    gap: 2,
  },
  threeColumn: {
    display: 'grid',
    gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', md: '1fr 1fr 1fr' },
    gap: 2,
  },
  fullWidth: {
    display: 'grid',
    gridTemplateColumns: '1fr',
    gap: 2,
  },
} as const;

// 送信ボタンスタイル
export const formSubmitButtonStyles = {
  backgroundColor: colors.accent.blue,
  color: colors.text.white,
  fontWeight: 600,
  fontSize: fontSizes.sm,
  textTransform: 'none' as const,
  borderRadius: borderRadius.xs,
  px: 4,
  py: 1.25,
  '&:hover': {
    backgroundColor: colors.accent.blueHover,
  },
  '&:disabled': {
    backgroundColor: colors.border.main,
    color: colors.text.light,
  },
} as const;

// リセットボタンスタイル
export const formResetButtonStyles = {
  color: colors.text.muted,
  fontWeight: 500,
  fontSize: fontSizes.sm,
  textTransform: 'none' as const,
  borderRadius: borderRadius.xs,
  px: 3,
  py: 1.25,
  '&:hover': {
    backgroundColor: colors.background.hover,
  },
} as const;

// 動的配列のアイテムスタイル
export const dynamicArrayItemStyles = {
  container: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 1.5,
    p: 2,
    backgroundColor: colors.background.default,
    borderRadius: borderRadius.xs,
    border: `1px solid ${colors.border.main}`,
    mb: 1.5,
  },
  fieldsContainer: {
    flex: 1,
    display: 'grid',
    gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
    gap: 2,
  },
  deleteButton: {
    color: colors.text.light,
    p: 0.5,
    '&:hover': {
      color: colors.status.error.main,
      backgroundColor: colors.status.error.bg,
    },
  },
} as const;

// 追加ボタンスタイル
export const addButtonStyles = {
  color: colors.accent.blue,
  fontWeight: 500,
  fontSize: fontSizes.sm,
  textTransform: 'none' as const,
  borderRadius: borderRadius.xs,
  border: `1px dashed ${colors.accent.blue}`,
  py: 1,
  '&:hover': {
    backgroundColor: colors.status.info.bg,
    border: `1px dashed ${colors.accent.blueHover}`,
  },
} as const;

// Select スタイル
export const formSelectStyles = {
  fontSize: fontSizes.sm,
  backgroundColor: colors.background.white,
  borderRadius: borderRadius.xs,
  '& .MuiOutlinedInput-notchedOutline': {
    borderColor: colors.border.main,
  },
  '&:hover .MuiOutlinedInput-notchedOutline': {
    borderColor: colors.border.dark,
  },
  '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
    borderColor: colors.accent.blue,
    borderWidth: '2px',
  },
} as const;

// チップ選択エリアスタイル
export const chipSelectAreaStyles = {
  container: {
    border: `1px solid ${colors.border.main}`,
    borderRadius: borderRadius.xs,
    p: 2,
    backgroundColor: colors.background.white,
    minHeight: 100,
  },
  chipContainer: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: 1,
  },
  selectedChip: {
    borderRadius: borderRadius.xs,
    backgroundColor: colors.accent.blue,
    color: colors.text.white,
    '& .MuiChip-deleteIcon': {
      color: 'rgba(255, 255, 255, 0.7)',
      '&:hover': {
        color: colors.text.white,
      },
    },
  },
  optionChip: {
    borderRadius: borderRadius.xs,
    backgroundColor: colors.background.default,
    color: colors.text.secondary,
    border: `1px solid ${colors.border.main}`,
    '&:hover': {
      backgroundColor: colors.background.hover,
      borderColor: colors.accent.blue,
    },
  },
} as const;

// フォームページスタイル（ビューポート固定パターン）
export const formPageStyles = {
  container: {
    height: '100vh',
    display: 'flex',
    flexDirection: 'column' as const,
    bgcolor: colors.page.background,
  },
  contentArea: {
    flex: 1,
    p: { xs: 1.5, sm: 2, md: 3 },
    minHeight: 0,
  },
  paper: {
    width: '100%',
    height: '100%',
    borderRadius: borderRadius.xs,
    display: 'flex',
    flexDirection: 'column' as const,
    overflow: 'hidden',
  },
  header: {
    px: { xs: 2, md: 3 },
    pt: { xs: 2.5, md: 3 },
    pb: { xs: 2, md: 2.5 },
    borderBottom: `2px solid ${colors.border.dark}`,
    boxShadow: '0 1px 2px rgba(0, 0, 0, 0.05)',
  },
  title: {
    fontWeight: 700,
    color: colors.text.secondary,
    fontSize: { xs: '1.25rem', md: '1.5rem' },
  },
  tabsContainer: {
    borderBottom: `1px solid ${colors.border.main}`,
    px: { xs: 2, md: 3 },
  },
  tab: {
    textTransform: 'none' as const,
    fontWeight: 600,
    fontSize: fontSizes.sm,
    minHeight: 48,
  },
  formContent: {
    flex: 1,
    overflow: 'auto',
    p: { xs: 2, md: 3 },
  },
  submitArea: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: 2,
    pt: 3,
    mt: 2,
    borderTop: `1px solid ${colors.border.main}`,
  },
} as const;

// バリデーションルール
export const validationRules = {
  required: (value: string) => (!value?.trim() ? '必須項目です' : undefined),
  email: (value: string) =>
    value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? 'メールアドレスの形式が正しくありません' : undefined,
  postalCode: (value: string) =>
    value && !/^\d{3}-\d{4}$/.test(value) ? '郵便番号の形式が正しくありません（例: 123-4567）' : undefined,
  phone: (value: string) =>
    value && !/^[\d-]+$/.test(value) ? '電話番号の形式が正しくありません' : undefined,
  url: (value: string) =>
    value && !/^https?:\/\/.+/.test(value) ? 'URLの形式が正しくありません' : undefined,
  year: (value: string) =>
    value && !/^\d{4}$/.test(value) ? '年の形式が正しくありません（例: 2020）' : undefined,
  positiveNumber: (value: number | string) =>
    value !== '' && Number(value) < 0 ? '0以上の数値を入力してください' : undefined,
} as const;
