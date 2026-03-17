import { PoolClient } from "pg";
import { pool, TABLES, schemaPrefix } from "../config/database";
import { FilterParams } from "../types";

export class AnnouncementRepository {
  /**
   * Get paginated announcements list with filters
   */
  async findWithFilters(filters: FilterParams): Promise<{ data: any[]; total: number }> {
    const client = await pool.connect();
    try {
      const qualifiedTableName = `${schemaPrefix}${TABLES.announcements}`;

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
          "no" as "announcementNo",
          "ordererId",
          title,
          organization,
          category,
          "bidType",
          "workLocation",
          department,
          "publishDate",
          "explanationStartDate",
          "explanationEndDate",
          "applicationStartDate",
          "applicationEndDate",
          "bidStartDate",
          "bidEndDate",
          deadline,
          "estimatedAmountMin",
          "estimatedAmountMax",
          status,
          "actualAmount",
          "winningCompanyId",
          "winningCompanyName",
          competing_companies as "competingCompanies",
          documents
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
   * Find single announcement by announcement_no
   */
  async findByNo(announcementNo: number): Promise<any | null> {
    const client = await pool.connect();
    try {
      const qualifiedTableName = `${schemaPrefix}${TABLES.announcements}`;

      const result = await client.query(
        `SELECT * FROM ${qualifiedTableName} WHERE "no" = $1`,
        [announcementNo]
      );

      return result.rowCount === 0 ? null : result.rows[0];
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

    if (filters.bidTypes && filters.bidTypes.length > 0) {
      whereClauses.push(`"bidType" = ANY($${paramIndex})`);
      queryParams.push(filters.bidTypes);
      paramIndex++;
    }

    if (filters.categories && filters.categories.length > 0) {
      whereClauses.push(`category = ANY($${paramIndex})`);
      queryParams.push(filters.categories);
      paramIndex++;
    }

    if (filters.organizations && filters.organizations.length > 0) {
      whereClauses.push(`organization = ANY($${paramIndex})`);
      queryParams.push(filters.organizations);
      paramIndex++;
    }

    if (filters.prefectures && filters.prefectures.length > 0) {
      const prefLikes = filters.prefectures
        .map((_, i) => `"workLocation" ILIKE $${paramIndex + i}`)
        .join(' OR ');
      whereClauses.push(`(${prefLikes})`);
      filters.prefectures.forEach(p => queryParams.push(`%${p}%`));
      paramIndex += filters.prefectures.length;
    }

    if (filters.searchQuery && filters.searchQuery.trim()) {
      whereClauses.push(
        `(title ILIKE $${paramIndex} OR ` +
        `organization ILIKE $${paramIndex} OR ` +
        `category ILIKE $${paramIndex})`
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
      announcementNo: '"no"',
      status: 'status',
      bidType: '"bidType"',
      title: 'title',
      organization: 'organization',
      category: 'category',
      publishDate: '"publishDate"',
      deadline: `(
        CASE
          WHEN deadline ~ '^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$'
            THEN deadline
          ELSE NULL
        END
      )`,
      workLocation: '"workLocation"',
      prefecture: '"workLocation"', // 都道府県ソートは workLocation でソート
    };

    if (fieldMap[sortField]) {
      return `ORDER BY ${fieldMap[sortField]} ${direction} NULLS LAST`;
    }

    return '';
  }
}
