import { BidRequirementRepository } from "../repositories/bidRequirementRepository";
import { DEFAULT_PAGE_SIZE } from "../constants";
import type { PaginatedResponse } from "../types";
import type { BidRequirementSearchResult } from "../repositories/bidRequirementRepository";

export class BidRequirementService {
  private repository: BidRequirementRepository;

  constructor() {
    this.repository = new BidRequirementRepository();
  }

  async search(
    query: string,
    page: number = 0,
    pageSize: number = DEFAULT_PAGE_SIZE,
  ): Promise<PaginatedResponse<BidRequirementSearchResult>> {
    const { data, total } = await this.repository.searchByText(query, page, pageSize);
    return { data, total, page, pageSize };
  }
}
