/**
 * 判定結果データ
 * 案件ID、企業IDで他のマスターを参照
 * BidEvaluationの形式を維持（ページ互換性のため）
 */
import type {
  BidEvaluation,
  WorkStatus,
  EvaluationStatus,
  SimilarCase
} from '../types';
import { mockCompanies } from './companies';

const generateEvaluations = async (): Promise<BidEvaluation[]> => {
  const res = await fetch("/api/evaluations");
  const data = await res.json();
  return data;
}

// エクスポート
// export const mockBidEvaluations: BidEvaluation[] = generateEvaluations();
export const mockBidEvaluations: BidEvaluation[] = await generateEvaluations();

// ヘルパー関数
export const filterByStatus = (status: EvaluationStatus) =>
  mockBidEvaluations.filter((evaluation) => evaluation.status === status);

export const findById = (id: string) =>
  mockBidEvaluations.find((evaluation) => evaluation.id === id);

export const updateWorkStatus = (id: string, workStatus: WorkStatus): boolean => {
  const evaluation = mockBidEvaluations.find((e) => e.id === id);
  if (evaluation) {
    evaluation.workStatus = workStatus;
    return true;
  }
  return false;
};

export const updateCurrentStep = (id: string, currentStep: string): boolean => {
  const evaluation = mockBidEvaluations.find((e) => e.id === id);
  if (evaluation) {
    evaluation.currentStep = currentStep;
    return true;
  }
  return false;
};

// 類似案件のモックデータ（より多様な案件名）
const similarCaseTemplates = [
  '令和{year}年度{district}地区道路拡幅工事',
  '令和{year}年度{district}橋梁補強工事',
  '{district}市庁舎改修工事（第{num}期）',
  '{district}公園整備工事',
  '令和{year}年度{district}河川護岸修繕工事',
  '{district}学校体育館建設工事',
  '{district}市下水道管渠更新工事',
  '{district}消防署建設工事',
  '令和{year}年度{district}高速道路舗装工事',
  '{district}港湾岸壁補強工事',
  '令和{year}年度{district}トンネル補修工事',
  '{district}浄水場ポンプ更新工事',
  '令和{year}年度{district}堤防補強工事',
  '{district}庁舎空調設備更新工事',
  '令和{year}年度{district}砂防堰堤工事',
  '{district}住宅団地外壁改修工事',
  '令和{year}年度{district}電線共同溝整備工事',
  '{district}文化会館音響設備工事',
  '令和{year}年度{district}急傾斜地対策工事',
  '{district}スポーツセンター建設工事',
];

const districts = [
  '○○', '△△', '□□', '◇◇', '☆☆', '北', '南', '東', '西', '中央',
  '上流', '下流', 'A', 'B', '甲', '乙', '第一', '第二', '本',
];

const generateSimilarCases = (): SimilarCase[] => {
  const cases: SimilarCase[] = [];

  // 企業マスターから落札企業を選択
  const topCompanies = mockCompanies.slice(0, 30).map(c => c.name);

  for (let i = 0; i < 50; i++) {
    const template = similarCaseTemplates[i % similarCaseTemplates.length];
    const district = districts[i % districts.length];
    const year = 5 + (i % 3); // 令和5〜7年
    const num = (i % 3) + 1;

    const caseName = template
      .replace('{year}', String(year))
      .replace('{district}', district)
      .replace('{num}', String(num));

    const winningCompany = topCompanies[i % topCompanies.length];
    const winningAmount = (Math.floor(i * 7 + 10) % 90 + 10) * 10000000; // 1億〜10億

    // 競合会社（3〜6社）
    const competitorCount = 3 + (i % 4);
    const competitors = [winningCompany];
    for (let j = 1; j < competitorCount; j++) {
      const competitor = topCompanies[(i + j * 3) % topCompanies.length];
      if (!competitors.includes(competitor)) {
        competitors.push(competitor);
      }
    }

    cases.push({
      id: `similar-${i + 1}`,
      caseName,
      winningCompany,
      winningAmount,
      competitors,
    });
  }

  return cases;
};

export const mockSimilarCases: SimilarCase[] = generateSimilarCases();

export const getSimilarCases = (count: number = 5): SimilarCase[] => {
  // 固定シードでシャッフル（毎回同じ結果）
  const shuffled = [...mockSimilarCases].sort((a, b) => {
    const hashA = a.id.charCodeAt(a.id.length - 1);
    const hashB = b.id.charCodeAt(b.id.length - 1);
    return hashA - hashB;
  });
  return shuffled.slice(0, count);
};
