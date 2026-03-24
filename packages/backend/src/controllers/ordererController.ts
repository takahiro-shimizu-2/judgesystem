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
    logger.info(`GET /api/orderers/${id}`);

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
      logger.error({ err: error }, `ERROR in GET /api/orderers/${id}`);
      if (!res.headersSent) {
        res.status(500).json({
          error: "Internal Server Error",
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
  };

  create = async (req: Request, res: Response): Promise<void> => {
    logger.info("POST /api/orderers");
    const { name, category, address, phone, fax, email } = req.body ?? {};

    if (!name || !category) {
      res.status(400).json({
        error: "Bad Request",
        message: "name and category are required",
      });
      return;
    }

    try {
      const orderer = await this.service.create({ name, category, address, phone, fax, email });
      res.setHeader("Content-Type", "application/json");
      res.status(201).json(orderer);
    } catch (error) {
      logger.error({ err: error }, "ERROR in POST /api/orderers");
      if (!res.headersSent) {
        res.status(500).json({
          error: "Internal Server Error",
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
  };

  update = async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;
    logger.info(`PATCH /api/orderers/${id}`);

    try {
      const orderer = await this.service.update(id, req.body ?? {});
      if (!orderer) {
        res.status(404).json({ error: "Orderer not found" });
        return;
      }

      res.setHeader("Content-Type", "application/json");
      res.status(200).json(orderer);
    } catch (error) {
      logger.error({ err: error }, `ERROR in PATCH /api/orderers/${id}`);
      if (!res.headersSent) {
        res.status(500).json({
          error: "Internal Server Error",
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
  };

  delete = async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;
    logger.info(`DELETE /api/orderers/${id}`);

    try {
      const deleted = await this.service.delete(id);
      if (!deleted) {
        res.status(404).json({ error: "Orderer not found" });
        return;
      }

      res.status(204).send();
    } catch (error) {
      logger.error({ err: error }, `ERROR in DELETE /api/orderers/${id}`);
      if (!res.headersSent) {
        res.status(500).json({
          error: "Internal Server Error",
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
  };
}
