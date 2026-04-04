/**
 * 類似案件の取得・管理フック
 *
 * BidDetailPageから抽出した類似案件関連のロジックを集約。
 * AbortControllerによるレースコンディション防止、リトライ機能を含む。
 */
import { useState, useCallback, useEffect, useRef } from 'react';
import { getApiUrl } from '../config/api';
import type { SimilarCase } from '../types';

export interface UseSimilarCasesResult {
  /** 類似案件リスト */
  similarCases: SimilarCase[];
  /** ローディング状態 */
  isLoading: boolean;
  /** エラーメッセージ（正常時は null） */
  error: string | null;
  /** データ再取得 */
  retry: () => void;
}

/**
 * 類似案件の取得を管理するカスタムフック
 *
 * @param announcementId - 公告ID（例: "ann-123"）。nullish の場合はフェッチしない。
 * @returns 類似案件データとローディング・エラー状態
 */
export function useSimilarCases(announcementId: string | undefined | null): UseSimilarCasesResult {
  const [similarCases, setSimilarCases] = useState<SimilarCase[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [targetAnnouncementNo, setTargetAnnouncementNo] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const fetchSimilarCases = useCallback(async (announcementNo: string) => {
    if (!announcementNo) return;

    // 前回のリクエストをキャンセル（レースコンディション防止）
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(
        getApiUrl(`/api/announcements/${announcementNo}/similar-cases`),
        { signal: controller.signal }
      );
      if (!response.ok) {
        throw new Error(`Failed to fetch similar cases: ${response.status}`);
      }
      const data = await response.json();
      if (!controller.signal.aborted) {
        setSimilarCases(data);
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        return; // キャンセルされたリクエストは無視
      }
      console.error('Failed to fetch similar cases:', err);
      if (!controller.signal.aborted) {
        setSimilarCases([]);
        setError(err instanceof Error ? err.message : 'Unknown error');
      }
    } finally {
      if (!controller.signal.aborted) {
        setIsLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    if (!announcementId) {
      abortRef.current?.abort();
      setSimilarCases([]);
      setTargetAnnouncementNo(null);
      return;
    }
    const match = announcementId.match(/^ann-(\d+)$/);
    const announcementNo = match ? match[1] : announcementId;
    setTargetAnnouncementNo(announcementNo);
    fetchSimilarCases(announcementNo);

    return () => {
      abortRef.current?.abort();
    };
  }, [announcementId, fetchSimilarCases]);

  const retry = useCallback(() => {
    if (targetAnnouncementNo) {
      fetchSimilarCases(targetAnnouncementNo);
    }
  }, [targetAnnouncementNo, fetchSimilarCases]);

  return {
    similarCases,
    isLoading,
    error,
    retry,
  };
}
