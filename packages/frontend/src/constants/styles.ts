/**
 * アプリケーション共通のスタイル定数
 */

// カラーパレット
export const colors = {
  // プライマリ
  primary: {
    main: '#1e3a5f',
    light: '#e8f4fc',
    dark: '#0f172a',
    gradient: 'linear-gradient(135deg, #0f172a 0%, #1e3a5f 50%, #334155 100%)',
  },
  // ページ背景
  page: {
    background: '#e2e8f0',
  },
  // ステータス
  status: {
    success: {
      main: '#059669',
      light: '#10b981',
      bg: '#ecfdf5',
      border: '#a7f3d0',
    },
    warning: {
      main: '#d97706',
      light: '#f59e0b',
      bg: '#fffbeb',
      border: '#fde68a',
    },
    error: {
      main: '#dc2626',
      light: '#ef4444',
      bg: '#fef2f2',
      border: '#fecaca',
    },
    info: {
      main: '#3b82f6',
      light: '#60a5fa',
      bg: '#eff6ff',
      border: '#bfdbfe',
    },
  },
  // ワークフローステータス
  workflow: {
    pending: {
      main: '#94a3b8',
      bg: '#f1f5f9',
      border: '#e2e8f0',
    },
    active: {
      main: '#3b82f6',
      bg: '#eff6ff',
      border: '#bfdbfe',
    },
    completed: {
      main: '#10b981',
      bg: '#ecfdf5',
      border: '#a7f3d0',
    },
    locked: {
      main: '#cbd5e1',
      bg: '#f8fafc',
      border: '#e2e8f0',
    },
  },
  // アクセントカラー
  accent: {
    blue: '#3b82f6',
    blueBg: 'rgba(59, 130, 246, 0.1)',
    blueHover: '#2563eb',
    blueDark: '#1d4ed8',
    green: '#10b981',
    greenBg: 'rgba(16, 185, 129, 0.1)',
    greenDark: '#059669',
    greenHover: '#047857',
    greenSuccess: '#16a34a',
    greenSuccessHover: '#15803d',
    purple: '#8b5cf6',
    purpleBg: 'rgba(139, 92, 246, 0.1)',
    indigo: '#6366f1',
    indigoBg: 'rgba(99, 102, 241, 0.1)',
    pink: '#ec4899',
    pinkBg: 'rgba(236, 72, 153, 0.1)',
    orange: '#f59e0b',
    orangeBg: 'rgba(245, 158, 11, 0.1)',
    orangeMedium: '#f97316',
    orangeDark: '#ea580c',
    red: '#ef4444',
    redBg: 'rgba(239, 68, 68, 0.1)',
    redDark: '#dc2626',
    teal: '#14b8a6',
    tealBg: 'rgba(20, 184, 166, 0.1)',
    yellow: '#fbbf24',
    yellowDark: '#ca8a04',
    yellowBg: '#fef9c3',
    amberBg: '#fef3c7',
  },
  // テキスト
  text: {
    primary: '#0f172a',
    secondary: '#1e293b',
    muted: '#64748b',
    mutedDark: '#475569',
    light: '#94a3b8',
    white: '#ffffff',
  },
  // 背景
  background: {
    default: '#f1f5f9',
    paper: '#fafafa',
    white: '#ffffff',
    alt: '#e8ecf1',
    hover: '#f8fafc',
  },
  // ボーダー
  border: {
    light: '#f1f5f9',
    main: '#e2e8f0',
    dark: '#cbd5e1',
  },
} as const;

// フォントサイズ
export const fontSizes = {
  xs: '0.8rem',
  xs2: '0.85rem',
  sm: '0.875rem',
  md: '0.925rem',
  base: '1rem',
  lg: '1.1rem',
  xl: '1.2rem',
} as const;

// スペーシング（MUI の spacing unit 相当）
export const spacing = {
  xs: 0.5,
  sm: 1,
  md: 1.5,
  lg: 2,
  xl: 3,
} as const;

// ボーダー半径
export const borderRadius = {
  xs: '4px',
  sm: '6px',
  md: '8px',
  lg: '12px',
  xl: '16px',
  full: '9999px',
} as const;

// ページネーション設定
export const pagination = {
  defaultPageSize: 25,
  pageSizeOptions: [25, 50, 100],
  maxPageButtons: 5,
} as const;

// テーブル設定
export const TABLE_ROW_HEIGHT = 52;
export const VIRTUALIZER_OVERSCAN = 5;

// DataGrid 共通スタイル（レスポンシブ対応）
export const dataGridStyles = {
  border: 'none',
  flex: 1,
  minHeight: { xs: 400, md: 0 },
  '& .MuiDataGrid-toolbarContainer': {
    backgroundColor: colors.background.alt,
    padding: { xs: '8px 12px', md: '12px 16px' },
    borderBottom: `2px solid ${colors.border.main}`,
    minHeight: { xs: '44px', md: '52px' },
  },
  '& .MuiDataGrid-columnHeaders': {
    backgroundColor: colors.background.alt,
    borderBottom: `2px solid ${colors.border.main}`,
  },
  '& .MuiDataGrid-columnHeaderTitle': {
    fontWeight: 700,
    color: colors.text.secondary,
    fontSize: { xs: '0.75rem', md: '0.875rem' },
  },
  '& .MuiDataGrid-row': {
    cursor: 'pointer',
    '&:hover': { backgroundColor: colors.background.hover },
  },
  '& .MuiDataGrid-cell': {
    borderBottom: `1px solid ${colors.border.light}`,
    fontSize: { xs: '0.75rem', md: '0.875rem' },
    padding: { xs: '8px', md: '16px' },
    display: 'flex',
    alignItems: 'center',
  },
  '& .MuiDataGrid-footerContainer': {
    minHeight: { xs: '44px', md: '52px' },
  },
} as const;

// ヘッダーグラデーション
export const headerGradient = colors.primary.gradient;

// フィルターチップ共通スタイル（ヘッダー用）
export const filterChipStyles = {
  backgroundColor: 'rgba(255,255,255,0.15)',
  color: colors.text.white,
  '& .MuiChip-deleteIcon': { color: 'rgba(255,255,255,0.6)' },
} as const;

// 一覧ページフィルターチップ共通スタイル
export const listFilterChipStyles = {
  height: 28,
  fontSize: fontSizes.xs,
  fontWeight: 500,
  backgroundColor: '#f1f5f9',
  color: '#475569',
  border: '1px solid #e2e8f0',
  borderRadius: '4px',
  '& .MuiChip-label': { px: 1.25 },
  '& .MuiChip-deleteIcon': { color: '#94a3b8', fontSize: 16, '&:hover': { color: '#ef4444' } },
} as const;

// アイコン共通スタイル
export const iconStyles = {
  small: { fontSize: 16 },
  medium: { fontSize: 20 },
  large: { fontSize: 24 },
  muted: { fontSize: 20, color: colors.text.light },
} as const;

// チップ共通スタイル
export const chipStyles = {
  small: {
    height: 24,
    fontSize: fontSizes.xs,
    fontWeight: 500,
    borderRadius: borderRadius.xs,
  },
  medium: {
    height: 28,
    fontSize: fontSizes.sm,
    fontWeight: 600,
    borderRadius: borderRadius.xs,
  },
  large: {
    height: 32,
    fontSize: fontSizes.base,
    fontWeight: 600,
    borderRadius: borderRadius.xs,
  },
} as const;

// ボックスシャドウ
export const shadows = {
  sm: '0 1px 2px rgba(0,0,0,0.05)',
  md: '0 2px 8px rgba(0,0,0,0.1)',
  lg: '0 4px 12px rgba(0,0,0,0.15)',
  xl: '0 8px 24px rgba(0,0,0,0.2)',
  icon: (color: string) => `0 2px 8px ${color}`,
} as const;

// カード共通スタイル
export const cardStyles = {
  base: {
    backgroundColor: colors.background.paper,
    borderRadius: borderRadius.xs,
    border: `1px solid ${colors.border.main}`,
  },
  elevated: {
    backgroundColor: colors.background.paper,
    borderRadius: borderRadius.xs,
    boxShadow: shadows.md,
  },
} as const;

// ボタン共通スタイル
export const buttonStyles = {
  primary: {
    backgroundColor: colors.primary.main,
    color: colors.text.white,
    borderRadius: borderRadius.xs,
    '&:hover': { backgroundColor: colors.primary.dark },
  },
  outlined: {
    borderColor: colors.border.main,
    color: colors.text.secondary,
    borderRadius: borderRadius.xs,
    '&:hover': {
      borderColor: colors.accent.blue,
      backgroundColor: 'rgba(59, 130, 246, 0.04)',
    },
  },
  small: {
    fontSize: fontSizes.xs,
    textTransform: 'none' as const,
    borderRadius: borderRadius.xs,
  },
  action: {
    fontSize: fontSizes.xs,
    textTransform: 'none' as const,
    borderRadius: borderRadius.xs,
    borderColor: colors.border.main,
    color: colors.text.muted,
  },
} as const;

// セクション共通スタイル
export const sectionStyles = {
  // セクションタイトル
  title: {
    fontSize: fontSizes.sm,
    fontWeight: 600,
    color: colors.text.secondary,
    mb: 1.5,
    display: 'flex',
    alignItems: 'center',
    gap: 0.75,
  },
  // サブタイトル
  subtitle: {
    fontSize: fontSizes.xs,
    color: colors.text.muted,
  },
  // コンテナ
  container: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 3,
  },
  // ペーパー（基本）
  paper: {
    elevation: 0,
    p: 2,
    backgroundColor: colors.background.default,
    borderRadius: borderRadius.xs,
    border: `1px solid ${colors.border.main}`,
  },
  // ペーパー（強調）
  paperAccent: {
    elevation: 0,
    p: 2.5,
    backgroundColor: colors.background.default,
    borderRadius: borderRadius.xs,
    border: `1px solid ${colors.border.main}`,
  },
  // リストアイテム
  listItem: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    p: 1.5,
    backgroundColor: colors.background.default,
    borderRadius: borderRadius.xs,
    border: `1px solid ${colors.border.main}`,
  },
  // ヘッダー（タイトル + ボタン）
  headerRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    mb: 1.5,
  },
  // テキストフィールド
  textField: {
    '& .MuiOutlinedInput-root': {
      fontSize: fontSizes.sm,
      backgroundColor: colors.background.default,
      '& fieldset': {
        borderColor: 'transparent',
      },
      '&:hover fieldset': {
        borderColor: colors.border.main,
      },
      '&.Mui-focused fieldset': {
        borderColor: colors.accent.blue,
        borderWidth: '2px',
      },
    },
  },
} as const;

// 担当者選択スタイル
export const staffSelectStyles = {
  fontSize: fontSizes.xs,
  minWidth: 100,
  '& .MuiSelect-select': { py: 0.5, px: 1 },
  '& .MuiOutlinedInput-notchedOutline': {
    borderColor: 'transparent',
    borderRadius: borderRadius.xs,
  },
  '&:hover .MuiOutlinedInput-notchedOutline': {
    borderColor: colors.border.main,
  },
  '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
    borderColor: colors.accent.blue,
  },
  backgroundColor: colors.accent.blueBg,
} as const;

// ステータス情報マッピング
export const statusColors = {
  // 書類ステータス
  document: {
    pending: { label: '未着手', color: colors.text.muted, bgColor: 'rgba(148, 163, 184, 0.15)' },
    draft: { label: '作成中', color: colors.accent.blue, bgColor: 'rgba(59, 130, 246, 0.15)' },
    reviewing: { label: '確認中', color: colors.status.warning.main, bgColor: 'rgba(217, 119, 6, 0.15)' },
    approved: { label: '承認済', color: colors.status.success.main, bgColor: 'rgba(5, 150, 105, 0.15)' },
    submitted: { label: '提出済', color: colors.status.success.main, bgColor: 'rgba(5, 150, 105, 0.15)' },
    uploaded: { label: 'アップロード済', color: colors.accent.blue, bgColor: 'rgba(59, 130, 246, 0.15)' },
    received: { label: '受取済', color: colors.accent.blue, bgColor: 'rgba(59, 130, 246, 0.15)' },
    requested: { label: '依頼中', color: colors.status.warning.main, bgColor: 'rgba(217, 119, 6, 0.15)' },
    not_requested: { label: '未依頼', color: colors.text.muted, bgColor: 'rgba(148, 163, 184, 0.15)' },
  },
  // パートナーステータス
  partner: {
    pending: { label: '未連絡', color: colors.text.muted, bgColor: 'rgba(148, 163, 184, 0.15)' },
    contacted: { label: '連絡済', color: colors.accent.blue, bgColor: 'rgba(59, 130, 246, 0.15)' },
    confirmed: { label: '確定', color: colors.status.success.main, bgColor: 'rgba(5, 150, 105, 0.15)' },
    declined: { label: '辞退', color: colors.status.error.main, bgColor: 'rgba(220, 38, 38, 0.15)' },
  },
} as const;

// カテゴリカラー
export const categoryColors = {
  // 確認事項カテゴリ
  checkItem: {
    frequent: { label: '高頻度確認事項', color: colors.accent.blue, bgColor: colors.accent.blueBg },
    similar: { label: '類似案件確認事項', color: colors.accent.purple, bgColor: colors.accent.purpleBg },
    case: { label: '案件ごとの確認事項', color: colors.accent.orange, bgColor: colors.accent.orangeBg },
    high_freq: { label: '高頻度', color: colors.accent.blue, bgColor: colors.accent.blueBg },
    case_specific: { label: '案件固有', color: colors.accent.orange, bgColor: colors.accent.orangeBg },
  },
  // 書類タイプ
  documentType: {
    estimate: { label: '見積書', color: colors.accent.blue, bgColor: colors.accent.blueBg },
    bid: { label: '入札書', color: colors.accent.purple, bgColor: colors.accent.purpleBg },
    result: { label: '結果報告', color: colors.accent.orange, bgColor: colors.accent.orangeBg },
  },
  // 資料タイプ
  docFlow: {
    sent: { label: '送付', color: colors.accent.blue },
    received: { label: '受取', color: colors.status.success.main },
    submitted: { label: '提出', color: colors.status.warning.main },
  },
} as const;

// アバタースタイル
export const avatarStyles = {
  small: {
    width: 32,
    height: 32,
    fontSize: fontSizes.xs,
  },
  medium: {
    width: 36,
    height: 36,
    fontSize: fontSizes.sm,
  },
  large: {
    width: 48,
    height: 48,
    fontSize: fontSizes.base,
  },
  primary: {
    backgroundColor: 'rgba(30, 58, 95, 0.1)',
    color: colors.primary.main,
  },
  accent: {
    backgroundColor: colors.accent.blueBg,
    color: colors.accent.blue,
  },
} as const;

// プログレスバースタイル
export const progressStyles = {
  thin: {
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border.main,
  },
  medium: {
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.border.main,
  },
} as const;

// ページ共通スタイル（レスポンシブ対応）
export const pageStyles = {
  // ページコンテナ
  container: {
    height: { xs: 'auto', md: '100vh' },
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column' as const,
    bgcolor: colors.page.background,
  },
  // コンテンツエリア
  contentArea: {
    flex: 1,
    p: { xs: 1.5, sm: 2, md: 3 },
    minHeight: 0,
  },
  // メインカード（DataGrid等を含む）
  mainCard: {
    height: { xs: 'auto', md: '100%' },
    minHeight: { xs: 'calc(100vh - 120px)', md: 'auto' },
    borderRadius: borderRadius.xs,
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column' as const,
  },
  // カード内ヘッダー
  cardHeader: {
    px: { xs: 2, md: 3 },
    pt: { xs: 2, md: 2.5 },
    pb: { xs: 1.5, md: 2 },
    borderBottom: '1px solid #e2e8f0',
    display: 'flex',
    flexDirection: { xs: 'column', sm: 'row' } as const,
    alignItems: { xs: 'stretch', sm: 'center' },
    justifyContent: 'space-between',
    gap: { xs: 1.5, sm: 2 },
  },
  // ページタイトル（一覧ページ用）
  pageTitle: {
    fontWeight: 700,
    color: colors.text.secondary,
    fontSize: { xs: '1.1rem', sm: '1.25rem', md: '1.5rem' },
    letterSpacing: '-0.02em',
  },
  // ページタイトル（詳細ページ用）
  detailPageTitle: {
    fontWeight: 600,
    color: colors.text.primary,
    fontSize: { xs: '1.1rem', sm: '1.25rem', md: '1.5rem' },
    lineHeight: 1.3,
    letterSpacing: '-0.02em',
  },
  // 検索フィールド（テンプレート用）
  searchField: {
    width: { xs: '100%', sm: 450, md: 500 },
    '& .MuiOutlinedInput-root': {
      backgroundColor: colors.background.hover,
      borderRadius: borderRadius.xs,
      '& fieldset': { borderColor: colors.border.main },
      '&:hover fieldset': { borderColor: colors.border.dark },
      '&.Mui-focused fieldset': { borderColor: colors.accent.blue },
    },
    '& .MuiOutlinedInput-input': {
      color: colors.text.secondary,
      fontSize: fontSizes.base,
      '&::placeholder': { color: colors.text.light },
    },
  },
  // 検索フィールド（一覧ページ用）
  listSearchField: {
    flex: { xs: 1, md: 'none' },
    width: { md: 400 },
    '& .MuiOutlinedInput-root': {
      backgroundColor: colors.background.hover,
      borderRadius: borderRadius.xs,
      '& fieldset': { borderColor: colors.border.main },
      '&:hover fieldset': { borderColor: colors.border.dark },
      '&.Mui-focused fieldset': { borderColor: colors.accent.blue },
    },
    '& .MuiOutlinedInput-input': {
      color: colors.text.secondary,
      fontSize: { xs: fontSizes.sm, md: fontSizes.base },
      '&::placeholder': { color: colors.text.light },
    },
  },
  // 検索アイコン
  searchIcon: {
    color: colors.text.light,
  },
  // 検索アイコン（レスポンシブ）
  searchIconResponsive: {
    color: colors.text.light,
    fontSize: { xs: 20, md: 24 },
  },
} as const;

// 一覧ページ用DataGridスタイル（cursor: pointerなし版）
export const listDataGridStyles = {
  border: 'none',
  flex: 1,
  minHeight: { xs: 400, md: 0 },
  '& .MuiDataGrid-toolbarContainer': {
    backgroundColor: colors.background.alt,
    padding: { xs: '8px 12px', md: '12px 16px' },
    borderBottom: `2px solid ${colors.border.main}`,
    minHeight: { xs: '44px', md: '52px' },
  },
  '& .MuiDataGrid-columnHeaders': {
    backgroundColor: colors.background.alt,
    borderBottom: `2px solid ${colors.border.main}`,
  },
  '& .MuiDataGrid-columnHeaderTitle': {
    fontWeight: 700,
    color: colors.text.secondary,
    fontSize: { xs: '0.75rem', md: '0.875rem' },
  },
  '& .MuiDataGrid-row': {
    '&:hover': { backgroundColor: colors.background.hover },
  },
  '& .MuiDataGrid-cell': {
    borderBottom: `1px solid ${colors.border.light}`,
    fontSize: { xs: '0.75rem', md: '0.875rem' },
    padding: { xs: '8px', md: '16px' },
    display: 'flex',
    alignItems: 'center',
  },
  '& .MuiDataGrid-footerContainer': {
    minHeight: { xs: '44px', md: '52px' },
  },
} as const;

// 右パネル定数
export const RIGHT_PANEL_WIDTH = 320;
export const RIGHT_PANEL_WIDTH_MOBILE = 280;

// 右パネルカラー
export const rightPanelColors = {
  background: '#0f172a',
  headerBg: '#1e293b',
  text: '#f1f5f9',
  textMuted: 'rgba(241, 245, 249, 0.7)',
  border: '#334155',
  sectionBg: '#1e293b',
  inputBg: '#1e293b',
  inputBorder: '#475569',
  buttonActive: '#3b82f6',
  buttonHover: 'rgba(59, 130, 246, 0.2)',
} as const;

// 右パネルスタイル
export const rightPanelStyles = {
  drawer: {
    backgroundColor: rightPanelColors.background,
    borderLeft: `1px solid ${rightPanelColors.border}`,
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '16px 20px',
    backgroundColor: rightPanelColors.headerBg,
    borderBottom: `1px solid ${rightPanelColors.border}`,
  },
  headerTitle: {
    fontSize: '1rem',
    fontWeight: 700,
    color: rightPanelColors.text,
  },
  closeButton: {
    color: rightPanelColors.textMuted,
    '&:hover': {
      backgroundColor: 'rgba(255, 255, 255, 0.1)',
    },
  },
  content: {
    padding: '16px 20px',
    overflowY: 'auto' as const,
    flex: 1,
  },
  section: {
    marginBottom: '24px',
  },
  sectionTitle: {
    fontSize: '0.8rem',
    fontWeight: 600,
    color: rightPanelColors.textMuted,
    marginBottom: '12px',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  searchField: {
    '& .MuiOutlinedInput-root': {
      backgroundColor: 'rgba(255, 255, 255, 0.08)',
      borderRadius: borderRadius.xs,
      '& fieldset': { borderColor: rightPanelColors.inputBorder },
      '&:hover fieldset': { borderColor: rightPanelColors.textMuted },
      '&.Mui-focused fieldset': { borderColor: rightPanelColors.buttonHover },
    },
    '& .MuiOutlinedInput-input': {
      color: rightPanelColors.text,
      fontSize: fontSizes.md,
      '&::placeholder': { color: rightPanelColors.textMuted, opacity: 1 },
    },
  },
  searchIcon: {
    color: rightPanelColors.textMuted,
  },
} as const;
