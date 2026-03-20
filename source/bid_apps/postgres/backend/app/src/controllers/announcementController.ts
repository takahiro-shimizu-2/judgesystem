import { Request, Response } from "express";
import { AnnouncementService } from "../services";
import { FilterParams } from "../types";

export class AnnouncementController {
  private service: AnnouncementService;

  constructor() {
    this.service = new AnnouncementService();
  }

  /**
   * GET /api/announcements - Get announcements list with filters
   */
  getList = async (req: Request, res: Response): Promise<void> => {
    console.log(`GET /api/announcements hit`);
    console.log(`Query params:`, req.query);

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

      const filters: FilterParams = {
        page,
        pageSize,
        statuses: req.query.statuses ? (req.query.statuses as string).split(",") : undefined,
        bidTypes: req.query.bidTypes ? (req.query.bidTypes as string).split(",") : undefined,
        categories: req.query.categories ? (req.query.categories as string).split(",") : undefined,
        organizations: req.query.organizations ? (req.query.organizations as string).split(",") : undefined,
        prefectures: req.query.prefectures ? (req.query.prefectures as string).split(",") : undefined,
        searchQuery: req.query.searchQuery as string | undefined,
        sortField: req.query.sortField as string | undefined,
        sortOrder: (req.query.sortOrder as "asc" | "desc") || undefined,
        ordererId: req.query.ordererId as string | undefined,
      };

      const result = await this.service.getList(filters);

      console.log(`Response: ${result.data.length} rows, total: ${result.total}, page: ${result.page}`);

      res.setHeader("Content-Type", "application/json");
      res.setHeader("Cache-Control", "no-cache");
      res.status(200).json(result);
    } catch (error) {
      console.error(`ERROR in GET /api/announcements:`, error);
      if (!res.headersSent) {
        res.status(500).json({
          error: "Internal Server Error",
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
  };

  /**
   * GET /api/announcements/:announcementNo - Get single announcement by announcement_no
   */
  getByNo = async (req: Request, res: Response): Promise<void> => {
    console.log(`GET /api/announcements/${req.params.announcementNo} hit`);

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
      console.error(`ERROR in GET /api/announcements/${announcementNo}:`, error);
      if (!res.headersSent) {
        res.status(500).json({
          error: "Internal Server Error",
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
  };

  /**
   * GET /api/announcements/:announcementNo/progressing-companies
   */
  getProgressingCompanies = async (req: Request, res: Response): Promise<void> => {
    console.log(`GET /api/announcements/${req.params.announcementNo}/progressing-companies hit`);

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
      console.error(`ERROR in GET /api/announcements/${announcementNo}/progressing-companies:`, error);
      if (!res.headersSent) {
        res.status(500).json({
          error: "Internal Server Error",
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
  };
}
