import { Request, Response } from "express";
import { AnnouncementService } from "../services";
import { FilterParams, SortOption } from "../types";
import { logger } from "../utils/logger";

export class AnnouncementController {
  private service: AnnouncementService;

  constructor() {
    this.service = new AnnouncementService();
  }

  /**
   * GET /api/announcements - Get announcements list with filters
   */
  getList = async (req: Request, res: Response): Promise<void> => {
    logger.info("GET /api/announcements");
    logger.info({ query: req.query }, "Query params");

    try {
      // Parse and validate pagination parameters
      const pageNum = req.query.page ? parseInt(req.query.page as string, 10) : 0;
      const pageSizeNum = req.query.pageSize ? parseInt(req.query.pageSize as string, 10) : 25;

      // Validation
      if (isNaN(pageNum) || pageNum < 0) {
        res.status(400).json({ error: "Bad Request", message: "page must be a non-negative integer" });
        return;
      }
      if (isNaN(pageSizeNum) || pageSizeNum < 1 || pageSizeNum > 1000) {
        res.status(400).json({ error: "Bad Request", message: "pageSize must be an integer between 1 and 1000" });
        return;
      }

      const page = pageNum;
      const pageSize = pageSizeNum;

      const sortFields = this.toStringArray(req.query.sortField);
      const sortOrders = this.toSortOrderArray(req.query.sortOrder);
      const sortOptions: SortOption[] = sortFields.map((field, index) => {
        const order: "asc" | "desc" = sortOrders[index] ?? "asc";
        return { field, order };
      });

      const filters: FilterParams = {
        page,
        pageSize,
        statuses: req.query.statuses ? (req.query.statuses as string).split(",") : undefined,
        bidTypes: req.query.bidTypes ? (req.query.bidTypes as string).split(",") : undefined,
        categories: req.query.categories ? (req.query.categories as string).split(",") : undefined,
        organizations: req.query.organizations ? (req.query.organizations as string).split(",") : undefined,
        prefectures: req.query.prefectures ? (req.query.prefectures as string).split(",") : undefined,
        searchQuery: req.query.searchQuery as string | undefined,
        sortField: sortOptions[0]?.field || this.getFirstString(req.query.sortField),
        sortOrder: sortOptions[0]?.order || this.parseSortOrder(req.query.sortOrder),
        sortOptions,
        ordererId: req.query.ordererId as string | undefined,
      };

      const result = await this.service.getList(filters);

      logger.info(`Response: ${result.data.length} rows, total: ${result.total}, page: ${result.page}`);

      res.setHeader("Content-Type", "application/json");
      res.setHeader("Cache-Control", "no-cache");
      res.status(200).json(result);
    } catch (error) {
      logger.error({ err: error }, "ERROR in GET /api/announcements");
      if (!res.headersSent) {
        res.status(500).json({
          error: "Internal Server Error",
          message: process.env.NODE_ENV === "production"
            ? "An unexpected error occurred"
            : error instanceof Error ? error.message : String(error),
        });
      }
    }
  };

  /**
   * GET /api/announcements/:announcementNo - Get single announcement by announcement_no
   */
  getByNo = async (req: Request, res: Response): Promise<void> => {
    logger.info(`GET /api/announcements/${req.params.announcementNo}`);

    const { announcementNo } = req.params;
    const announcementNoInt = parseInt(announcementNo, 10);

    if (isNaN(announcementNoInt)) {
      res.status(400).json({ error: "Invalid announcement number" });
      return;
    }

    try {
      const announcement = await this.service.getByNo(announcementNoInt);

      if (!announcement) {
        res.status(404).json({ error: "Announcement not found" });
        return;
      }

      res.setHeader("Content-Type", "application/json");
      res.setHeader("Cache-Control", "no-cache");
      res.status(200).json(announcement);
    } catch (error) {
      logger.error({ err: error }, `ERROR in GET /api/announcements/${announcementNo}`);
      if (!res.headersSent) {
        res.status(500).json({
          error: "Internal Server Error",
          message: process.env.NODE_ENV === "production"
            ? "An unexpected error occurred"
            : error instanceof Error ? error.message : String(error),
        });
      }
    }
  };

  /**
   * GET /api/announcements/:announcementNo/progressing-companies
   */
  getProgressingCompanies = async (req: Request, res: Response): Promise<void> => {
    logger.info(`GET /api/announcements/${req.params.announcementNo}/progressing-companies`);

    const { announcementNo } = req.params;
    const announcementNoInt = parseInt(announcementNo, 10);

    if (isNaN(announcementNoInt)) {
      res.status(400).json({ error: "Invalid announcement number" });
      return;
    }

    try {
      const rows = await this.service.getProgressingCompanies(announcementNoInt);
      res.setHeader("Content-Type", "application/json");
      res.setHeader("Cache-Control", "no-cache");
      res.status(200).json(rows);
    } catch (error) {
      logger.error({ err: error }, `ERROR in GET /api/announcements/${announcementNo}/progressing-companies`);
      if (!res.headersSent) {
        res.status(500).json({
          error: "Internal Server Error",
          message: process.env.NODE_ENV === "production"
            ? "An unexpected error occurred"
            : error instanceof Error ? error.message : String(error),
        });
      }
    }
  };

  /**
   * GET /api/announcements/:announcementNo/similar-cases
   */
  getSimilarCases = async (req: Request, res: Response): Promise<void> => {
    logger.info(`GET /api/announcements/${req.params.announcementNo}/similar-cases`);

    const { announcementNo } = req.params;
    const announcementNoInt = parseInt(announcementNo, 10);

    if (isNaN(announcementNoInt)) {
      res.status(400).json({ error: "Invalid announcement number" });
      return;
    }

    try {
      const rows = await this.service.getSimilarCases(announcementNoInt);
      res.setHeader("Content-Type", "application/json");
      res.setHeader("Cache-Control", "no-cache");
      res.status(200).json(rows);
    } catch (error) {
      logger.error({ err: error }, `ERROR in GET /api/announcements/${announcementNo}/similar-cases`);
      if (!res.headersSent) {
        res.status(500).json({
          error: "Internal Server Error",
          message: process.env.NODE_ENV === "production"
            ? "An unexpected error occurred"
            : error instanceof Error ? error.message : String(error),
        });
      }
    }
  };

  /**
   * GET /api/announcements/:announcementNo/documents/:documentId/preview
   */
  getDocumentPreview = async (req: Request, res: Response): Promise<void> => {
    const { announcementNo, documentId } = req.params;
    const announcementNoInt = parseInt(announcementNo, 10);

    if (isNaN(announcementNoInt)) {
      res.status(400).json({ error: "Invalid announcement number" });
      return;
    }
    const safeDocumentId = documentId.replace(/[\r\n\t\0\x00-\x1f\x7f-\x9f\u200B-\u200D\u202A-\u202E\u2060-\u206F]/g, "");
    if (!/^[a-zA-Z0-9_-]+$/.test(safeDocumentId) || safeDocumentId.length === 0 || safeDocumentId.length > 512) {
      res.status(400).json({ error: "Invalid document id" });
      return;
    }

    try {
      const file = await this.service.getDocumentFile(announcementNoInt, safeDocumentId);
      if (!file) {
        res.status(404).json({ error: "Document not found" });
        return;
      }

      const format = (file.fileFormat || "").toLowerCase();
      const contentTypeMap: Record<string, string> = {
        pdf: "application/pdf",
        excel: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        xls: "application/vnd.ms-excel",
        word: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        doc: "application/msword",
        png: "image/png",
        jpg: "image/jpeg",
        jpeg: "image/jpeg",
      };

      const contentType = contentTypeMap[format] || "application/octet-stream";
      const sanitizedFilename = (file.title || `document-${safeDocumentId}`)
        .normalize("NFKC")
        .replace(/[\r\n\t\0\x00-\x1f\x7f-\x9f\u200B-\u200D\u202A-\u202E\u2060-\u206F]/g, "")
        .replace(/[<>:"|?*\\/]/g, "_")
        .substring(0, 255);
      res.setHeader("Content-Type", contentType);
      res.setHeader("Cache-Control", "public, max-age=3600");
      res.setHeader("Content-Disposition", `inline; filename*=UTF-8''${encodeURIComponent(sanitizedFilename)}`);
      res.send(file.data);
    } catch (error) {
      logger.error({ err: error }, `ERROR in GET /api/announcements/${announcementNo}/documents/${documentId}/preview`);
      if (!res.headersSent) {
        res.status(500).json({
          error: "Internal Server Error",
          message: process.env.NODE_ENV === "production"
            ? "An unexpected error occurred"
            : error instanceof Error ? error.message : String(error),
        });
      }
    }
  };

  private toStringArray(param: any): string[] {
    if (!param) return [];
    if (Array.isArray(param)) {
      return param.map((value) => String(value));
    }
    return [String(param)];
  }

  private getFirstString(param: any): string | undefined {
    if (!param) return undefined;
    if (Array.isArray(param)) {
      return param.length > 0 ? String(param[0]) : undefined;
    }
    if (typeof param === "string") {
      return param;
    }
    return String(param);
  }

  private parseSortOrder(param: any): "asc" | "desc" | undefined {
    const value = this.getFirstString(param);
    if (value === "desc") {
      return "desc";
    }
    if (value === "asc") {
      return "asc";
    }
    return undefined;
  }

  private toSortOrderArray(param: any): Array<"asc" | "desc"> {
    const strings = this.toStringArray(param);
    return strings.map((value) => (value === "desc" ? "desc" : "asc"));
  }
}
