/**
 * 入札資料表示セクション
 * メインエリア内で資料一覧とPDFプレビュー/文字起こしを切り替えて表示する
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Box, Typography, Button, Chip, CircularProgress, Tabs, Tab } from '@mui/material';
import { OpenInNew as OpenInNewIcon, ChevronLeft as ChevronLeftIcon } from '@mui/icons-material';
import { colors, buttonStyles, fontSizes, chipStyles, borderRadius } from '../../../constants/styles';
import { getDocumentTypeConfig, getFileFormatConfig } from '../../../constants/documentType';
import { getApiUrl } from '../../../config/api';
import type { Announcement, DocumentOcr } from '../../../types';

interface BidDocumentsSectionProps {
  announcement: Announcement;
}

const DOCUMENT_LINK_BUTTON_STYLE = {
  ...buttonStyles.action,
  justifyContent: 'space-between',
  fontWeight: 500,
} as const;

const PREVIEW_TABS = [
  { id: 'pdf', label: 'PDFプレビュー' },
  { id: 'transcription', label: '文字起こし' },
] as const;
type PreviewTab = (typeof PREVIEW_TABS)[number]['id'];

type PreviewState = { url?: string; loading: boolean; error?: string };

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

const getDocumentDisplayLabel = (doc: DocumentOcr, typeLabel?: string) => {
  const normalizedTitle = doc.title?.trim();
  if (normalizedTitle) {
    return normalizedTitle;
  }
  const normalizedType = typeLabel?.trim();
  if (normalizedType) {
    return normalizedType;
  }
  return '資料';
};

const extractAnnouncementNo = (announcementId?: string): string | null => {
  if (!announcementId) return null;
  if (announcementId.startsWith('ann-')) {
    const value = announcementId.substring(4);
    return /^\d+$/.test(value) ? value : null;
  }
  return /^\d+$/.test(announcementId) ? announcementId : null;
};

export function BidDocumentsSection({ announcement }: BidDocumentsSectionProps) {
  const documents = useMemo<DocumentOcr[]>(() => (
    Array.isArray(announcement.documents) ? announcement.documents : []
  ), [announcement.documents]);
  const announcementNo = useMemo(() => extractAnnouncementNo(announcement.id), [announcement.id]);
  const docIdsKey = useMemo(() => documents.map((doc) => doc.id).join(','), [documents]);

  const [selectedDocId, setSelectedDocId] = useState<number | null>(null);
  const [previewTab, setPreviewTab] = useState<PreviewTab>('pdf');
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

  const handleSelectDocument = useCallback(
    (docId: number) => {
      setSelectedDocId(docId);
      const doc = documents.find((item) => item.id === docId);
      if (doc && (doc.fileFormat || '').toLowerCase() === 'pdf') {
        loadPdfPreview(docId);
        setPreviewTab('pdf');
      } else {
        setPreviewTab('transcription');
      }
    },
    [documents, loadPdfPreview]
  );

  const selectedDoc = useMemo(() => {
    if (selectedDocId === null) return null;
    return documents.find((doc) => doc.id === selectedDocId) || null;
  }, [documents, selectedDocId]);

  useEffect(() => {
    if (documents.length === 0) {
      setSelectedDocId(null);
      return;
    }
    if (selectedDocId === null || !documents.some((doc) => doc.id === selectedDocId)) {
      setSelectedDocId(documents[0].id);
    }
  }, [documents, selectedDocId]);

  useEffect(() => {
    if (!selectedDoc) return;
    const docFormat = (selectedDoc.fileFormat || '').toLowerCase();
    if (docFormat === 'pdf') {
      if (previewTab !== 'pdf') {
        setPreviewTab('pdf');
      }
      loadPdfPreview(selectedDoc.id);
    } else if (previewTab === 'pdf') {
      setPreviewTab('transcription');
    }
  }, [selectedDoc, loadPdfPreview, previewTab]);

  const renderPreviewPanel = () => {
    if (!selectedDoc) {
      return (
        <Box
          sx={{
            border: `1px dashed ${colors.border.main}`,
            borderRadius: borderRadius.xs,
            p: 4,
            backgroundColor: colors.background.default,
            textAlign: 'center',
          }}
        >
          <Typography sx={{ fontSize: fontSizes.sm, color: colors.text.light }}>
            表示する資料を左のリストから選択してください。
          </Typography>
        </Box>
      );
    }

    const docKey = String(selectedDoc.id);
    const docFormat = (selectedDoc.fileFormat || '').toLowerCase();
    const isPdfDocument = docFormat === 'pdf';
    const previewState = documentPreviewState[docKey];
    const typeConfig = getDocumentTypeConfig(selectedDoc.type);
    const activeTab = isPdfDocument ? previewTab : 'transcription';
    const handleTabChange = (_: unknown, value: PreviewTab) => {
      if (value === 'pdf' && !isPdfDocument) return;
      setPreviewTab(value);
      if (value === 'pdf') {
        loadPdfPreview(selectedDoc.id);
      }
    };

    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Typography sx={{ fontSize: fontSizes.lg, fontWeight: 600, color: colors.text.secondary, flex: 1 }}>
            {selectedDoc.title || typeConfig.label}
          </Typography>
          <DocumentLinkButton label="資料を開く" href={selectedDoc.url} disabled={!selectedDoc.url} />
        </Box>

        <Tabs
          value={activeTab}
          onChange={handleTabChange}
          sx={{
            borderBottom: `1px solid ${colors.border.main}`,
            '& .MuiTab-root': {
              fontSize: fontSizes.sm,
              fontWeight: 600,
              textTransform: 'none',
              minHeight: 44,
            },
            '& .MuiTabs-indicator': {
              backgroundColor: colors.accent.blue,
            },
          }}
        >
          <Tab value="pdf" label="PDFプレビュー" disabled={!isPdfDocument} />
          <Tab value="transcription" label="文字起こし" />
        </Tabs>

        {activeTab === 'pdf' && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {!isPdfDocument && (
              <Box
                sx={{
                  border: `1px dashed ${colors.border.main}`,
                  borderRadius: borderRadius.xs,
                  p: 1.25,
                  backgroundColor: colors.background.default,
                }}
              >
                <Typography sx={{ fontSize: fontSizes.sm, color: colors.text.light }}>
                  PDF形式の資料のみプレビュー表示に対応しています。
                </Typography>
              </Box>
            )}

            {isPdfDocument && !selectedDoc.url && (
              <Box
                sx={{
                  border: `1px solid ${colors.status.error.light}`,
                  borderRadius: borderRadius.xs,
                  p: 1.5,
                  backgroundColor: '#fff5f5',
                }}
              >
                <Typography sx={{ fontSize: fontSizes.sm, fontWeight: 600, color: colors.status.error.main }}>
                  PDF URL が未設定のためプレビューを表示できません
                </Typography>
                <Typography sx={{ fontSize: fontSizes.xs, color: colors.text.light, mt: 0.5 }}>
                  資料のURLが登録されていないため、プレビュー機能を利用できません。
                </Typography>
              </Box>
            )}

            {isPdfDocument && previewState?.loading && (
              <Box
                sx={{
                  border: `1px dashed ${colors.border.main}`,
                  borderRadius: borderRadius.xs,
                  height: '60vh',
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
            )}

            {isPdfDocument && previewState?.error && (
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
                <Typography sx={{ fontSize: fontSizes.xs, color: colors.text.light }}>{previewState.error}</Typography>
                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                  <Button
                    variant="outlined"
                    size="small"
                    onClick={() => loadPdfPreview(selectedDoc.id, { force: true })}
                    sx={{ borderRadius: borderRadius.xs }}
                  >
                    再読み込み
                  </Button>
                  {selectedDoc.url && (
                    <Button
                      variant="outlined"
                      size="small"
                      component="a"
                      href={selectedDoc.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      sx={{ borderRadius: borderRadius.xs }}
                    >
                      元のURLを開く
                    </Button>
                  )}
                </Box>
              </Box>
            )}

            {isPdfDocument && previewState?.url && (
              <Box
                component="iframe"
                title={`${selectedDoc.title} プレビュー`}
                src={previewState.url}
                loading="lazy"
                sx={{
                  width: '100%',
                  height: '70vh',
                  border: `1px solid ${colors.border.main}`,
                  borderRadius: borderRadius.xs,
                  backgroundColor: colors.text.white,
                }}
              />
            )}

            {isPdfDocument && !previewState && (
              <Button
                variant="outlined"
                size="small"
                onClick={() => loadPdfPreview(selectedDoc.id)}
                sx={{ alignSelf: 'flex-start', borderRadius: borderRadius.xs }}
              >
                PDFプレビューを読み込む
              </Button>
            )}
          </Box>
        )}

        {activeTab === 'transcription' && (
          <Box
            sx={{
              border: `1px solid ${colors.border.main}`,
              borderRadius: borderRadius.xs,
              backgroundColor: colors.background.default,
              p: 2,
              minHeight: '30vh',
            }}
          >
            <Typography
              component="pre"
              sx={{
                fontSize: fontSizes.sm,
                color: colors.text.secondary,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                fontFamily: 'inherit',
                margin: 0,
                lineHeight: 1.7,
              }}
            >
              {selectedDoc.content || '文字起こしデータがありません'}
            </Typography>
          </Box>
        )}
      </Box>
    );
  };

  const renderDocumentCard = (doc: DocumentOcr) => {
    const typeConfig = getDocumentTypeConfig(doc.type);
    const formatConfig = getFileFormatConfig(doc.fileFormat);
    const displayLabel = getDocumentDisplayLabel(doc, typeConfig.label);

    const isSelected = selectedDocId === doc.id;
    return (
      <Box
        key={doc.id}
        onClick={() => handleSelectDocument(doc.id)}
        sx={{
          border: `1px solid ${isSelected ? colors.accent.blue : colors.border.main}`,
          borderRadius: borderRadius.xs,
          p: 2,
          backgroundColor: isSelected ? 'rgba(59, 130, 246, 0.04)' : colors.text.white,
          display: 'flex',
          flexDirection: 'column',
          gap: 1.5,
          cursor: 'pointer',
          transition: 'border-color 0.15s ease, background-color 0.15s ease',
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
          <Typography sx={{ fontSize: fontSizes.md, fontWeight: 600, color: colors.text.secondary }}>
            {displayLabel}
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
            <Typography sx={{ fontSize: fontSizes.sm, color: colors.text.light }}>
              {doc.pageCount}ページ
            </Typography>
          )}
          <Typography sx={{ fontSize: fontSizes.xs, color: colors.text.light }}>
            {formatConfig.label}
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
          <Button
            variant="outlined"
            size="small"
            onClick={(event) => {
              event.stopPropagation();
              handleSelectDocument(doc.id);
            }}
            endIcon={<ChevronLeftIcon />}
            sx={{ borderRadius: borderRadius.xs }}
          >
            {isSelected ? '選択中' : 'プレビュー表示'}
          </Button>
          <DocumentLinkButton
            label={`${displayLabel}（${formatConfig.label}）`}
            href={doc.url}
            disabled={!doc.url}
          />
        </Box>
      </Box>
    );
  };

  if (documents.length === 0) {
    return (
      <Box sx={{ p: 3 }}>
        <Typography sx={{ fontSize: fontSizes.md, color: colors.text.light }}>
          資料が登録されていません。
        </Typography>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: { xs: 'column', lg: 'row' },
        gap: 3,
      }}
    >
      <Box
        sx={{
          flex: { xs: 'unset', lg: '0 0 360px' },
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
        }}
      >
        {documents.map((doc) => renderDocumentCard(doc))}
      </Box>
      <Box
        sx={{
          flex: 1,
          border: `1px solid ${colors.border.main}`,
          borderRadius: borderRadius.xs,
          backgroundColor: colors.text.white,
          p: 3,
        }}
      >
        {renderPreviewPanel()}
      </Box>
    </Box>
  );
}
