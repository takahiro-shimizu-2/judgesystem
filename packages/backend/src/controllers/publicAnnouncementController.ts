import { Request, Response } from "express";
import { PublicAnnouncementService } from "../services/publicAnnouncementService";
import { logger } from "../utils/logger";
import { z } from "zod";
import { DEFAULT_PAGE_SIZE } from "../constants";

const listSchema = z.object({
  page: z.coerce.number().int().min(0).default(0),
  pageSize: z.coerce.number().int().min(1).max(100).default(DEFAULT_PAGE_SIZE),
  searchQuery: z.string().optional().default(""),
  bidTypes: z.union([z.string().transform(s => s.split(",")), z.array(z.string())]).optional(),
  categories: z.union([z.string().transform(s => s.split(",")), z.array(z.string())]).optional(),
  organizations: z.union([z.string().transform(s => s.split(",")), z.array(z.string())]).optional(),
});

/**
 * 公開API用コントローラー。
 * 認証不要のエンドポイントで、入札案件一覧のみを提供する。
 */
export class PublicAnnouncementController {
  private service: PublicAnnouncementService;

  constructor() {
    this.service = new PublicAnnouncementService();
  }

  /**
   * GET /public/api/announcements
   * 認証不要 — 入札案件一覧のみ返却
   */
  getList = async (req: Request, res: Response): Promise<void> => {
    logger.info({ query: req.query }, "GET /public/api/announcements");

    const parsed = listSchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({
        error: "Invalid query parameters",
        details: parsed.error.flatten().fieldErrors,
      });
      return;
    }

    try {
      const result = await this.service.getList(parsed.data);

      // CDN キャッシュ: 5分間キャッシュ、stale-while-revalidate で30分まで古いものを返す
      res.set("Cache-Control", "public, max-age=300, stale-while-revalidate=1800");
      res.json(result);
    } catch (err) {
      logger.error({ err }, "Public announcements list failed");
      // エラーメッセージから内部情報を漏洩させない
      res.status(500).json({ error: "Internal server error" });
    }
  };
}
