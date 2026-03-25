import { AnnouncementRepository } from "../repositories";
import { AnnouncementFilterParams, PaginatedResponse } from "../types";
import type {
  AnnouncementListItem,
  AnnouncementDetail,
  ProgressingCompany,
  SimilarCase,
  DocumentFile,
} from "../types/announcement";

export class AnnouncementService {
  private repository: AnnouncementRepository;

  constructor() {
    this.repository = new AnnouncementRepository();
  }

  /**
   * Get paginated announcements list with filters
   */
  async getList(filters: AnnouncementFilterParams): Promise<PaginatedResponse<AnnouncementListItem>> {
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
  async getByNo(announcementNo: number): Promise<AnnouncementDetail | null> {
    return await this.repository.findByNo(announcementNo);
  }

  /**
   * Get progressing companies for an announcement
   */
  async getProgressingCompanies(announcementNo: number): Promise<ProgressingCompany[]> {
    return await this.repository.findProgressingCompanies(announcementNo);
  }

  /**
   * Get binary of a document attached to an announcement
   */
  async getDocumentFile(announcementNo: number, documentId: string): Promise<DocumentFile | null> {
    return await this.repository.getDocumentFile(announcementNo, documentId);
  }

  /**
   * Get similar cases linked to an announcement
   */
  async getSimilarCases(announcementNo: number): Promise<SimilarCase[]> {
    return await this.repository.findSimilarCases(announcementNo);
  }
}
