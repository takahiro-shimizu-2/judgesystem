/**
 * 協力会社候補の取得・管理フック
 *
 * BidDetailPageから抽出した協力会社関連のロジックを集約。
 * CRUD操作（追加・削除・ステータス変更・現地調査トグル）と楽観的更新を含む。
 */
import { useState, useCallback, useEffect, useRef } from 'react';
import {
  fetchCompanyCandidates,
  createCompanyCandidate,
  deleteCompanyCandidate,
  updateCompanyCandidate,
} from '../data';
import type { CompanyCandidate, CompanyStatus, CompanyCandidatePayload } from '../types';

export interface UseCompanyAssignmentResult {
  /** 協力会社候補リスト */
  companies: CompanyCandidate[];
  /** ローディング状態 */
  isLoading: boolean;
  /** 協力会社候補を追加 */
  addCompany: (payload: CompanyCandidatePayload) => Promise<void>;
  /** 協力会社候補を削除 */
  removeCompany: (companyId: string) => Promise<void>;
  /** 協力会社のステータスを変更（楽観的更新） */
  changeCompanyStatus: (companyId: string, status: CompanyStatus) => Promise<void>;
  /** 現地調査の承認状態をトグル（楽観的更新） */
  toggleCompanySurvey: (companyId: string, nextValue: boolean) => Promise<void>;
}

/**
 * 協力会社候補の管理を行うカスタムフック
 *
 * @param evaluationNo - 判定結果の連番。nullish の場合はフェッチしない。
 * @returns 協力会社データと操作関数
 */
export function useCompanyAssignment(evaluationNo: string | undefined | null): UseCompanyAssignmentResult {
  const [companies, setCompanies] = useState<CompanyCandidate[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const requestIdRef = useRef(0);

  const loadCompanies = useCallback(async (targetEvaluationNo: string) => {
    const requestId = ++requestIdRef.current;
    setIsLoading(true);
    try {
      const list = await fetchCompanyCandidates(targetEvaluationNo);
      if (requestIdRef.current === requestId) {
        setCompanies(list);
      }
    } catch (error) {
      console.error('Failed to fetch company candidates:', error);
      if (requestIdRef.current === requestId) {
        setCompanies([]);
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
      setCompanies([]);
      setIsLoading(false);
      return;
    }
    void loadCompanies(evaluationNo);
  }, [evaluationNo, loadCompanies]);

  const addCompany = useCallback(async (payload: CompanyCandidatePayload) => {
    if (!evaluationNo) {
      throw new Error('判定結果を読み込み中です。再度お試しください。');
    }
    const created = await createCompanyCandidate(evaluationNo, payload);
    if (!created) {
      throw new Error('協力会社の追加に失敗しました。');
    }
    setCompanies((prev) => [...prev, created]);
  }, [evaluationNo]);

  const removeCompany = useCallback(async (companyId: string) => {
    if (!evaluationNo) {
      throw new Error('判定結果を読み込み中です。');
    }
    const success = await deleteCompanyCandidate(evaluationNo, companyId);
    if (!success) {
      throw new Error('候補の削除に失敗しました。');
    }
    setCompanies((prev) => prev.filter((p) => p.id !== companyId));
  }, [evaluationNo]);

  const changeCompanyStatus = useCallback(async (companyId: string, status: CompanyStatus) => {
    if (!evaluationNo) {
      throw new Error('判定結果を読み込み中です。');
    }
    // 楽観的更新
    setCompanies((prev) => prev.map((p) => (p.id === companyId ? { ...p, status } : p)));
    const updated = await updateCompanyCandidate(evaluationNo, companyId, { status });
    if (!updated) {
      // 失敗時はサーバーから再取得
      await loadCompanies(evaluationNo);
      throw new Error('ステータスの更新に失敗しました。');
    }
  }, [evaluationNo, loadCompanies]);

  const toggleCompanySurvey = useCallback(async (companyId: string, nextValue: boolean) => {
    if (!evaluationNo) {
      throw new Error('判定結果を読み込み中です。');
    }
    // 楽観的更新
    setCompanies((prev) => prev.map((p) => (p.id === companyId ? { ...p, surveyApproved: nextValue } : p)));
    const updated = await updateCompanyCandidate(evaluationNo, companyId, { surveyApproved: nextValue });
    if (!updated) {
      // 失敗時はサーバーから再取得
      await loadCompanies(evaluationNo);
      throw new Error('現地調査ステータスの更新に失敗しました。');
    }
  }, [evaluationNo, loadCompanies]);

  return {
    companies,
    isLoading,
    addCompany,
    removeCompany,
    changeCompanyStatus,
    toggleCompanySurvey,
  };
}
