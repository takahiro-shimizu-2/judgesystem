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
  OrdererWorkflowState,
  PartnerWorkflowState,
  CompanyCandidate,
  CompanyStatus,
  CompanyCandidatePayload,
} from '../types';
import { getApiUrl } from '../config/api';

const EMPTY_ORDERER_WORKFLOW_STATE: OrdererWorkflowState = {
  callMemos: [],
  evaluations: [],
  preSubmitDocs: [],
  transcriptions: [],
};

const EMPTY_PARTNER_WORKFLOW_STATE: PartnerWorkflowState = {
  sentDocuments: [],
  partners: {},
};

export const createEmptyOrdererWorkflowState = (): OrdererWorkflowState => ({
  callMemos: [],
  evaluations: [],
  preSubmitDocs: [],
  transcriptions: [],
});

export const createEmptyPartnerWorkflowState = (): PartnerWorkflowState => ({
  sentDocuments: [],
  partners: {},
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

export const fetchPartnerWorkflowState = async (
  evaluationNo: string
): Promise<PartnerWorkflowState> => {
  try {
    const response = await fetch(getApiUrl(`/api/evaluations/${evaluationNo}/partner-workflow`));
    if (!response.ok) {
      console.error(`Failed to fetch partner workflow: ${response.status} ${response.statusText}`);
      return createEmptyPartnerWorkflowState();
    }
    const data = await response.json();
    return {
      ...EMPTY_PARTNER_WORKFLOW_STATE,
      ...data,
    };
  } catch (error) {
    console.error('Error fetching partner workflow:', error);
    return createEmptyPartnerWorkflowState();
  }
};

export const updatePartnerWorkflowState = async (
  evaluationNo: string,
  state: PartnerWorkflowState
): Promise<PartnerWorkflowState | null> => {
  try {
    const response = await fetch(getApiUrl(`/api/evaluations/${evaluationNo}/partner-workflow`), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(state),
    });

    if (!response.ok) {
      let message = `Failed to update partner workflow: ${response.status} ${response.statusText}`;
      try {
        const body = await response.json();
        if (typeof body?.message === 'string') {
          message = body.message;
        }
      } catch {
        // ignore json parse errors
      }
      console.error(message);
      return null;
    }

    const data = await response.json();
    return {
      ...EMPTY_PARTNER_WORKFLOW_STATE,
      ...data,
    };
  } catch (error) {
    console.error('Error updating partner workflow:', error);
    return null;
  }
};

interface PartnerWorkflowFileUploadPayload {
  partnerId?: string;
  flowType: 'sent' | 'received';
  name: string;
  contentType?: string;
  size: number;
  dataUrl: string;
}

interface PartnerWorkflowFileMetadata {
  id: string;
  evaluationNo: string;
  partnerId: string | null;
  flowType: 'sent' | 'received';
  name: string;
  contentType?: string | null;
  size: number;
}

export const uploadPartnerWorkflowFile = async (
  evaluationNo: string,
  payload: PartnerWorkflowFileUploadPayload
): Promise<PartnerWorkflowFileMetadata> => {
  const response = await fetch(getApiUrl(`/api/evaluations/${evaluationNo}/partner-files`), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    let message = `Failed to upload partner file: ${response.status} ${response.statusText}`;
    try {
      const body = await response.json();
      if (typeof body?.message === 'string') {
        message = body.message;
      }
    } catch {
      // ignore
    }
    throw new Error(message);
  }

  return (await response.json()) as PartnerWorkflowFileMetadata;
};

export const deletePartnerWorkflowFile = async (
  evaluationNo: string,
  fileId: string
): Promise<boolean> => {
  const response = await fetch(getApiUrl(`/api/evaluations/${evaluationNo}/partner-files/${fileId}`), {
    method: 'DELETE',
  });

  if (response.status === 404) {
    return false;
  }

  if (!response.ok && response.status !== 204) {
    throw new Error(`Failed to delete partner file: ${response.status} ${response.statusText}`);
  }

  return true;
};

export const downloadPartnerWorkflowFile = async (
  evaluationNo: string,
  fileId: string
): Promise<Blob> => {
  const response = await fetch(getApiUrl(`/api/evaluations/${evaluationNo}/partner-files/${fileId}`));
  if (!response.ok) {
    throw new Error(`Failed to download partner file: ${response.status} ${response.statusText}`);
  }
  return await response.blob();
};

const COMPANY_STATUS_VALUES: CompanyStatus[] = [
  'not_called',
  'waiting_documents',
  'waiting_response',
  'estimate_in_progress',
  'estimate_completed',
  'estimate_adopted',
  'unavailable',
];

interface CompanyCandidateResponse {
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

const mapCompanyFromApi = (candidate: CompanyCandidateResponse): CompanyCandidate => {
  const normalizedStatus = COMPANY_STATUS_VALUES.includes(candidate.status as CompanyStatus)
    ? (candidate.status as CompanyStatus)
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

export const fetchCompanyCandidates = async (evaluationNo: string): Promise<CompanyCandidate[]> => {
  try {
    const response = await fetch(getApiUrl(`/api/evaluations/${evaluationNo}/partners`));
    if (!response.ok) {
      throw new Error(`Failed to fetch partners: ${response.status}`);
    }
    const data: CompanyCandidateResponse[] = await response.json();
    if (!Array.isArray(data)) {
      return [];
    }
    return data.map(mapCompanyFromApi);
  } catch (error) {
    console.error('Error fetching company candidates:', error);
    return [];
  }
};

export const createCompanyCandidate = async (
  evaluationNo: string,
  payload: CompanyCandidatePayload
): Promise<CompanyCandidate | null> => {
  try {
    const response = await fetch(getApiUrl(`/api/evaluations/${evaluationNo}/partners`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      let message = `Failed to create company candidate: ${response.status}`;
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
    const data: CompanyCandidateResponse = await response.json();
    return mapCompanyFromApi(data);
  } catch (error) {
    console.error('Error creating company candidate:', error);
    return null;
  }
};

interface CompanyCandidateUpdatePayload {
  partnerName?: string;
  contactPerson?: string | null;
  phone?: string | null;
  email?: string | null;
  fax?: string | null;
  status?: CompanyStatus;
  surveyApproved?: boolean;
}

export const updateCompanyCandidate = async (
  evaluationNo: string,
  partnerId: string,
  updates: CompanyCandidateUpdatePayload
): Promise<CompanyCandidate | null> => {
  const body: CompanyCandidateUpdatePayload = { ...updates };
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
      throw new Error(`Failed to update company candidate: ${response.status}`);
    }
    const data: CompanyCandidateResponse = await response.json();
    return mapCompanyFromApi(data);
  } catch (error) {
    console.error('Error updating company candidate:', error);
    return null;
  }
};

export const deleteCompanyCandidate = async (
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
      throw new Error(`Failed to delete company candidate: ${response.status}`);
    }
    return true;
  } catch (error) {
    console.error('Error deleting company candidate:', error);
    return false;
  }
};

