import { Request, Response } from "express";
import { EvaluationService } from "../services";
import { FilterParams } from "../types";

export class EvaluationController {
  private service: EvaluationService;

  constructor() {
    this.service = new EvaluationService();
  }

  /**
   * GET /api/evaluations - Get paginated evaluations list with filters
   */
  getList = async (req: Request, res: Response): Promise<void> => {
    console.log(`GET /api/evaluations hit`);

    try {
      // Parse query parameters
      const filters: FilterParams = {
        page: parseInt(req.query.page as string) || 0,
        pageSize: parseInt(req.query.pageSize as string) || 25,
        statuses: this.parseArrayParam(req.query.statuses),
        workStatuses: this.parseArrayParam(req.query.workStatuses),
        priorities: this.parseArrayParam(req.query.priorities),
        categories: this.parseArrayParam(req.query.categories),
        bidTypes: this.parseArrayParam(req.query.bidTypes),
        organizations: this.parseArrayParam(req.query.organizations),
        prefectures: this.parseArrayParam(req.query.prefectures),
        searchQuery: (req.query.searchQuery as string) || "",
        sortField: (req.query.sortField as string) || "",
        sortOrder: (req.query.sortOrder as "asc" | "desc") || "asc",
      };

      const result = await this.service.getList(filters);

      console.log(`Response: ${result.data.length} rows, total: ${result.total}, page: ${result.page}`);

      res.setHeader("Content-Type", "application/json");
      res.setHeader("Cache-Control", "no-cache");
      res.status(200).json(result);
    } catch (error) {
      console.error(`ERROR in GET /api/evaluations:`, error);
      if (!res.headersSent) {
        res.status(500).json({
          error: "Internal Server Error",
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
  };

  /**
   * GET /api/evaluations/:id - Get single evaluation by ID
   */
  getById = async (req: Request, res: Response): Promise<void> => {
    console.log(`GET /api/evaluations/${req.params.id} hit`);

    const { id } = req.params;

    try {
      const evaluation = await this.service.getById(id);

      if (!evaluation) {
        res.status(404).json({ error: "Evaluation not found" });
        return;
      }

      res.setHeader("Content-Type", "application/json");
      res.setHeader("Cache-Control", "no-cache");
      res.status(200).json(evaluation);
    } catch (error) {
      console.error(`ERROR in GET /api/evaluations/${id}:`, error);
      if (!res.headersSent) {
        res.status(500).json({
          error: "Internal Server Error",
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
  };

  /**
   * PATCH /api/evaluations/:evaluationNo - Update workStatus
   */
  updateWorkStatus = async (req: Request, res: Response): Promise<void> => {
    console.log(`PATCH /api/evaluations/${req.params.evaluationNo} hit`);

    const { evaluationNo } = req.params;
    const { workStatus } = req.body;

    try {
      const result = await this.service.updateWorkStatus(evaluationNo, workStatus);

      if (!result) {
        res.status(404).json({ error: "Evaluation not found" });
        return;
      }

      res.setHeader("Content-Type", "application/json");
      res.status(200).json(result);
    } catch (error) {
      console.error(`ERROR in PATCH /api/evaluations/${evaluationNo}:`, error);

      if (error instanceof Error && error.message.includes("Invalid workStatus")) {
        res.status(400).json({
          error: "Invalid workStatus",
          message: error.message,
        });
        return;
      }

      if (!res.headersSent) {
        res.status(500).json({
          error: "Internal Server Error",
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
  };

  /**
   * Helper: Parse array parameter from query string
   */
  private parseArrayParam(param: any): string[] {
    if (!param) return [];
    return Array.isArray(param) ? param : [param];
  }
}
