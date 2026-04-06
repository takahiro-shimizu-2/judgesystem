import { Request, Response } from "express";
import { CompanyService } from "../services/companyService";
import { CompanyFilterParams } from "../repositories/companyRepository";
import { logger } from "../utils/logger";

/**
 * Allowed sort field names for companies.
 * Must match the sortFieldMap keys in CompanyRepository.findWithFilters.
 */
const VALID_SORT_FIELDS = new Set([
  "name",
  "rating",
  "resultCount",
  "surveyCount",
  "address",
  "no",
]);

export class CompanyController {
  private service: CompanyService;

  constructor() {
    this.service = new CompanyService();
  }

  private parseCommaSeparated(value: unknown): string[] {
    if (!value) return [];
    return String(value).split(",").filter(Boolean);
  }

  /**
   * GET /api/companies - Get companies with pagination, search, and filters
   */
  getList = async (req: Request, res: Response): Promise<void> => {
    logger.info("GET /api/companies");

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

      const sortFieldParam = (req.query.sort as string) || undefined;
      if (sortFieldParam && !VALID_SORT_FIELDS.has(sortFieldParam)) {
        res.status(400).json({
          error: "Bad Request",
          message: `Invalid sort field: ${sortFieldParam}`,
        });
        return;
      }

      const ratingsRaw = this.parseCommaSeparated(req.query.ratings);
      const ratings = ratingsRaw.map(Number).filter((n) => !isNaN(n));

      const filters: CompanyFilterParams = {
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
        sortField: sortFieldParam,
        sortOrder:
          req.query.order === "asc" || req.query.order === "desc"
            ? (req.query.order as "asc" | "desc")
            : undefined,
      };

      const result = await this.service.getList(filters);

      logger.info(
        `Response: ${result.data.length}/${result.total} companies (page ${result.page})`
      );

      res.setHeader("Content-Type", "application/json");
      res.setHeader("Cache-Control", "no-cache");
      res.status(200).json(result);
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

  /**
   * GET /api/companies/:id - Get single company by ID
   */
  getById = async (req: Request, res: Response): Promise<void> => {
    logger.info(`GET /api/companies/${req.params.id}`);

    const { id } = req.params;

    try {
      const company = await this.service.getById(id);

      if (!company) {
        res.status(404).json({ error: "Company not found" });
        return;
      }

      res.setHeader("Content-Type", "application/json");
      res.setHeader("Cache-Control", "no-cache");
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

  /**
   * POST /api/companies - Create a new company
   */
  create = async (req: Request, res: Response): Promise<void> => {
    logger.info("POST /api/companies");

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
      const company = await this.service.create({
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

  /**
   * PATCH /api/companies/:id - Update a company
   */
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

  /**
   * DELETE /api/companies/:id - Soft delete a company
   */
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
