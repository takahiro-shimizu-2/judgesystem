/**
 * 協力会社候補の取得・管理フック
 *
 * BidDetailPageから抽出した協力会社関連のロジックを集約。
 * CRUD操作（追加・削除・ステータス変更・現地調査トグル）と楽観的更新を含む。
 */
import { useState, useCallback, useEffect, useRef } from 'react';
import {
  fetchPartnerCandidates,
  createPartnerCandidate,
  deletePartnerCandidate,
  updatePartnerCandidate,
} from '../data';
import type { Partner, PartnerStatus, PartnerCandidatePayload } from '../types';

export interface UsePartnerAssignmentResult {
  /** 協力会社候補リスト */
  partners: Partner[];
  /** ローディング状態 */
  isLoading: boolean;
  /** 協力会社候補を追加 */
  addPartner: (payload: PartnerCandidatePayload) => Promise<void>;
  /** 協力会社候補を削除 */
  removePartner: (partnerId: string) => Promise<void>;
  /** 協力会社のステータスを変更（楽観的更新） */
  changePartnerStatus: (partnerId: string, status: PartnerStatus) => Promise<void>;
  /** 現地調査の承認状態をトグル（楽観的更新） */
  togglePartnerSurvey: (partnerId: string, nextValue: boolean) => Promise<void>;
}

/**
 * 協力会社候補の管理を行うカスタムフック
 *
 * @param evaluationNo - 判定結果の連番。nullish の場合はフェッチしない。
 * @returns 協力会社データと操作関数
 */
export function usePartnerAssignment(evaluationNo: string | undefined | null): UsePartnerAssignmentResult {
  const [partners, setPartners] = useState<Partner[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const requestIdRef = useRef(0);

  const loadPartners = useCallback(async (targetEvaluationNo: string) => {
    const requestId = ++requestIdRef.current;
    setIsLoading(true);
    try {
      const list = await fetchPartnerCandidates(targetEvaluationNo);
      if (requestIdRef.current === requestId) {
        setPartners(list);
      }
    } catch (error) {
      console.error('Failed to fetch partner candidates:', error);
      if (requestIdRef.current === requestId) {
        setPartners([]);
      }
    } finally {
      if (requestIdRef.current === requestId) {
        setIsLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    if (!evaluationNo) {
      requestIdRef.current += 1;
      setPartners([]);
      setIsLoading(false);
      return;
    }
    void loadPartners(evaluationNo);
  }, [evaluationNo, loadPartners]);

  const addPartner = useCallback(async (payload: PartnerCandidatePayload) => {
    if (!evaluationNo) {
      throw new Error('判定結果を読み込み中です。再度お試しください。');
    }
    const created = await createPartnerCandidate(evaluationNo, payload);
    if (!created) {
      throw new Error('協力会社の追加に失敗しました。');
    }
    setPartners((prev) => [...prev, created]);
  }, [evaluationNo]);

  const removePartner = useCallback(async (partnerId: string) => {
    if (!evaluationNo) {
      throw new Error('判定結果を読み込み中です。');
    }
    const success = await deletePartnerCandidate(evaluationNo, partnerId);
    if (!success) {
      throw new Error('候補の削除に失敗しました。');
    }
    setPartners((prev) => prev.filter((p) => p.id !== partnerId));
  }, [evaluationNo]);

  const changePartnerStatus = useCallback(async (partnerId: string, status: PartnerStatus) => {
    if (!evaluationNo) {
      throw new Error('判定結果を読み込み中です。');
    }
    // 楽観的更新
    setPartners((prev) => prev.map((p) => (p.id === partnerId ? { ...p, status } : p)));
    const updated = await updatePartnerCandidate(evaluationNo, partnerId, { status });
    if (!updated) {
      // 失敗時はサーバーから再取得
      await loadPartners(evaluationNo);
      throw new Error('ステータスの更新に失敗しました。');
    }
  }, [evaluationNo, loadPartners]);

  const togglePartnerSurvey = useCallback(async (partnerId: string, nextValue: boolean) => {
    if (!evaluationNo) {
      throw new Error('判定結果を読み込み中です。');
    }
    // 楽観的更新
    setPartners((prev) => prev.map((p) => (p.id === partnerId ? { ...p, surveyApproved: nextValue } : p)));
    const updated = await updatePartnerCandidate(evaluationNo, partnerId, { surveyApproved: nextValue });
    if (!updated) {
      // 失敗時はサーバーから再取得
      await loadPartners(evaluationNo);
      throw new Error('現地調査ステータスの更新に失敗しました。');
    }
  }, [evaluationNo, loadPartners]);

  return {
    partners,
    isLoading,
    addPartner,
    removePartner,
    changePartnerStatus,
    togglePartnerSurvey,
  };
}
