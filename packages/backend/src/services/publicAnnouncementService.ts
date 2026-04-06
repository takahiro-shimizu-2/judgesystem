import { PublicAnnouncementRepository } from "../repositories/publicAnnouncementRepository";
import { DEFAULT_PAGE_SIZE } from "../constants";
import type { AnnouncementFilterParams, PaginatedResponse } from "../types";
import type { PublicAnnouncementListItem } from "../repositories/publicAnnouncementRepository";

export class PublicAnnouncementService {
  private repository: PublicAnnouncementRepository;

  constructor() {
    this.repository = new PublicAnnouncementRepository();
  }

  async getList(
    filters: AnnouncementFilterParams,
  ): Promise<PaginatedResponse<PublicAnnouncementListItem>> {
    const { data, total } = await this.repository.findWithFilters(filters);
    return {
      data,
      total,
      page: filters.page || 0,
      pageSize: filters.pageSize || DEFAULT_PAGE_SIZE,
    };
  }
}
