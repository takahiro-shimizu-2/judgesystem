import { Request, Response } from "express";
import { CompanyService } from "../services/companyService";
import { logger } from "../utils/logger";

export class CompanyController {
  private service: CompanyService;

  constructor() {
    this.service = new CompanyService();
  }

  getList = async (_req: Request, res: Response): Promise<void> => {
    logger.info("GET /api/companies");
    try {
      const companies = await this.service.getList();
      res.setHeader("Content-Type", "application/json");
      res.setHeader("Cache-Control", "no-cache");
      res.status(200).json(companies);
    } catch (error) {
      logger.error({ err: error }, "ERROR in GET /api/companies");
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

  getById = async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;
    logger.info(`GET /api/companies/${id}`);
    try {
      const company = await this.service.getById(id);
      if (!company) {
        res.status(404).json({ error: "Company not found" });
        return;
      }
      res.setHeader("Content-Type", "application/json");
      res.status(200).json(company);
    } catch (error) {
      logger.error({ err: error }, `ERROR in GET /api/companies/${id}`);
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

  create = async (req: Request, res: Response): Promise<void> => {
    logger.info("POST /api/companies");
    const { name } = req.body ?? {};
    if (!name) {
      res.status(400).json({
        error: "Bad Request",
        message: "name is required",
      });
      return;
    }
    try {
      const company = await this.service.create(req.body);
      res.setHeader("Content-Type", "application/json");
      res.status(201).json(company);
    } catch (error) {
      logger.error({ err: error }, "ERROR in POST /api/companies");
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

  update = async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;
    logger.info(`PATCH /api/companies/${id}`);
    try {
      const company = await this.service.update(id, req.body ?? {});
      if (!company) {
        res.status(404).json({ error: "Company not found" });
        return;
      }
      res.setHeader("Content-Type", "application/json");
      res.status(200).json(company);
    } catch (error) {
      logger.error({ err: error }, `ERROR in PATCH /api/companies/${id}`);
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

  delete = async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;
    logger.info(`DELETE /api/companies/${id}`);
    try {
      const deleted = await this.service.delete(id);
      if (!deleted) {
        res.status(404).json({ error: "Company not found" });
        return;
      }
      res.status(204).send();
    } catch (error) {
      logger.error({ err: error }, `ERROR in DELETE /api/companies/${id}`);
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
}
