import {
  EvaluationRepository,
  EvaluationAssignmentRepository,
  EvaluationOrdererWorkflowRepository,
} from "../repositories";
import { FilterParams, PaginatedResponse } from "../types";
import type {
  EvaluationListItem,
  EvaluationDetail,
  EvaluationWorkStatusResult,
  EvaluationStats,
} from "../types/evaluation";
import type { OrdererWorkflowState } from "../repositories/evaluationOrdererWorkflowRepository";

export class EvaluationService {
  private repository: EvaluationRepository;
  private assignmentRepository: EvaluationAssignmentRepository;
  private ordererWorkflowRepository: EvaluationOrdererWorkflowRepository;

  constructor() {
    this.repository = new EvaluationRepository();
    this.assignmentRepository = new EvaluationAssignmentRepository();
    this.ordererWorkflowRepository = new EvaluationOrdererWorkflowRepository();
  }

  /**
   * Get paginated list of evaluations with filters
   */
  async getList(filters: FilterParams): Promise<PaginatedResponse<EvaluationListItem>> {
    const { data, total } = await this.repository.findWithFilters(filters);

    const page = filters.page || 0;
    const pageSize = filters.pageSize || 25;

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
}
