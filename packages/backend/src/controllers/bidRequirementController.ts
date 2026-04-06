import { Request, Response } from "express";
import { BidRequirementService } from "../services/bidRequirementService";
import { logger } from "../utils/logger";
import { z } from "zod";
import { DEFAULT_PAGE_SIZE } from "../constants";

const searchSchema = z.object({
  q: z.string().min(1).max(200),
  page: z.coerce.number().int().min(0).default(0),
  pageSize: z.coerce.number().int().min(1).max(100).default(DEFAULT_PAGE_SIZE),
});

export class BidRequirementController {
  private service: BidRequirementService;

  constructor() {
    this.service = new BidRequirementService();
  }

  /**
   * GET /api/bid-requirements/search?q=ISO9001&page=0&pageSize=25
   */
  search = async (req: Request, res: Response): Promise<void> => {
    logger.info({ query: req.query }, "GET /api/bid-requirements/search");

    const parsed = searchSchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({
        error: "Invalid query parameters",
        details: parsed.error.flatten().fieldErrors,
      });
      return;
    }

    try {
      const { q, page, pageSize } = parsed.data;
      const result = await this.service.search(q, page, pageSize);
      res.json(result);
    } catch (err) {
      logger.error({ err }, "bid-requirements search failed");
      res.status(500).json({ error: "Internal server error" });
    }
  };
}
