/**
 * 判定結果データ
 * 案件ID、企業IDで他のマスターを参照
 * BidEvaluationの形式を維持（ページ互換性のため）
 *
 * Note: サーバーサイドページネーション移行により、全件取得は削除
 * データ取得は useBidListState で行う
 */
import type {
  WorkStatus,
  SimilarCase,
  OrdererWorkflowState,
  Partner,
  PartnerStatus,
  PartnerCandidatePayload,
} from '../types';
import { getApiUrl } from '../config/api';

const EMPTY_ORDERER_WORKFLOW_STATE: OrdererWorkflowState = {
  callMemos: [],
  evaluations: [],
  preSubmitDocs: [],
  transcriptions: [],
};

export const createEmptyOrdererWorkflowState = (): OrdererWorkflowState => ({
  callMemos: [],
  evaluations: [],
  preSubmitDocs: [],
  transcriptions: [],
});

export const updateWorkStatus = async (
  evaluationNo: string,
  workStatus: WorkStatus,
  currentStep?: string
): Promise<boolean> => {
  try {
    const response = await fetch(getApiUrl(`/api/evaluations/${evaluationNo}`), {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ workStatus, currentStep }),
    });

    if (!response.ok) {
      console.error(`Failed to update workStatus: ${response.status} ${response.statusText}`);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error updating workStatus:', error);
    return false;
  }
};

export const updateEvaluationAssignee = async (
  evaluationNo: string,
  stepId: string,
  staffId: string
): Promise<boolean> => {
  try {
    const response = await fetch(getApiUrl(`/api/evaluations/${evaluationNo}/assignees`), {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        stepId,
        contactId: staffId || null,
      }),
    });

    if (!response.ok) {
      console.error(`Failed to update assignee: ${response.status} ${response.statusText}`);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error updating assignee:', error);
    return false;
  }
};

export const fetchOrdererWorkflowState = async (
  evaluationNo: string
): Promise<OrdererWorkflowState> => {
  try {
    const response = await fetch(getApiUrl(`/api/evaluations/${evaluationNo}/orderer-workflow`));
    if (!response.ok) {
      console.error(`Failed to fetch orderer workflow: ${response.status} ${response.statusText}`);
      return createEmptyOrdererWorkflowState();
    }

    const data = await response.json();
    return {
      ...EMPTY_ORDERER_WORKFLOW_STATE,
      ...data,
    };
  } catch (error) {
    console.error('Error fetching orderer workflow:', error);
    return createEmptyOrdererWorkflowState();
  }
};

export const updateOrdererWorkflowState = async (
  evaluationNo: string,
  state: OrdererWorkflowState
): Promise<OrdererWorkflowState | null> => {
  try {
    const response = await fetch(getApiUrl(`/api/evaluations/${evaluationNo}/orderer-workflow`), {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(state),
    });

    if (!response.ok) {
      let message = `Failed to update orderer workflow: ${response.status} ${response.statusText}`;
      try {
        const errorBody = await response.json();
        if (typeof errorBody?.message === 'string') {
          message = errorBody.message;
        }
      } catch {
        // ignore parse errors
      }
      console.error(message);
      return null;
    }

    const data = await response.json();
    return {
      ...EMPTY_ORDERER_WORKFLOW_STATE,
      ...data,
    };
  } catch (error) {
    console.error('Error updating orderer workflow:', error);
    return null;
  }
};

const PARTNER_STATUS_VALUES: PartnerStatus[] = [
  'not_called',
  'waiting_documents',
  'waiting_response',
  'estimate_in_progress',
  'estimate_completed',
  'estimate_adopted',
  'unavailable',
];

interface PartnerCandidateResponse {
  id: string;
  evaluationNo: string;
  partnerId: string;
  partnerName: string;
  contactPerson?: string | null;
  phone?: string | null;
  email?: string | null;
  fax?: string | null;
  status: string;
  surveyApproved: boolean;
  createdAt?: string;
  updatedAt?: string;
}

const mapPartnerFromApi = (candidate: PartnerCandidateResponse): Partner => {
  const normalizedStatus = PARTNER_STATUS_VALUES.includes(candidate.status as PartnerStatus)
    ? (candidate.status as PartnerStatus)
    : 'not_called';
  return {
    id: String(candidate.id),
    name: candidate.partnerName,
    contactPerson: candidate.contactPerson ?? '',
    phone: candidate.phone ?? '',
    email: candidate.email ?? '',
    fax: candidate.fax ?? '',
    status: normalizedStatus,
    memos: [],
    transcriptions: [],
    talkScript: '',
    surveyApproved: Boolean(candidate.surveyApproved),
    receivedDocuments: [],
  };
};

export const fetchPartnerCandidates = async (evaluationNo: string): Promise<Partner[]> => {
  try {
    const response = await fetch(getApiUrl(`/api/evaluations/${evaluationNo}/partners`));
    if (!response.ok) {
      throw new Error(`Failed to fetch partners: ${response.status}`);
    }
    const data: PartnerCandidateResponse[] = await response.json();
    if (!Array.isArray(data)) {
      return [];
    }
    return data.map(mapPartnerFromApi);
  } catch (error) {
    console.error('Error fetching partner candidates:', error);
    return [];
  }
};

export const createPartnerCandidate = async (
  evaluationNo: string,
  payload: PartnerCandidatePayload
): Promise<Partner | null> => {
  try {
    const response = await fetch(getApiUrl(`/api/evaluations/${evaluationNo}/partners`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      let message = `Failed to create partner candidate: ${response.status}`;
      try {
        const errorBody = await response.json();
        if (typeof errorBody?.message === 'string') {
          message = errorBody.message;
        }
      } catch {
        // ignore parse errors
      }
      throw new Error(message);
    }
    const data: PartnerCandidateResponse = await response.json();
    return mapPartnerFromApi(data);
  } catch (error) {
    console.error('Error creating partner candidate:', error);
    return null;
  }
};

interface PartnerCandidateUpdatePayload {
  partnerName?: string;
  contactPerson?: string | null;
  phone?: string | null;
  email?: string | null;
  fax?: string | null;
  status?: PartnerStatus;
  surveyApproved?: boolean;
}

export const updatePartnerCandidate = async (
  evaluationNo: string,
  partnerId: string,
  updates: PartnerCandidateUpdatePayload
): Promise<Partner | null> => {
  const body: any = { ...updates };
  if (updates.partnerName !== undefined) {
    body.partnerName = updates.partnerName;
  }
  if (updates.status !== undefined) {
    body.status = updates.status;
  }
  if (updates.surveyApproved !== undefined) {
    body.surveyApproved = updates.surveyApproved;
  }
  try {
    const response = await fetch(
      getApiUrl(`/api/evaluations/${evaluationNo}/partners/${partnerId}`),
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }
    );
    if (!response.ok) {
      throw new Error(`Failed to update partner candidate: ${response.status}`);
    }
    const data: PartnerCandidateResponse = await response.json();
    return mapPartnerFromApi(data);
  } catch (error) {
    console.error('Error updating partner candidate:', error);
    return null;
  }
};

export const deletePartnerCandidate = async (
  evaluationNo: string,
  partnerId: string
): Promise<boolean> => {
  try {
    const response = await fetch(getApiUrl(`/api/evaluations/${evaluationNo}/partners/${partnerId}`), {
      method: 'DELETE',
    });
    if (response.status === 204) {
      return true;
    }
    if (!response.ok) {
      throw new Error(`Failed to delete partner candidate: ${response.status}`);
    }
    return true;
  } catch (error) {
    console.error('Error deleting partner candidate:', error);
    return false;
  }
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

  // 落札企業リスト（ハードコード）
  const topCompanies = [
    '大成建設', '鹿島建設', '清水建設', '大林組', '竹中工務店',
    '前田建設工業', '戸田建設', '三井住友建設', '西松建設', 'フジタ',
    '熊谷組', '安藤ハザマ', '五洋建設', '東急建設', '奥村組',
    '長谷工コーポレーション', '東亜建設工業', '鉄建建設', '飛島建設', '淺沼組',
    'ピーエス三菱', '佐藤工業', '錢高組', '東洋建設', '青木あすなろ建設',
    '若築建設', '大豊建設', '不動テトラ', '松井建設', '北野建設',
  ];

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
      announcementId: `ann-${i + 1}`,  // 入札案件IDと紐づけ
      similarAnnouncementId: `ann-${((i + 5) % 50) + 1}`,
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
