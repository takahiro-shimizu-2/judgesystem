import {
  EvaluationRepository,
  EvaluationAssignmentRepository,
  EvaluationOrdererWorkflowRepository,
  EvaluationPartnerCandidateRepository,
  EvaluationPartnerWorkflowRepository,
  EvaluationPartnerFileRepository,
} from "../repositories";
import { FilterParams, PaginatedResponse } from "../types";
import { DEFAULT_PAGE_SIZE } from "../constants";
import type {
  EvaluationListItem,
  EvaluationDetail,
  EvaluationWorkStatusResult,
  EvaluationStats,
} from "../types/evaluation";
import type { OrdererWorkflowState } from "../repositories/evaluationOrdererWorkflowRepository";
import type { PartnerWorkflowState } from "../repositories/evaluationPartnerWorkflowRepository";
import type { PartnerFileFlowType, PartnerFileMetadata, PartnerFileRecord } from "../repositories/evaluationPartnerFileRepository";
import type { EvaluationPartnerCandidate } from "../types/evaluationPartnerCandidate";

export interface CreatePartnerCandidateParams {
  partnerId: string;
  partnerName: string;
  contactPerson?: string | null;
  phone?: string | null;
  email?: string | null;
  fax?: string | null;
}

export interface UpdatePartnerCandidateParams {
  partnerName?: string;
  contactPerson?: string | null;
  phone?: string | null;
  email?: string | null;
  fax?: string | null;
  status?: string;
  surveyApproved?: boolean;
}

export class EvaluationService {
  private repository: EvaluationRepository;
  private assignmentRepository: EvaluationAssignmentRepository;
  private ordererWorkflowRepository: EvaluationOrdererWorkflowRepository;
  private partnerCandidateRepository: EvaluationPartnerCandidateRepository;
  private partnerWorkflowRepository: EvaluationPartnerWorkflowRepository;
  private partnerFileRepository: EvaluationPartnerFileRepository;

  constructor() {
    this.repository = new EvaluationRepository();
    this.assignmentRepository = new EvaluationAssignmentRepository();
    this.ordererWorkflowRepository = new EvaluationOrdererWorkflowRepository();
    this.partnerCandidateRepository = new EvaluationPartnerCandidateRepository();
    this.partnerWorkflowRepository = new EvaluationPartnerWorkflowRepository();
    this.partnerFileRepository = new EvaluationPartnerFileRepository();
  }

  /**
   * Get paginated list of evaluations with filters
   */
  async getList(filters: FilterParams): Promise<PaginatedResponse<EvaluationListItem>> {
    const { data, total } = await this.repository.findWithFilters(filters);

    const page = filters.page || 0;
    const pageSize = filters.pageSize || DEFAULT_PAGE_SIZE;

    return {
      data,
      total,
      page,
      pageSize,
    };
  }

  /**
   * Get single evaluation by ID
   */
  async getById(id: string): Promise<EvaluationDetail | null> {
    return await this.repository.findById(id);
  }

  /**
   * Update work status of an evaluation
   */
  async updateWorkStatus(
    evaluationNo: string,
    workStatus: string,
    currentStep?: string
  ): Promise<EvaluationWorkStatusResult | null> {
    // Validate workStatus
    const validStatuses = ["not_started", "in_progress", "completed"];
    if (!validStatuses.includes(workStatus)) {
      throw new Error(`Invalid workStatus. Valid values: ${validStatuses.join(", ")}`);
    }

    return await this.repository.updateWorkStatus(evaluationNo, workStatus, currentStep);
  }

  /**
   * Get statistics for analytics dashboard
   */
  async getStats(): Promise<EvaluationStats> {
    return await this.repository.getStats();
  }

  /**
   * Get aggregated counts by evaluation status
   */
  async getStatusCounts(filters: FilterParams): Promise<{ all_met: number; other_only_unmet: number; unmet: number }> {
    return await this.repository.getStatusCounts(filters);
  }

  async getAssignees(evaluationNo: string) {
    return await this.assignmentRepository.findByEvaluation(evaluationNo);
  }

  async updateAssignee(evaluationNo: string, stepId: string, contactId?: string | null) {
    if (!stepId) {
      throw new Error("stepId is required");
    }

    if (!contactId) {
      await this.assignmentRepository.delete(evaluationNo, stepId);
      return { evaluationNo, stepId, staffId: null };
    }

    return await this.assignmentRepository.upsert(evaluationNo, stepId, contactId);
  }

  async getOrdererWorkflow(evaluationNo: string): Promise<OrdererWorkflowState> {
    return await this.ordererWorkflowRepository.findByEvaluation(evaluationNo);
  }

  async updateOrdererWorkflow(
    evaluationNo: string,
    state: OrdererWorkflowState
  ): Promise<OrdererWorkflowState> {
    return await this.ordererWorkflowRepository.upsert(evaluationNo, state);
  }

  async getPartnerWorkflow(evaluationNo: string): Promise<PartnerWorkflowState> {
    return await this.partnerWorkflowRepository.findByEvaluation(evaluationNo);
  }

  async updatePartnerWorkflow(
    evaluationNo: string,
    state: PartnerWorkflowState
  ): Promise<PartnerWorkflowState> {
    return await this.partnerWorkflowRepository.upsert(evaluationNo, state);
  }

  async uploadPartnerFile(
    evaluationNo: string,
    params: {
      partnerId?: string | null;
      flowType: PartnerFileFlowType;
      name: string;
      contentType?: string | null;
      size: number;
      data: Buffer;
    }
  ): Promise<PartnerFileMetadata> {
    return await this.partnerFileRepository.create({
      evaluationNo,
      partnerId: params.partnerId,
      flowType: params.flowType,
      name: params.name,
      contentType: params.contentType,
      size: params.size,
      data: params.data,
    });
  }

  async getPartnerFile(evaluationNo: string, fileId: string): Promise<PartnerFileRecord | null> {
    return await this.partnerFileRepository.findById(evaluationNo, fileId);
  }

  async deletePartnerFile(evaluationNo: string, fileId: string): Promise<boolean> {
    return await this.partnerFileRepository.delete(evaluationNo, fileId);
  }

  async getCompanyOptions(search?: string) {
    return await this.repository.getCompanyOptions(search);
  }

  async getPartnerCandidates(evaluationNo: string): Promise<EvaluationPartnerCandidate[]> {
    return await this.partnerCandidateRepository.findByEvaluation(evaluationNo);
  }

  async createPartnerCandidate(
    evaluationNo: string,
    params: CreatePartnerCandidateParams
  ): Promise<EvaluationPartnerCandidate> {
    return await this.partnerCandidateRepository.create(evaluationNo, params);
  }

  async updatePartnerCandidate(
    evaluationNo: string,
    candidateId: string,
    params: UpdatePartnerCandidateParams
  ): Promise<EvaluationPartnerCandidate | null> {
    return await this.partnerCandidateRepository.update(evaluationNo, candidateId, params);
  }

  async deletePartnerCandidate(evaluationNo: string, candidateId: string): Promise<boolean> {
    return await this.partnerCandidateRepository.delete(evaluationNo, candidateId);
  }
}
