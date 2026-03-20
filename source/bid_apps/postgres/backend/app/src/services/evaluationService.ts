import { EvaluationRepository } from "../repositories";
import { FilterParams, PaginatedResponse } from "../types";

export class EvaluationService {
  private repository: EvaluationRepository;

  constructor() {
    this.repository = new EvaluationRepository();
  }

  /**
   * Get paginated list of evaluations with filters
   */
  async getList(filters: FilterParams): Promise<PaginatedResponse<any>> {
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
  async getById(id: string): Promise<any | null> {
    return await this.repository.findById(id);
  }

  /**
   * Update work status of an evaluation
   */
  async updateWorkStatus(
    evaluationNo: string,
    workStatus: string,
    currentStep?: string
  ): Promise<any | null> {
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
  async getStats(): Promise<any> {
    return await this.repository.getStats();
  }

  /**
   * Get aggregated counts by evaluation status
   */
  async getStatusCounts(filters: FilterParams): Promise<{ all_met: number; other_only_unmet: number; unmet: number }> {
    return await this.repository.getStatusCounts(filters);
  }
}
