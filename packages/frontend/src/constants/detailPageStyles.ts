/**
 * 詳細ページ共通スタイル（レスポンシブ対応）
 *
 * PartnerDetailPage, CompanyDetailPage, OrdererDetailPage, AnnouncementDetailPage で使用
 */
import type { SxProps, Theme } from '@mui/material';
import { colors, borderRadius } from './styles';

export const detailPageStyles = {
  /** ページ全体のコンテナ */
  page: {
    minHeight: '100vh',
    backgroundColor: colors.page.background, // #e2e8f0 - 一覧ページと統一
    display: 'flex',
    flexDirection: 'column',
  } as SxProps<Theme>,

  /** ヘッダー（タイトル・戻るボタン） */
  header: {
    px: { xs: 2, sm: 3 },
    py: { xs: 1.5, sm: 2 },
  } as SxProps<Theme>,

  /** ヘッダー内の戻るボタン */
  headerBackButton: {
    color: colors.text.muted,
    mb: { xs: 0.5, sm: 1 },
    fontSize: { xs: '0.8rem', sm: '0.875rem' },
    ml: -1,
  } as SxProps<Theme>,

  /** メインコンテンツエリア */
  content: {
    p: { xs: 1.5, sm: 2, md: 3 },
    maxWidth: '100%',
    mx: 'auto',
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
  } as SxProps<Theme>,

  /** 2カラムレイアウト - よりゆったりした比率 */
  twoColumnLayout: {
    display: 'grid',
    gridTemplateColumns: { xs: '1fr', md: '1.6fr 1fr', lg: '1.8fr 1fr' },
    gap: { xs: 2.5, md: 3.5 },
    flex: 1,
  } as SxProps<Theme>,

  /** カード - 高級感のあるシャドウと余白 */
  card: {
    p: { xs: 2.5, sm: 3, md: 3.5 },
    borderRadius: borderRadius.xs,
    mb: { xs: 2.5, md: 3 },
    backgroundColor: '#ffffff',
    boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.03)',
    border: '1px solid rgba(226, 232, 240, 0.8)',
    transition: 'box-shadow 0.2s ease',
    '&:hover': {
      boxShadow: '0 2px 6px rgba(0,0,0,0.06), 0 8px 24px rgba(0,0,0,0.04)',
    },
  } as SxProps<Theme>,

  /** セクションタイトル - より洗練されたタイポグラフィ */
  sectionTitle: {
    fontSize: { xs: '0.8rem', sm: '0.85rem' },
    fontWeight: 600,
    color: '#64748b',
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
    mb: { xs: 2, sm: 2.5 },
    pb: 1.5,
    borderBottom: '1px solid #f1f5f9',
    display: 'flex',
    alignItems: 'center',
    gap: 1,
  } as SxProps<Theme>,

  /** 情報行 - よりクリーンなスタイル */
  infoRow: {
    display: 'flex',
    flexDirection: { xs: 'column', sm: 'row' },
    alignItems: { xs: 'flex-start', sm: 'center' },
    gap: { xs: 0.5, sm: 2 },
    py: { xs: 1.25, sm: 1.5 },
    borderBottom: '1px solid #f8fafc',
    '&:last-child': { borderBottom: 'none', pb: 0 },
    '&:first-of-type': { pt: 0 },
  } as SxProps<Theme>,

  /** 情報ラベル（デフォルト幅） */
  infoLabel: {
    color: '#94a3b8',
    fontSize: { xs: '0.75rem', sm: '0.8rem' },
    minWidth: { xs: 'auto', sm: 100 },
    fontWeight: 500,
  } as SxProps<Theme>,

  /** 情報ラベル（広め幅） */
  infoLabelWide: {
    color: '#94a3b8',
    fontSize: { xs: '0.75rem', sm: '0.8rem' },
    minWidth: { xs: 'auto', sm: 110 },
    fontWeight: 500,
  } as SxProps<Theme>,

  /** 情報値 - より明確なコントラスト */
  infoValue: {
    color: '#1e293b',
    fontSize: { xs: '0.875rem', sm: '0.9rem' },
    fontWeight: 500,
    flex: 1,
  } as SxProps<Theme>,

  /** 統計カード - モダンなフラットデザイン */
  statCard: {
    p: { xs: 2, sm: 2.5 },
    borderRadius: borderRadius.xs,
    textAlign: 'center',
    backgroundColor: '#f8fafc',
    border: 'none',
  } as SxProps<Theme>,

  /** スケジュール項目 - より洗練されたリスト */
  scheduleItem: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    py: { xs: 1.25, sm: 1.5 },
    borderBottom: '1px solid #f8fafc',
    '&:last-child': { borderBottom: 'none', pb: 0 },
    '&:first-of-type': { pt: 0 },
  } as SxProps<Theme>,

  /** 見つからない場合のコンテナ */
  notFound: {
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    p: { xs: 2, sm: 4 },
  } as SxProps<Theme>,
} as const;
