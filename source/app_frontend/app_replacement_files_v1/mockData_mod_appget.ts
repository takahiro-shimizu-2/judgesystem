import type { BidEvaluation} from '../types';

//データ

// モックデータ
// export const mockBidEvaluations: BidEvaluation[] = generateEvaluations();
const generateEvaluations = async (): Promise<BidEvaluation[]> => {
  const res = await fetch("/api/result");
  const data = await res.json();
  return data;
}
// export const mockBidEvaluations: BidEvaluation[] = generateEvaluations();
export const mockBidEvaluations = await generateEvaluations();

// ステータスでフィルタリングするヘルパー関数
export const filterByStatus = (status: BidEvaluation['status']) =>
  mockBidEvaluations.filter((evaluation) => evaluation.status === status);

// IDで検索するヘルパー関数
export const findById = (id: string) =>
  mockBidEvaluations.find((evaluation) => evaluation.id === id);
