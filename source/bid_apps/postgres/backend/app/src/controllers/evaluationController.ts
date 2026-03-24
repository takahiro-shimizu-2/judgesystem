import { Request, Response } from "express";
import { EvaluationService } from "../services";
import { FilterParams, SortOption } from "../types";

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
      // Parse and validate pagination parameters
      const pageNum = req.query.page ? parseInt(req.query.page as string, 10) : 0;
      const pageSizeNum = req.query.pageSize ? parseInt(req.query.pageSize as string, 10) : 25;

      // Validation
      if (isNaN(pageNum) || pageNum < 0) {
        res.status(400).json({ error: "Bad Request", message: "page must be a non-negative integer" });
        return;
      }
      if (isNaN(pageSizeNum) || pageSizeNum < 1 || pageSizeNum > 1000) {
        res.status(400).json({ error: "Bad Request", message: "pageSize must be an integer between 1 and 1000" });
        return;
      }

      const page = pageNum;
      const pageSize = pageSizeNum;

      const filters = this.buildFilterParams(req, page, pageSize);

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
    const { workStatus, currentStep } = req.body;

    try {
      const result = await this.service.updateWorkStatus(evaluationNo, workStatus, currentStep);

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
   * GET /api/evaluations/stats - Get statistics for analytics dashboard
   */
  getStats = async (req: Request, res: Response): Promise<void> => {
    console.log(`GET /api/evaluations/stats hit`);

    try {
      const stats = await this.service.getStats();

      res.setHeader("Content-Type", "application/json");
      res.setHeader("Cache-Control", "no-cache");
      res.status(200).json(stats);
    } catch (error) {
      console.error(`ERROR in GET /api/evaluations/stats:`, error);
      if (!res.headersSent) {
        res.status(500).json({
          error: "Internal Server Error",
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
  };

  /**
   * GET /api/evaluations/status-counts - Aggregated status counts for current filters
   */
  getStatusCounts = async (req: Request, res: Response): Promise<void> => {
    console.log(`GET /api/evaluations/status-counts hit`);

    try {
      const filters = this.buildFilterParams(req, 0, 0);
      const counts = await this.service.getStatusCounts(filters);

      res.setHeader("Content-Type", "application/json");
      res.setHeader("Cache-Control", "no-cache");
      res.status(200).json(counts);
    } catch (error) {
      console.error(`ERROR in GET /api/evaluations/status-counts:`, error);
      if (!res.headersSent) {
        res.status(500).json({
          error: "Internal Server Error",
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
  };

  /**
   * GET /api/evaluations/:evaluationNo/assignees - Get assigned staff per step
   */
  getAssignees = async (req: Request, res: Response): Promise<void> => {
    const { evaluationNo } = req.params;
    console.log(`GET /api/evaluations/${evaluationNo}/assignees hit`);

    try {
      const assignees = await this.service.getAssignees(evaluationNo);
      res.setHeader("Content-Type", "application/json");
      res.status(200).json(assignees);
    } catch (error) {
      console.error(`ERROR in GET /api/evaluations/${evaluationNo}/assignees:`, error);
      if (!res.headersSent) {
        res.status(500).json({
          error: "Internal Server Error",
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
  };

  /**
   * PUT /api/evaluations/:evaluationNo/assignees - Upsert staff assignment for a workflow step
   */
  updateAssignee = async (req: Request, res: Response): Promise<void> => {
    const { evaluationNo } = req.params;
    const { stepId, contactId } = req.body ?? {};
    console.log(`PUT /api/evaluations/${evaluationNo}/assignees hit`);

    if (!stepId) {
      res.status(400).json({
        error: "Bad Request",
        message: "stepId is required",
      });
      return;
    }

    try {
      const result = await this.service.updateAssignee(evaluationNo, stepId, contactId || null);
      res.setHeader("Content-Type", "application/json");
      res.status(200).json(result);
    } catch (error) {
      console.error(`ERROR in PUT /api/evaluations/${evaluationNo}/assignees:`, error);
      if (!res.headersSent) {
        res.status(500).json({
          error: "Internal Server Error",
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
  };

  /**
   * GET /api/evaluations/:evaluationNo/orderer-workflow - Get saved orderer workflow state
   */
  getOrdererWorkflow = async (req: Request, res: Response): Promise<void> => {
    const { evaluationNo } = req.params;
    console.log(`GET /api/evaluations/${evaluationNo}/orderer-workflow hit`);

    try {
      const state = await this.service.getOrdererWorkflow(evaluationNo);
      res.setHeader("Content-Type", "application/json");
      res.status(200).json(state);
    } catch (error) {
      console.error(`ERROR in GET /api/evaluations/${evaluationNo}/orderer-workflow:`, error);
      if (!res.headersSent) {
        res.status(500).json({
          error: "Internal Server Error",
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
  };

  /**
   * PUT /api/evaluations/:evaluationNo/orderer-workflow - Save orderer workflow state
   */
  updateOrdererWorkflow = async (req: Request, res: Response): Promise<void> => {
    const { evaluationNo } = req.params;
    console.log(`PUT /api/evaluations/${evaluationNo}/orderer-workflow hit`);

    try {
      const state = await this.service.updateOrdererWorkflow(evaluationNo, req.body ?? {});
      res.setHeader("Content-Type", "application/json");
      res.status(200).json(state);
    } catch (error) {
      console.error(`ERROR in PUT /api/evaluations/${evaluationNo}/orderer-workflow:`, error);
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
    if (Array.isArray(param)) {
      return param.map((value) => String(value));
    }
    return [String(param)];
  }

  private parseSortOrderParam(param: any): "asc" | "desc" | undefined {
    const [value] = this.parseArrayParam(param);
    if (value === "desc") {
      return "desc";
    }
    if (value === "asc") {
      return "asc";
    }
    return undefined;
  }

  private buildFilterParams(req: Request, page: number, pageSize: number): FilterParams {
    const sortFields = this.parseArrayParam(req.query.sortField);
    const sortOrdersRaw = this.parseArrayParam(req.query.sortOrder);
    const sortOptions: SortOption[] = sortFields.map((field, index) => {
      const orderValue = sortOrdersRaw[index];
      const order: "asc" | "desc" = orderValue === "desc" ? "desc" : "asc";
      return {
        field,
        order,
      };
    });

    return {
      page,
      pageSize,
      statuses: this.parseArrayParam(req.query.statuses),
      workStatuses: this.parseArrayParam(req.query.workStatuses),
      priorities: this.parseArrayParam(req.query.priorities),
      categories: this.parseArrayParam(req.query.categories),
      bidTypes: this.parseArrayParam(req.query.bidTypes),
      organizations: this.parseArrayParam(req.query.organizations),
      prefectures: this.parseArrayParam(req.query.prefectures),
      searchQuery: (req.query.searchQuery as string) || "",
      sortField: sortOptions[0]?.field || sortFields[0] || "",
      sortOrder: sortOptions[0]?.order || this.parseSortOrderParam(req.query.sortOrder) || "asc",
      sortOptions,
      ordererId: req.query.ordererId as string | undefined,
    };
  }
}
