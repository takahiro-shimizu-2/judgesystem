/**
 * 入札情報セクション
 * 資料リンク、概要情報、スケジュールを表示
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Box, Typography, Button, Chip, CircularProgress } from '@mui/material';
import { OpenInNew as OpenInNewIcon } from '@mui/icons-material';
import { CollapsibleSection, InfoRow } from '../../common';
import { colors, buttonStyles, fontSizes, chipStyles, borderRadius } from '../../../constants/styles';
import { bidTypeConfig } from '../../../constants/bidType';
import { getDocumentTypeConfig, getFileFormatConfig } from '../../../constants/documentType';
import { getApiUrl } from '../../../config/api';
import type { Announcement, DocumentOcr } from '../../../types';

// ============================================================================
// 型定義
// ============================================================================

export interface BidInfoSectionProps {
  announcement: Announcement;
}

// ============================================================================
// スタイル定数
// ============================================================================

const DOCUMENT_LINK_BUTTON_STYLE = {
  ...buttonStyles.action,
  justifyContent: 'space-between',
  fontWeight: 500,
} as const;

const PREVIEW_BOX_HEIGHT = 320;
const TRANSCRIPT_BOX_MAX_HEIGHT = 220;

type PreviewState = { url?: string; loading: boolean; error?: string };

// ============================================================================
// サブコンポーネント
// ============================================================================

interface DocumentLinkButtonProps {
  label: string;
  href?: string;
  disabled?: boolean;
}

function DocumentLinkButton({ label, href, disabled = false }: DocumentLinkButtonProps) {
  const baseProps = {
    variant: 'outlined' as const,
    size: 'small' as const,
    endIcon: <OpenInNewIcon fontSize="small" />,
    disabled,
    sx: {
      ...DOCUMENT_LINK_BUTTON_STYLE,
      color: disabled ? colors.text.light : colors.primary.main,
      '&:hover': disabled
        ? {}
        : {
            borderColor: colors.accent.blue,
            backgroundColor: 'rgba(59, 130, 246, 0.04)',
          },
    },
  };

  if (disabled) {
    return <Button {...baseProps}>{label}</Button>;
  }

  return (
    <Button
      {...baseProps}
      component="a"
      href={href || '#'}
      target="_blank"
      rel="noopener noreferrer"
    >
      {label}
    </Button>
  );
}

const extractAnnouncementNo = (announcementId?: string): string | null => {
  if (!announcementId) return null;
  if (announcementId.startsWith('ann-')) {
    const value = announcementId.substring(4);
    return /^\d+$/.test(value) ? value : null;
  }
  return /^\d+$/.test(announcementId) ? announcementId : null;
};

// ============================================================================
// コンポーネント
// ============================================================================

export function BidInfoSection({ announcement }: BidInfoSectionProps) {
  const scheduleItems = [
    { label: '申請書提出日', value: announcement.deadline },
    {
      label: '入札書提出期間',
      value: `${announcement.bidStartDate} 〜 ${announcement.bidEndDate}`,
    },
    {
      label: '説明書交付期間',
      value: `${announcement.explanationStartDate} 〜 ${announcement.explanationEndDate}`,
    },
    { label: '公告掲載日', value: announcement.publishDate },
  ];
  const documents: DocumentOcr[] = Array.isArray(announcement.documents) ? announcement.documents : [];
  const announcementNo = useMemo(() => extractAnnouncementNo(announcement.id), [announcement.id]);
  const docIdsKey = useMemo(() => documents.map((doc) => doc.id).join(','), [documents]);

  const [documentPreviewState, setDocumentPreviewState] = useState<Record<string, PreviewState>>({});
  const documentPreviewStateRef = useRef<Record<string, PreviewState>>({});
  const previewUrlRef = useRef<Record<string, string>>({});
  const previewFetchControllersRef = useRef<Record<string, AbortController>>({});

  const updatePreviewState = useCallback(
    (updater: (prev: Record<string, PreviewState>) => Record<string, PreviewState>) => {
      setDocumentPreviewState((prev) => {
        const nextState = updater(prev);
        documentPreviewStateRef.current = nextState;
        return nextState;
      });
    },
    []
  );

  const cleanupPreviewResources = useCallback(() => {
    Object.values(previewFetchControllersRef.current).forEach((controller) => controller.abort());
    previewFetchControllersRef.current = {};
    Object.values(previewUrlRef.current).forEach((url) => {
      if (url) {
        URL.revokeObjectURL(url);
      }
    });
    previewUrlRef.current = {};
  }, []);

  const resetPreviewState = useCallback(() => {
    cleanupPreviewResources();
    documentPreviewStateRef.current = {};
    setDocumentPreviewState({});
  }, [cleanupPreviewResources]);

  useEffect(() => {
    return () => {
      cleanupPreviewResources();
    };
  }, [cleanupPreviewResources]);

  useEffect(() => {
    resetPreviewState();
  }, [announcementNo, docIdsKey, resetPreviewState]);

  const loadPdfPreview = useCallback(
    async (documentId: number, options?: { force?: boolean }) => {
      const docKey = String(documentId);
      const forceReload = options?.force ?? false;
      const currentState = documentPreviewStateRef.current[docKey];
      if (!forceReload && (currentState?.loading || currentState?.url)) {
        return;
      }

      if (!announcementNo) {
        updatePreviewState((prev) => ({
          ...prev,
          [docKey]: {
            loading: false,
            error: '公告番号を取得できないためプレビューを表示できません。',
          },
        }));
        return;
      }

      if (forceReload && previewUrlRef.current[docKey]) {
        URL.revokeObjectURL(previewUrlRef.current[docKey]);
        delete previewUrlRef.current[docKey];
      }

      const existingController = previewFetchControllersRef.current[docKey];
      if (existingController) {
        existingController.abort();
      }

      const controller = new AbortController();
      previewFetchControllersRef.current[docKey] = controller;

      updatePreviewState((prev) => ({
        ...prev,
        [docKey]: { loading: true },
      }));

      try {
        const response = await fetch(
          getApiUrl(`/api/announcements/${announcementNo}/documents/${docKey}/preview`),
          { signal: controller.signal }
        );
        if (!response.ok) {
          throw new Error(`Failed to fetch preview (${response.status})`);
        }
        const blob = await response.blob();
        if (controller.signal.aborted) {
          return;
        }
        const objectUrl = URL.createObjectURL(blob);
        if (previewUrlRef.current[docKey]) {
          URL.revokeObjectURL(previewUrlRef.current[docKey]);
        }
        previewUrlRef.current[docKey] = objectUrl;

        updatePreviewState((prev) => ({
          ...prev,
          [docKey]: { loading: false, url: objectUrl },
        }));
      } catch (error) {
        if ((error instanceof DOMException && error.name === 'AbortError') || controller.signal.aborted) {
          return;
        }
        const message = error instanceof Error ? error.message : 'PDFプレビューの取得に失敗しました';
        updatePreviewState((prev) => ({
          ...prev,
          [docKey]: { loading: false, error: message },
        }));
      } finally {
        if (previewFetchControllersRef.current[docKey] === controller) {
          delete previewFetchControllersRef.current[docKey];
        }
      }
    },
    [announcementNo, updatePreviewState]
  );

  const firstPdfDocId = useMemo(() => {
    const firstPdf = documents.find(
      (doc) => doc.fileFormat && doc.fileFormat.toLowerCase() === 'pdf'
    );
    return firstPdf ? firstPdf.id : null;
  }, [documents]);

  useEffect(() => {
    if (firstPdfDocId !== null) {
      loadPdfPreview(firstPdfDocId);
    }
  }, [firstPdfDocId, loadPdfPreview]);

  const renderPreviewSection = (doc: DocumentOcr) => {
    const docKey = String(doc.id);
    const docFormat = (doc.fileFormat || '').toLowerCase();
    const isPdfDocument = docFormat === 'pdf';
    const previewState = documentPreviewState[docKey];

    if (!isPdfDocument) {
      return (
        <Box
          sx={{
            border: `1px dashed ${colors.border.main}`,
            borderRadius: borderRadius.xs,
            p: 1.25,
            backgroundColor: colors.background.default,
          }}
        >
          <Typography sx={{ fontSize: fontSizes.xs2, color: colors.text.light }}>
            PDF形式の資料のみプレビュー表示に対応しています。
          </Typography>
        </Box>
      );
    }

    if (previewState?.loading) {
      return (
        <Box
          sx={{
            border: `1px dashed ${colors.border.main}`,
            borderRadius: borderRadius.xs,
            height: PREVIEW_BOX_HEIGHT,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 1.5,
            backgroundColor: colors.text.white,
          }}
        >
          <CircularProgress size={24} sx={{ color: colors.primary.main }} />
          <Typography sx={{ fontSize: fontSizes.sm, color: colors.text.muted }}>
            プレビューを読み込み中です...
          </Typography>
        </Box>
      );
    }

    if (previewState?.error) {
      return (
        <Box
          sx={{
            border: `1px solid ${colors.status.error.light}`,
            borderRadius: borderRadius.xs,
            p: 1.5,
            backgroundColor: '#fff5f5',
            display: 'flex',
            flexDirection: 'column',
            gap: 1,
          }}
        >
          <Typography sx={{ fontSize: fontSizes.sm, fontWeight: 600, color: colors.status.error.main }}>
            プレビューの読み込みに失敗しました
          </Typography>
          <Typography sx={{ fontSize: fontSizes.xs, color: colors.text.light }}>
            {previewState.error}
          </Typography>
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            <Button
              variant="outlined"
              size="small"
              onClick={() => loadPdfPreview(doc.id, { force: true })}
              sx={{ borderRadius: borderRadius.xs }}
            >
              再読み込み
            </Button>
            {doc.url && (
              <Button
                variant="outlined"
                size="small"
                component="a"
                href={doc.url}
                target="_blank"
                rel="noopener noreferrer"
                sx={{ borderRadius: borderRadius.xs }}
              >
                元のURLを開く
              </Button>
            )}
          </Box>
        </Box>
      );
    }

    if (previewState?.url) {
      return (
        <Box
          component="iframe"
          title={`${doc.title} プレビュー`}
          src={previewState.url}
          loading="lazy"
          sx={{
            width: '100%',
            height: PREVIEW_BOX_HEIGHT,
            border: `1px solid ${colors.border.main}`,
            borderRadius: borderRadius.xs,
            backgroundColor: colors.text.white,
          }}
        />
      );
    }

    return (
      <Button
        variant="outlined"
        size="small"
        onClick={() => loadPdfPreview(doc.id)}
        sx={{ alignSelf: 'flex-start', borderRadius: borderRadius.xs }}
      >
        PDFプレビューを読み込む
      </Button>
    );
  };

  const renderTranscriptSection = (doc: DocumentOcr) => (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
      <Typography sx={{ fontSize: fontSizes.xs, fontWeight: 600, color: colors.text.secondary }}>
        文字起こし
      </Typography>
      <Box
        sx={{
          border: `1px solid ${colors.border.main}`,
          borderRadius: borderRadius.xs,
          maxHeight: TRANSCRIPT_BOX_MAX_HEIGHT,
          overflow: 'auto',
          backgroundColor: colors.background.default,
          p: 1.25,
        }}
      >
        <Typography
          component="pre"
          sx={{
            fontSize: fontSizes.xs2,
            color: colors.text.secondary,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            fontFamily: 'inherit',
            margin: 0,
            lineHeight: 1.7,
          }}
        >
          {doc.content || '文字起こしデータがありません'}
        </Typography>
      </Box>
    </Box>
  );

  const renderDocumentCard = (doc: DocumentOcr) => {
    const typeConfig = getDocumentTypeConfig(doc.type);
    const formatConfig = getFileFormatConfig(doc.fileFormat);
    const title = doc.title || typeConfig.label;

    return (
      <Box
        key={doc.id}
        sx={{
          border: `1px solid ${colors.border.main}`,
          borderRadius: borderRadius.xs,
          p: 1.5,
          backgroundColor: colors.text.white,
          display: 'flex',
          flexDirection: 'column',
          gap: 1.25,
        }}
      >
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
            <Typography sx={{ fontSize: fontSizes.sm, fontWeight: 600, color: colors.text.secondary }}>
              {title}
            </Typography>
            <Chip
              label={typeConfig.label}
              size="small"
              sx={{
                ...chipStyles.small,
                backgroundColor: typeConfig.bgColor,
                color: typeConfig.color,
              }}
            />
            {doc.pageCount && (
              <Typography sx={{ fontSize: fontSizes.xs, color: colors.text.light }}>
                {doc.pageCount}ページ
              </Typography>
            )}
            <Box sx={{ ml: 'auto', minWidth: 140 }}>
              <DocumentLinkButton
                label={`${typeConfig.label}（${formatConfig.label}）`}
                href={doc.url}
                disabled={!doc.url}
              />
            </Box>
          </Box>
        </Box>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
          <Typography sx={{ fontSize: fontSizes.xs, fontWeight: 600, color: colors.text.secondary }}>
            PDFプレビュー
          </Typography>
          {renderPreviewSection(doc)}
        </Box>
        {renderTranscriptSection(doc)}
      </Box>
    );
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      {/* 概要情報 */}
      <CollapsibleSection title="概要情報">
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          <InfoRow
            label="カテゴリ"
            value={
              <Chip
                label={announcement.category}
                size="small"
                sx={{
                  ...chipStyles.small,
                  backgroundColor: colors.accent.blueBg,
                  color: colors.accent.blue,
                }}
              />
            }
          />
          {announcement.bidType && (
            <InfoRow
              label="入札形式"
              value={
                <Chip
                  label={bidTypeConfig[announcement.bidType].label}
                  size="small"
                  sx={{
                    ...chipStyles.small,
                    backgroundColor: colors.accent.greenBg,
                    color: colors.accent.green,
                  }}
                />
              }
            />
          )}
          <InfoRow label="工事場所" value={announcement.workLocation} />
        </Box>
      </CollapsibleSection>

      {/* スケジュール */}
      <CollapsibleSection title="スケジュール">
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {scheduleItems.map((item) => (
            <InfoRow key={item.label} label={item.label} value={item.value} />
          ))}
        </Box>
      </CollapsibleSection>

      {/* 資料（リンク + プレビュー + 文字起こし） */}
      <CollapsibleSection title="資料">
        {documents.length > 0 ? (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            {documents.map((doc) => renderDocumentCard(doc))}
          </Box>
        ) : (
          <Typography sx={{ fontSize: fontSizes.xs2, color: colors.text.light }}>
            資料がありません
          </Typography>
        )}
      </CollapsibleSection>
    </Box>
  );
}
