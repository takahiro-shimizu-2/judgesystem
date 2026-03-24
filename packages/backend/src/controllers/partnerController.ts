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
    logger.info(`GET /api/partners/${req.params.id}`);

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
      logger.error({ err: error }, `ERROR in GET /api/partners/${id}`);
      if (!res.headersSent) {
        res.status(500).json({
          error: "Internal Server Error",
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
  };

  /**
   * POST /api/partners - Create a new partner
   */
  create = async (req: Request, res: Response): Promise<void> => {
    logger.info("POST /api/partners");

    const {
      name, postalCode, address, phone, fax, email, url,
      representative, established, capital, employeeCount,
      categories, branches,
    } = req.body ?? {};

    if (!name) {
      res.status(400).json({
        error: "Bad Request",
        message: "name is required",
      });
      return;
    }

    try {
      const partner = await this.service.create({
        name,
        postalCode: postalCode ?? "",
        address: address ?? "",
        phone: phone ?? "",
        fax: fax ?? "",
        email: email ?? "",
        url: url ?? "",
        representative: representative ?? "",
        established: established ?? "",
        capital: capital ?? "",
        employeeCount: employeeCount ?? "",
        categories: categories ?? [],
        branches: branches ?? [],
      });

      res.setHeader("Content-Type", "application/json");
      res.status(201).json(partner);
    } catch (error) {
      logger.error({ err: error }, "ERROR in POST /api/partners");
      if (!res.headersSent) {
        res.status(500).json({
          error: "Internal Server Error",
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
  };

  /**
   * PATCH /api/partners/:id - Update a partner
   */
  update = async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;
    logger.info(`PATCH /api/partners/${id}`);

    try {
      const partner = await this.service.update(id, req.body ?? {});

      if (!partner) {
        res.status(404).json({ error: "Partner not found" });
        return;
      }

      res.setHeader("Content-Type", "application/json");
      res.status(200).json(partner);
    } catch (error) {
      logger.error({ err: error }, `ERROR in PATCH /api/partners/${id}`);
      if (!res.headersSent) {
        res.status(500).json({
          error: "Internal Server Error",
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
  };

  /**
   * DELETE /api/partners/:id - Soft delete a partner
   */
  delete = async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;
    logger.info(`DELETE /api/partners/${id}`);

    try {
      const deleted = await this.service.delete(id);

      if (!deleted) {
        res.status(404).json({ error: "Partner not found" });
        return;
      }

      res.status(204).send();
    } catch (error) {
      logger.error({ err: error }, `ERROR in DELETE /api/partners/${id}`);
      if (!res.headersSent) {
        res.status(500).json({
          error: "Internal Server Error",
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
  };
}
