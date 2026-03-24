import { Request, Response } from "express";
import { PartnerService } from "../services/partnerService";
import { logger } from "../utils/logger";

export class PartnerController {
  private service: PartnerService;

  constructor() {
    this.service = new PartnerService();
  }

  /**
   * GET /api/partners - Get all partners
   */
  getList = async (req: Request, res: Response): Promise<void> => {
    logger.info("GET /api/partners");

    try {
      const partners = await this.service.getList();

      logger.info(`Response: ${partners.length} partners`);

      res.setHeader("Content-Type", "application/json");
      res.setHeader("Cache-Control", "no-cache");
      res.status(200).json(partners);
    } catch (error) {
      logger.error({ err: error }, "ERROR in GET /api/partners");
      if (!res.headersSent) {
        res.status(500).json({
          error: "Internal Server Error",
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
  };

  /**
   * GET /api/partners/:id - Get single partner by ID
   */
  getById = async (req: Request, res: Response): Promise<void> => {
    logger.info("GET /api/partners/${req.params.id}");

    const { id } = req.params;

    try {
      const partner = await this.service.getById(id);

      if (!partner) {
        res.status(404).json({ error: "Partner not found" });
        return;
      }

      res.setHeader("Content-Type", "application/json");
      res.setHeader("Cache-Control", "no-cache");
      res.status(200).json(partner);
    } catch (error) {
      logger.error({ err: error }, "ERROR in GET /api/partners/${id}");
      if (!res.headersSent) {
        res.status(500).json({
          error: "Internal Server Error",
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
  };
}
