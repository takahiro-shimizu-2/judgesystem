import { Request, Response } from "express";
import { OrdererService } from "../services/ordererService";

export class OrdererController {
  private service: OrdererService;

  constructor() {
    this.service = new OrdererService();
  }

  getList = async (_req: Request, res: Response): Promise<void> => {
    console.log("GET /api/orderers hit");

    try {
      const orderers = await this.service.getList();
      res.setHeader("Content-Type", "application/json");
      res.setHeader("Cache-Control", "no-cache");
      res.status(200).json(orderers);
    } catch (error) {
      console.error("ERROR in GET /api/orderers:", error);
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
    console.log(`GET /api/orderers/${id} hit`);

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
      console.error(`ERROR in GET /api/orderers/${id}:`, error);
      if (!res.headersSent) {
        res.status(500).json({
          error: "Internal Server Error",
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
  };
}
