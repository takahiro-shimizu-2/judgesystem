import { Request, Response } from "express";
import { OrdererService } from "../services/ordererService";
import { logger } from "../utils/logger";

export class OrdererController {
  private service: OrdererService;

  constructor() {
    this.service = new OrdererService();
  }

  getList = async (_req: Request, res: Response): Promise<void> => {
    logger.info("GET /api/orderers");

    try {
      const orderers = await this.service.getList();
      res.setHeader("Content-Type", "application/json");
      res.setHeader("Cache-Control", "no-cache");
      res.status(200).json(orderers);
    } catch (error) {
      logger.error({ err: error }, "ERROR in GET /api/orderers");
      if (!res.headersSent) {
        res.status(500).json({
          error: "Internal Server Error",
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
  };

  getById = async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;
    logger.info("GET /api/orderers/${id}");

    try {
      const orderer = await this.service.getById(id);
      if (!orderer) {
        res.status(404).json({ error: "Orderer not found" });
        return;
      }

      res.setHeader("Content-Type", "application/json");
      res.setHeader("Cache-Control", "no-cache");
      res.status(200).json(orderer);
    } catch (error) {
      logger.error({ err: error }, "ERROR in GET /api/orderers/${id}");
      if (!res.headersSent) {
        res.status(500).json({
          error: "Internal Server Error",
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
  };
}
