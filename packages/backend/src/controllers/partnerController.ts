import { Request, Response } from "express";
import { PartnerService } from "../services/partnerService";
import { PartnerFilterParams } from "../repositories/partnerRepository";
import { logger } from "../utils/logger";

export class PartnerController {
  private service: PartnerService;

  constructor() {
    this.service = new PartnerService();
  }

  private parseCommaSeparated(value: unknown): string[] {
    if (!value) return [];
    return String(value).split(",").filter(Boolean);
  }

  /**
   * GET /api/partners - Get partners with pagination, search, and filters
   */
  getList = async (req: Request, res: Response): Promise<void> => {
    logger.info("GET /api/partners");

    try {
      const pageNum = req.query.page
        ? parseInt(req.query.page as string, 10)
        : 0;
      const pageSizeNum = req.query.pageSize
        ? parseInt(req.query.pageSize as string, 10)
        : 25;

      if (isNaN(pageNum) || pageNum < 0) {
        res.status(400).json({
          error: "Bad Request",
          message: "page must be a non-negative integer",
        });
        return;
      }
      if (isNaN(pageSizeNum) || pageSizeNum < 1 || pageSizeNum > 1000) {
        res.status(400).json({
          error: "Bad Request",
          message: "pageSize must be an integer between 1 and 1000",
        });
        return;
      }

      const ratingsRaw = this.parseCommaSeparated(req.query.ratings);
      const ratings = ratingsRaw.map(Number).filter((n) => !isNaN(n));

      const filters: PartnerFilterParams = {
        page: pageNum,
        pageSize: pageSizeNum,
        searchQuery: (req.query.q as string) || undefined,
        prefectures: this.parseCommaSeparated(req.query.prefecture),
        categories: this.parseCommaSeparated(req.query.category),
        ratings: ratings.length > 0 ? ratings : undefined,
        hasSurvey:
          req.query.hasSurvey === "yes" || req.query.hasSurvey === "no"
            ? (req.query.hasSurvey as "yes" | "no")
            : undefined,
        hasPrimeQualification:
          req.query.hasPrimeQualification === "yes" ||
          req.query.hasPrimeQualification === "no"
            ? (req.query.hasPrimeQualification as "yes" | "no")
            : undefined,
        sortField: (req.query.sort as string) || undefined,
        sortOrder:
          req.query.order === "asc" || req.query.order === "desc"
            ? (req.query.order as "asc" | "desc")
            : undefined,
      };

      const result = await this.service.getList(filters);

      logger.info(
        `Response: ${result.data.length}/${result.total} partners (page ${result.page})`
      );

      res.setHeader("Content-Type", "application/json");
      res.setHeader("Cache-Control", "no-cache");
      res.status(200).json(result);
    } catch (error) {
      logger.error({ err: error }, "ERROR in GET /api/partners");
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
          message: process.env.NODE_ENV === "production"
            ? "An unexpected error occurred"
            : error instanceof Error ? error.message : String(error),
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
          message: process.env.NODE_ENV === "production"
            ? "An unexpected error occurred"
            : error instanceof Error ? error.message : String(error),
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
          message: process.env.NODE_ENV === "production"
            ? "An unexpected error occurred"
            : error instanceof Error ? error.message : String(error),
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
          message: process.env.NODE_ENV === "production"
            ? "An unexpected error occurred"
            : error instanceof Error ? error.message : String(error),
        });
      }
    }
  };
}
