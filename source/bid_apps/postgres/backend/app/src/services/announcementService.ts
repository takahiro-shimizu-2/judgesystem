import { AnnouncementRepository } from "../repositories";
import { FilterParams } from "../types";

export class AnnouncementService {
  private repository: AnnouncementRepository;

  constructor() {
    this.repository = new AnnouncementRepository();
  }

  /**
   * Get paginated announcements list with filters
   */
  async getList(filters: FilterParams) {
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
   * Get single announcement by announcement_no
   */
  async getByNo(announcementNo: number) {
    return await this.repository.findByNo(announcementNo);
  }

  /**
   * Get progressing companies for an announcement
   */
  async getProgressingCompanies(announcementNo: number) {
    return await this.repository.findProgressingCompanies(announcementNo);
  }

  /**
   * Get binary of a document attached to an announcement
   */
  async getDocumentFile(announcementNo: number, documentId: string) {
    return await this.repository.getDocumentFile(announcementNo, documentId);
  }
}
