import { PoolClient } from "pg";
import { pool, TABLES, schemaPrefix } from "../config/database";
import { FilterParams } from "../types";

export class EvaluationRepository {
  /**
   * Get paginated evaluations list with filters
   */
  async findWithFilters(filters: FilterParams): Promise<{ data: any[]; total: number }> {
    const client = await pool.connect();
    try {
      const qualifiedTableName = `${schemaPrefix}${TABLES.evaluations}`;

      // Build WHERE clause
      const { whereClause, queryParams, paramIndex } = this.buildWhereClause(filters);

      // Get total count
      const countQuery = `SELECT COUNT(*) as count FROM ${qualifiedTableName} ${whereClause}`;
      const countResult = await client.query(countQuery, queryParams);
      const total = parseInt(countResult.rows[0].count);

      // Build ORDER BY clause
      const orderByClause = this.buildOrderByClause(filters.sortField, filters.sortOrder);

      // Get paginated data
      const page = filters.page || 0;
      const pageSize = filters.pageSize || 25;
      const offset = page * pageSize;

      const dataQuery = `
        SELECT
          id,
          "evaluationNo",
          jsonb_build_object(
            'title', announcement->>'title',
            'organization', announcement->>'organization',
            'category', announcement->>'category',
            'bidType', announcement->>'bidType',
            'deadline', announcement->>'deadline',
            'workLocation', announcement->>'workLocation'
          ) AS announcement,
          jsonb_build_object(
            'name', company->>'name',
            'priority', (company->>'priority')::integer
          ) AS company,
          jsonb_build_object(
            'name', branch->>'name'
          ) AS branch,
          status,
          "workStatus",
          "currentStep",
          "evaluatedAt"
        FROM ${qualifiedTableName}
        ${whereClause}
        ${orderByClause}
        LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
      `;
      const dataParams = [...queryParams, pageSize, offset];
      const dataResult = await client.query(dataQuery, dataParams);

      return {
        data: dataResult.rows,
        total,
      };
    } finally {
      client.release();
    }
  }

  /**
   * Find single evaluation by ID
   */
  async findById(id: string): Promise<any | null> {
    const client = await pool.connect();
    try {
      const qualifiedTableName = `${schemaPrefix}${TABLES.evaluations}`;

      const result = await client.query(
        `SELECT
          id,
          "evaluationNo",
          announcement,
          company,
          branch,
          requirements,
          status,
          "workStatus",
          "currentStep",
          "evaluatedAt"
        FROM ${qualifiedTableName}
        WHERE id = $1`,
        [id]
      );

      return result.rowCount === 0 ? null : result.rows[0];
    } finally {
      client.release();
    }
  }

  /**
   * Update workStatus for an evaluation
   */
  async updateWorkStatus(evaluationNo: string, workStatus: string): Promise<any | null> {
    const client = await pool.connect();
    try {
      const qualifiedTableName = `${schemaPrefix}${TABLES.evaluations}`;

      const result = await client.query(
        `UPDATE ${qualifiedTableName}
         SET "workStatus" = $1, "updatedAt" = NOW()
         WHERE "evaluationNo" = $2
         RETURNING *`,
        [workStatus, evaluationNo]
      );

      return result.rowCount === 0 ? null : result.rows[0];
    } finally {
      client.release();
    }
  }

  /**
   * Get statistics for analytics dashboard
   */
  async getStats(): Promise<any> {
    const client = await pool.connect();
    try {
      const qualifiedTableName = `${schemaPrefix}${TABLES.evaluations}`;

      const result = await client.query(`
        SELECT
          COUNT(*) AS total,
          COUNT(*) FILTER (WHERE status = 'all_met') AS "allMet",
          COUNT(*) FILTER (WHERE status = 'other_only_unmet') AS "otherUnmet",
          COUNT(*) FILTER (WHERE status = 'unmet') AS "unmet",

          -- 発注機関別集計（上位5件）
          (
            SELECT jsonb_agg(org_stats ORDER BY count DESC)
            FROM (
              SELECT
                SPLIT_PART(announcement->>'organization', ' ', 1) AS organization,
                COUNT(*) AS count
              FROM ${qualifiedTableName}
              GROUP BY SPLIT_PART(announcement->>'organization', ' ', 1)
              ORDER BY COUNT(*) DESC
              LIMIT 5
            ) org_stats
          ) AS "topOrganizations",

          -- 発注機関数
          (
            SELECT COUNT(DISTINCT SPLIT_PART(announcement->>'organization', ' ', 1))
            FROM ${qualifiedTableName}
          ) AS "organizationCount",

          -- カテゴリ別集計（上位5件）
          (
            SELECT jsonb_agg(cat_stats ORDER BY count DESC)
            FROM (
              SELECT
                announcement->>'category' AS category,
                COUNT(*) AS count
              FROM ${qualifiedTableName}
              GROUP BY announcement->>'category'
              ORDER BY COUNT(*) DESC
              LIMIT 5
            ) cat_stats
          ) AS "topCategories"

        FROM ${qualifiedTableName}
      `);

      return result.rows[0];
    } finally {
      client.release();
    }
  }

  /**
   * Build WHERE clause from filters
   */
  private buildWhereClause(filters: FilterParams): {
    whereClause: string;
    queryParams: any[];
    paramIndex: number;
  } {
    const whereClauses: string[] = [];
    const queryParams: any[] = [];
    let paramIndex = 1;

    if (filters.statuses && filters.statuses.length > 0) {
      whereClauses.push(`status = ANY($${paramIndex})`);
      queryParams.push(filters.statuses);
      paramIndex++;
    }

    if (filters.workStatuses && filters.workStatuses.length > 0) {
      whereClauses.push(`"workStatus" = ANY($${paramIndex})`);
      queryParams.push(filters.workStatuses);
      paramIndex++;
    }

    if (filters.priorities && filters.priorities.length > 0) {
      const priorityInts = filters.priorities
        .map((p: string) => parseInt(p, 10))
        .filter((p: number) => !isNaN(p));
      if (priorityInts.length > 0) {
        whereClauses.push(`(company->>'priority')::integer = ANY($${paramIndex}::int[])`);
        queryParams.push(priorityInts);
        paramIndex++;
      }
    }

    if (filters.categories && filters.categories.length > 0) {
      whereClauses.push(`announcement->>'category' = ANY($${paramIndex})`);
      queryParams.push(filters.categories);
      paramIndex++;
    }

    if (filters.bidTypes && filters.bidTypes.length > 0) {
      whereClauses.push(`announcement->>'bidType' = ANY($${paramIndex})`);
      queryParams.push(filters.bidTypes);
      paramIndex++;
    }

    if (filters.organizations && filters.organizations.length > 0) {
      whereClauses.push(`announcement->>'organization' = ANY($${paramIndex})`);
      queryParams.push(filters.organizations);
      paramIndex++;
    }

    if (filters.prefectures && filters.prefectures.length > 0) {
      const prefLikes = filters.prefectures
        .map((_, i) => `announcement->>'workLocation' ILIKE $${paramIndex + i}`)
        .join(' OR ');
      whereClauses.push(`(${prefLikes})`);
      filters.prefectures.forEach(p => queryParams.push(`%${p}%`));
      paramIndex += filters.prefectures.length;
    }

    if (filters.searchQuery && filters.searchQuery.trim()) {
      whereClauses.push(
        `(announcement->>'title' ILIKE $${paramIndex} OR ` +
        `announcement->>'organization' ILIKE $${paramIndex} OR ` +
        `company->>'name' ILIKE $${paramIndex} OR ` +
        `announcement->>'category' ILIKE $${paramIndex})`
      );
      queryParams.push(`%${filters.searchQuery}%`);
      paramIndex++;
    }

    const whereClause = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    return { whereClause, queryParams, paramIndex };
  }

  /**
   * Build ORDER BY clause
   */
  private buildOrderByClause(sortField?: string, sortOrder?: string): string {
    if (!sortField) return '';

    const direction = sortOrder === 'desc' ? 'DESC' : 'ASC';
    const fieldMap: Record<string, string> = {
      evaluationNo: '"evaluationNo"',
      status: 'status',
      workStatus: '"workStatus"',
      priority: "(company->>'priority')::integer",
      title: "announcement->>'title'",
      company: "company->>'name'",
      organization: "announcement->>'organization'",
      category: "announcement->>'category'",
      bidType: "announcement->>'bidType'",
      deadline: `(
        CASE
          WHEN (announcement->>'deadline') ~ '^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$'
            THEN announcement->>'deadline'
          ELSE NULL
        END
      )`,
      evaluatedAt: '"evaluatedAt"',
      prefecture: "announcement->>'workLocation'",
    };

    if (fieldMap[sortField]) {
      return `ORDER BY ${fieldMap[sortField]} ${direction} NULLS LAST`;
    }

    return '';
  }
}
