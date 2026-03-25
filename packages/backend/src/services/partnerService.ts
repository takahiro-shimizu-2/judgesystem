import { PartnerRepository, PartnerInput, PartnerFilterParams } from "../repositories/partnerRepository";
import { PaginatedResponse } from "../types";
import type { PartnerListSummary, PartnerDetail } from "../types/partner";

export class PartnerService {
  private repository: PartnerRepository;

  constructor() {
    this.repository = new PartnerRepository();
  }

  /**
   * Get partners with server-side filtering, sorting and pagination
   */
  async getList(filters: PartnerFilterParams): Promise<PaginatedResponse<PartnerListSummary>> {
    const { data, total } = await this.repository.findWithFilters(filters);
    const page = filters.page || 0;
    const pageSize = filters.pageSize || 25;
    return { data, total, page, pageSize };
  }

  /**
   * Get single partner by ID
   */
  async getById(id: string): Promise<PartnerDetail | null> {
    return await this.repository.findById(id);
  }

  /**
   * Create a new partner
   */
  async create(input: PartnerInput): Promise<PartnerDetail> {
    return await this.repository.create(input);
  }

  /**
   * Update an existing partner
   */
  async update(id: string, input: Partial<PartnerInput>): Promise<PartnerDetail | null> {
    return await this.repository.update(id, input);
  }

  /**
   * Soft delete a partner
   */
  async delete(id: string) {
    return await this.repository.delete(id);
  }
}
