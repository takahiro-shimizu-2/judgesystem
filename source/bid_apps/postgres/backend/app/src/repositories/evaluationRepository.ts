import { pool, TABLES, schemaPrefix } from "../config/database";
import { readMarkdownFromGCS } from "../utils/gcs";
import { FilterParams, SortOption } from "../types";
import { logger } from "../utils/logger";

type QualifiedTables = {
  companyBidJudgement: string;
  bidAnnouncements: string;
  companyMaster: string;
  officeMaster: string;
  documents: string;
  requirements: string;
  sufficientRequirements: string;
  insufficientRequirements: string;
  competingCompanies: string;
  competingCompanyBids: string;
  announcementsEstimatedAmounts: string;
  evaluationStatuses: string;
  evaluationAssignees: string;
};

export class EvaluationRepository {
  /**
   * Get paginated evaluations list with filters
   */
  async findWithFilters(filters: FilterParams): Promise<{ data: any[]; total: number }> {
    const client = await pool.connect();
    try {
      const tables = this.getQualifiedTables();
      const baseFromClause = this.getBaseFromClause(tables);
      const statusExpression = this.getStatusExpression();
      const workStatusExpression = this.getWorkStatusExpression();
      const currentStepExpression = this.getCurrentStepExpression();
      const priorityExpression = this.getPriorityExpression();

      // Build WHERE clause
      const { whereClause, queryParams, paramIndex } = this.buildWhereClause(
        filters,
        statusExpression,
        workStatusExpression
      );

      // Build ORDER BY clause
      const sortOptions = this.normalizeSortOptions(filters.sortOptions, filters.sortField, filters.sortOrder);
      const orderByClause = this.buildOrderByClause(
        sortOptions,
        statusExpression,
        workStatusExpression,
        priorityExpression
      );

      // Get paginated data with total count via Window function
      const page = filters.page || 0;
      const pageSize = filters.pageSize || 25;
      const offset = page * pageSize;

      const dataQuery = `
        SELECT
          COUNT(*) OVER() AS total_count,
          cbj.evaluation_no::text AS id,
          cbj.evaluation_no::text AS "evaluationNo",
          jsonb_build_object(
            'title', COALESCE(ba."workName", ''),
            'organization', COALESCE(ba."topAgencyName", ''),
            'category', COALESCE(ba.category, ''),
            'bidType', COALESCE(ba."bidType", ''),
            'deadline', COALESCE(ba."bidEndDate", ''),
            'workLocation', COALESCE(ba."workPlace", ''),
            'estimatedAmountMin', aea.estimated_amount_min,
            'estimatedAmountMax', aea.estimated_amount_max
          ) AS announcement,
          jsonb_build_object(
            'name', COALESCE(cm.company_name, ''),
            'priority', ${priorityExpression}
          ) AS company,
          jsonb_build_object(
            'id', CONCAT('brn-', cbj.office_no),
            'name', COALESCE(om.office_name, ''),
            'address', COALESCE(om.office_address, ''),
            'phone', COALESCE(om.office_telephone, ''),
            'email', COALESCE(om.office_email, ''),
            'fax', COALESCE(om.office_fax, ''),
            'postalCode', COALESCE(om.office_postal_code, '')
          ) AS branch,
          ${statusExpression} AS status,
          ${workStatusExpression} AS "workStatus",
          ${currentStepExpression} AS "currentStep",
          cbj."updatedDate" AS "evaluatedAt"
        ${baseFromClause}
        ${whereClause}
        ${orderByClause || 'ORDER BY cbj."updatedDate" DESC NULLS LAST, cbj.evaluation_no DESC'}
        LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
      `;
      const dataParams = [...queryParams, pageSize, offset];
      const dataResult = await client.query(dataQuery, dataParams);

      const total = dataResult.rows.length > 0
        ? parseInt(dataResult.rows[0].total_count)
        : 0;

      // Remove total_count from each row
      const data = dataResult.rows.map(({ total_count, ...row }) => row);

      return {
        data,
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
      const tables = this.getQualifiedTables();
      const statusExpression = this.getStatusExpression();
      const workStatusExpression = this.getWorkStatusExpression();
      const currentStepExpression = this.getCurrentStepExpression();
      const priorityExpression = this.getPriorityExpression();
      const baseFromClause = this.getBaseFromClause(tables);

      const result = await client.query(
        `
        WITH documents AS (
          SELECT
            announcement_id,
            jsonb_agg(
              jsonb_build_object(
                'id', document_id,
                'type', type,
                'title', title,
                'fileFormat', "fileFormat",
                'pageCount', "pageCount",
                'extractedAt', "extractedAt",
                'url', COALESCE(REPLACE(save_path, 'gs://', 'https://storage.googleapis.com/'), url),
                'markdown_path', markdown_path
              )
              ORDER BY document_id
            ) AS docs
          FROM ${tables.documents}
          GROUP BY announcement_id
        ),
        company_bids AS (
          SELECT
            announcement_id,
            company_name,
            jsonb_agg(bid_amount ORDER BY bid_order) AS bid_amounts
          FROM ${tables.competingCompanyBids}
          GROUP BY announcement_id, company_name
        ),
        competing_companies AS (
          SELECT
            cc.announcement_id,
            jsonb_agg(
              jsonb_build_object(
                'name', cc.company_name,
                'isWinner', cc."isWinner",
                'bidAmounts', COALESCE(cb.bid_amounts, '[]'::jsonb)
              )
              ORDER BY cc.company_name
            ) AS companies,
            MAX(CASE WHEN cc."isWinner" THEN cc.company_name END) AS winning_company_name,
            MAX(
              CASE WHEN cc."isWinner" THEN (
                SELECT bid_amount
                FROM ${tables.competingCompanyBids} b
                WHERE b.announcement_id = cc.announcement_id
                  AND b.company_name = cc.company_name
                ORDER BY bid_order DESC
                LIMIT 1
              ) END
            ) AS winning_company_amount
          FROM ${tables.competingCompanies} cc
          LEFT JOIN company_bids cb
            ON cb.announcement_id = cc.announcement_id
           AND cb.company_name = cc.company_name
         GROUP BY cc.announcement_id
        ),
        step_assignees AS (
          SELECT
            evaluation_no,
            jsonb_agg(
              jsonb_build_object(
                'stepId', step_id,
                'staffId', contact_id::text,
                'assignedAt', assigned_at
              )
              ORDER BY step_id
            ) AS assignees
          FROM ${tables.evaluationAssignees}
          GROUP BY evaluation_no
        ),
        requirement_details AS (
          SELECT
            req1.announcement_no,
            req2.office_no,
            jsonb_agg(
              jsonb_build_object(
                'id', CONCAT('req-', req1.requirement_no),
                'category', req2.requirement_type,
                'name', req1.requirement_text,
                'isMet', req2.is_met,
                'reason', req2.requirement_description,
                'evidence', COALESCE(req1.requirement_text, req2.requirement_description, '')
              )
              ORDER BY req1.requirement_no
            ) AS requirements
          FROM ${tables.requirements} req1
          JOIN (
            SELECT
              announcement_no,
              office_no,
              requirement_no,
              requirement_type,
              requirement_description,
              TRUE AS is_met
            FROM ${tables.sufficientRequirements}
            UNION ALL
            SELECT
              announcement_no,
              office_no,
              requirement_no,
              requirement_type,
              requirement_description,
              FALSE AS is_met
            FROM ${tables.insufficientRequirements}
          ) req2
            ON req1.requirement_no = req2.requirement_no
          GROUP BY req1.announcement_no, req2.office_no
        )
        SELECT
          cbj.evaluation_no::text AS id,
          cbj.evaluation_no::text AS "evaluationNo",
          jsonb_build_object(
            'id', CONCAT('ann-', cbj.announcement_no),
            'ordererId', COALESCE(ba.orderer_id::text, ''),
            'title', COALESCE(ba."workName", ''),
            'category', COALESCE(ba.category, ''),
            'organization', COALESCE(ba."topAgencyName", ''),
            'workLocation', COALESCE(ba."workPlace", ''),
            'department', jsonb_build_object(
              'postalCode', COALESCE(ba.zipcode, ''),
              'address', COALESCE(ba.address, ''),
              'name', COALESCE(ba.department, ''),
              'contactPerson', COALESCE(ba."assigneeName", ''),
              'phone', COALESCE(ba.telephone, ''),
              'fax', COALESCE(ba.fax, ''),
              'email', COALESCE(ba.mail, '')
            ),
            'publishDate', COALESCE(ba."publishDate", ''),
            'explanationStartDate', COALESCE(ba."docDistStart", ''),
            'explanationEndDate', COALESCE(ba."docDistEnd", ''),
            'applicationStartDate', COALESCE(ba."submissionStart", ''),
            'applicationEndDate', COALESCE(ba."submissionEnd", ''),
            'bidStartDate', COALESCE(ba."bidStartDate", ''),
            'bidEndDate', COALESCE(ba."bidEndDate", ''),
            'deadline', COALESCE(ba."bidEndDate", ''),
            'estimatedAmountMin', aea.estimated_amount_min,
            'estimatedAmountMax', aea.estimated_amount_max,
            'pdfUrl', COALESCE(doc.docs->0->>'url', ''),
            'documents', COALESCE(doc.docs, '[]'::jsonb),
            'competingCompanies', COALESCE(companies.companies, '[]'::jsonb),
            'winningCompanyId', NULL,
            'winningCompanyName', COALESCE(companies.winning_company_name, ''),
            'actualAmount', companies.winning_company_amount
          ) AS announcement,
          jsonb_build_object(
            'id', CONCAT('com-', cbj.company_no),
            'name', COALESCE(cm.company_name, ''),
            'address', COALESCE(cm.company_address, ''),
            'grade', 'A',
            'priority', ${priorityExpression}
          ) AS company,
          jsonb_build_object(
            'id', CONCAT('brn-', cbj.office_no),
            'name', COALESCE(om.office_name, ''),
            'address', COALESCE(om.office_address, ''),
            'phone', COALESCE(om.office_telephone, ''),
            'email', COALESCE(om.office_email, ''),
            'fax', COALESCE(om.office_fax, ''),
            'postalCode', COALESCE(om.office_postal_code, '')
          ) AS branch,
          COALESCE(sa.assignees, '[]'::jsonb) AS "stepAssignees",
          COALESCE(req.requirements, '[]'::jsonb) AS requirements,
          ${statusExpression} AS status,
          ${workStatusExpression} AS "workStatus",
          ${currentStepExpression} AS "currentStep",
          cbj."updatedDate" AS "evaluatedAt"
        ${baseFromClause}
        LEFT JOIN documents doc ON doc.announcement_id::text = cbj.announcement_no::text
        LEFT JOIN competing_companies companies ON companies.announcement_id::text = cbj.announcement_no::text
        LEFT JOIN requirement_details req
          ON req.announcement_no::text = cbj.announcement_no::text
         AND COALESCE(req.office_no::text, '-1') = COALESCE(cbj.office_no::text, '-1')
        LEFT JOIN step_assignees sa ON sa.evaluation_no::text = cbj.evaluation_no::text
        WHERE cbj.evaluation_no::text = $1
        `,
        [id]
      );

      if (result.rowCount === 0) {
        return null;
      }

      const evaluation = result.rows[0];

      if (
        evaluation?.announcement?.documents &&
        Array.isArray(evaluation.announcement.documents)
      ) {
        evaluation.announcement.documents = await this.attachDocumentContents(
          evaluation.announcement.documents
        );
      }

      return evaluation;
    } finally {
      client.release();
    }
  }

  /**
   * Update workStatus for an evaluation
   */
  async updateWorkStatus(
    evaluationNo: string,
    workStatus: string,
    currentStep?: string
  ): Promise<any | null> {
    const client = await pool.connect();
    try {
      const qualifiedTableName = `${schemaPrefix}${TABLES.evaluationStatuses}`;

      const result = await client.query(
        `INSERT INTO ${qualifiedTableName} AS status ("evaluationNo", "workStatus", "currentStep")
         VALUES ($1, $2, COALESCE($3, 'judgment'))
         ON CONFLICT ("evaluationNo") DO UPDATE
         SET "workStatus" = EXCLUDED."workStatus",
             "currentStep" = CASE WHEN $3 IS NULL THEN status."currentStep" ELSE EXCLUDED."currentStep" END,
             "updatedAt" = NOW()
         RETURNING "evaluationNo", "workStatus", "currentStep", "updatedAt"`,
        [evaluationNo, workStatus, currentStep ?? null]
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
      const tables = this.getQualifiedTables();
      const baseFromClause = this.getBaseFromClause(tables);
      const statusExpression = this.getStatusExpression();

      const result = await client.query(`
        WITH base AS (
          SELECT
            ${statusExpression} AS status,
            COALESCE(ba."topAgencyName", '') AS organization,
            COALESCE(ba.category, '') AS category
          ${baseFromClause}
        )
        SELECT
          COUNT(*) AS total,
          COUNT(*) FILTER (WHERE status = 'all_met') AS "allMet",
          COUNT(*) FILTER (WHERE status = 'other_only_unmet') AS "otherUnmet",
          COUNT(*) FILTER (WHERE status = 'unmet') AS "unmet",
          (
            SELECT jsonb_agg(org_stats ORDER BY count DESC)
            FROM (
              SELECT
                SPLIT_PART(organization, ' ', 1) AS organization,
                COUNT(*) AS count
              FROM base
              GROUP BY SPLIT_PART(organization, ' ', 1)
              ORDER BY COUNT(*) DESC
              LIMIT 5
            ) org_stats
          ) AS "topOrganizations",
          (
            SELECT COUNT(DISTINCT SPLIT_PART(organization, ' ', 1))
            FROM base
          ) AS "organizationCount",
          (
            SELECT jsonb_agg(cat_stats ORDER BY count DESC)
            FROM (
              SELECT
                category,
                COUNT(*) AS count
              FROM base
              GROUP BY category
              ORDER BY COUNT(*) DESC
              LIMIT 5
            ) cat_stats
          ) AS "topCategories"
        FROM base
      `);

      return result.rows[0];
    } finally {
      client.release();
    }
  }

  /**
   * Get counts for each evaluation status based on current filters
   */
  async getStatusCounts(filters: FilterParams): Promise<{ all_met: number; other_only_unmet: number; unmet: number }> {
    const client = await pool.connect();
    try {
      const tables = this.getQualifiedTables();
      const baseFromClause = this.getBaseFromClause(tables);
      const statusExpression = this.getStatusExpression();
      const workStatusExpression = this.getWorkStatusExpression();

      const { whereClause, queryParams } = this.buildWhereClause(filters, statusExpression, workStatusExpression);

      const result = await client.query(
        `
        WITH base AS (
          SELECT
            ${statusExpression} AS status
          ${baseFromClause}
          ${whereClause}
        )
        SELECT
          COUNT(*) FILTER (WHERE status = 'all_met') AS "all_met",
          COUNT(*) FILTER (WHERE status = 'other_only_unmet') AS "other_only_unmet",
          COUNT(*) FILTER (WHERE status = 'unmet') AS "unmet"
        FROM base
        `,
        queryParams
      );

      if (result.rowCount === 0) {
        return { all_met: 0, other_only_unmet: 0, unmet: 0 };
      }

      return result.rows[0];
    } finally {
      client.release();
    }
  }

  /**
   * Build WHERE clause from filters
   */
  private buildWhereClause(
    filters: FilterParams,
    statusExpression: string,
    workStatusExpression: string
  ): {
    whereClause: string;
    queryParams: any[];
    paramIndex: number;
  } {
    const whereClauses: string[] = [];
    const queryParams: any[] = [];
    let paramIndex = 1;

    if (filters.statuses && filters.statuses.length > 0) {
      whereClauses.push(`${statusExpression} = ANY($${paramIndex})`);
      queryParams.push(filters.statuses);
      paramIndex++;
    }

    if (filters.workStatuses && filters.workStatuses.length > 0) {
      whereClauses.push(`${workStatusExpression} = ANY($${paramIndex})`);
      queryParams.push(filters.workStatuses);
      paramIndex++;
    }

    if (filters.priorities && filters.priorities.length > 0) {
      const priorityInts = filters.priorities
        .map((p: string) => parseInt(p, 10))
        .filter((p: number) => !isNaN(p));
      if (priorityInts.length > 0) {
        whereClauses.push(`1 = ANY($${paramIndex}::int[])`);
        queryParams.push(priorityInts);
        paramIndex++;
      }
    }

    if (filters.categories && filters.categories.length > 0) {
      whereClauses.push(`ba.category = ANY($${paramIndex})`);
      queryParams.push(filters.categories);
      paramIndex++;
    }

    if (filters.bidTypes && filters.bidTypes.length > 0) {
      whereClauses.push(`ba."bidType" = ANY($${paramIndex})`);
      queryParams.push(filters.bidTypes);
      paramIndex++;
    }

    if (filters.organizations && filters.organizations.length > 0) {
      whereClauses.push(`ba."topAgencyName" = ANY($${paramIndex})`);
      queryParams.push(filters.organizations);
      paramIndex++;
    }

    if (filters.prefectures && filters.prefectures.length > 0) {
      const prefLikes = filters.prefectures
        .map((_, i) => `ba."workPlace" ILIKE $${paramIndex + i}`)
        .join(' OR ');
      whereClauses.push(`(${prefLikes})`);
      filters.prefectures.forEach(p => queryParams.push(`%${p}%`));
      paramIndex += filters.prefectures.length;
    }

    if (filters.searchQuery && filters.searchQuery.trim()) {
      whereClauses.push(
        `(ba."workName" ILIKE $${paramIndex} OR ` +
        `ba."topAgencyName" ILIKE $${paramIndex} OR ` +
        `cm.company_name ILIKE $${paramIndex} OR ` +
        `ba.category ILIKE $${paramIndex})`
      );
      queryParams.push(`%${filters.searchQuery}%`);
      paramIndex++;
    }

    if (filters.ordererId) {
      const ordererValue = Array.isArray(filters.ordererId) ? filters.ordererId[0] : filters.ordererId;
      whereClauses.push(`ba.orderer_id = $${paramIndex}`);
      queryParams.push(String(ordererValue));
      paramIndex++;
    }

    const whereClause = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    return { whereClause, queryParams, paramIndex };
  }

  private normalizeSortOptions(
    sortOptions?: SortOption[],
    sortField?: string,
    sortOrder?: string
  ): SortOption[] | undefined {
    if (sortOptions && sortOptions.length > 0) {
      return sortOptions;
    }

    if (sortField) {
      return [
        {
          field: sortField,
          order: sortOrder === 'desc' ? 'desc' : 'asc',
        },
      ];
    }

    return undefined;
  }

  /**
   * Build ORDER BY clause
   */
  private buildOrderByClause(
    sortOptions: SortOption[] | undefined,
    statusExpression: string,
    workStatusExpression: string,
    priorityExpression: string
  ): string {
    if (!sortOptions || sortOptions.length === 0) return '';

    const fieldMap: Record<string, string> = {
      evaluationNo: 'cbj.evaluation_no',
      status: statusExpression,
      workStatus: workStatusExpression,
      priority: `${priorityExpression}`,
      title: `ba."workName"`,
      company: `cm.company_name`,
      organization: `ba."topAgencyName"`,
      category: `ba.category`,
      bidType: `ba."bidType"`,
      deadline: `(
        CASE
          WHEN ba."bidEndDate" ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
            AND substring(ba."bidEndDate" FROM 6 FOR 2)::int BETWEEN 1 AND 12
            AND substring(ba."bidEndDate" FROM 9 FOR 2)::int BETWEEN 1 AND (
              CASE
                WHEN substring(ba."bidEndDate" FROM 6 FOR 2)::int IN (1, 3, 5, 7, 8, 10, 12) THEN 31
                WHEN substring(ba."bidEndDate" FROM 6 FOR 2)::int IN (4, 6, 9, 11) THEN 30
                WHEN (
                  substring(ba."bidEndDate" FROM 1 FOR 4)::int % 400 = 0
                  OR (
                    substring(ba."bidEndDate" FROM 1 FOR 4)::int % 4 = 0
                    AND substring(ba."bidEndDate" FROM 1 FOR 4)::int % 100 <> 0
                  )
                ) THEN 29
                ELSE 28
              END
            )
            THEN ba."bidEndDate"
          ELSE NULL
        END
      )`,
      evaluatedAt: `cbj."updatedDate"`,
      prefecture: `ba."workPlace"`,
    };

    const orderParts: string[] = [];
    let includesPrimary = false;

    sortOptions.forEach(({ field, order }) => {
      const column = fieldMap[field];
      if (!column) return;

      if (field === 'evaluationNo') {
        includesPrimary = true;
      }

      if (field === 'deadline') {
        const currentDateKey = `to_char(CURRENT_DATE, 'YYYY-MM-DD')`;
        const activeFirstClause = `${column} IS NULL`;
        const expiredLastClause = `CASE WHEN ${column} IS NOT NULL AND ${column} < ${currentDateKey} THEN 1 ELSE 0 END`;
        const activeDeadlineClause = `CASE WHEN ${column} >= ${currentDateKey} THEN ${column} ELSE NULL END`;
        const expiredDeadlineClause = `CASE WHEN ${column} < ${currentDateKey} THEN ${column} ELSE NULL END`;
        const activeDirection = order === 'desc' ? 'DESC' : 'ASC';

        orderParts.push(`${activeFirstClause} ASC`);
        orderParts.push(`${expiredLastClause} ASC`);
        orderParts.push(`${activeDeadlineClause} ${activeDirection} NULLS LAST`);
        orderParts.push(`${expiredDeadlineClause} DESC NULLS LAST`);
        return;
      }

      const direction = order === 'desc' ? 'DESC' : 'ASC';
      orderParts.push(`${column} ${direction} NULLS LAST`);
    });

    if (orderParts.length === 0) return '';

    if (!includesPrimary) {
      orderParts.push('cbj.evaluation_no DESC');
    }

    return `ORDER BY ${orderParts.join(', ')}`;
  }

  private getQualifiedTables(): QualifiedTables {
    return {
      companyBidJudgement: `${schemaPrefix}company_bid_judgement`,
      bidAnnouncements: `${schemaPrefix}bid_announcements`,
      companyMaster: `${schemaPrefix}company_master`,
      officeMaster: `${schemaPrefix}office_master`,
      documents: `${schemaPrefix}announcements_documents_master`,
      requirements: `${schemaPrefix}bid_requirements`,
      sufficientRequirements: `${schemaPrefix}sufficient_requirements`,
      insufficientRequirements: `${schemaPrefix}insufficient_requirements`,
      competingCompanies: `${schemaPrefix}announcements_competing_companies_master`,
      competingCompanyBids: `${schemaPrefix}announcements_competing_company_bids_master`,
      announcementsEstimatedAmounts: `${schemaPrefix}announcements_estimated_amounts`,
      evaluationStatuses: `${schemaPrefix}${TABLES.evaluationStatuses}`,
      evaluationAssignees: `${schemaPrefix}${TABLES.evaluationAssignees}`,
    };
  }

  private getBaseFromClause(tables: QualifiedTables): string {
    return `
      FROM ${tables.companyBidJudgement} cbj
      JOIN ${tables.bidAnnouncements} ba ON ba.announcement_no::text = cbj.announcement_no::text
      JOIN ${tables.companyMaster} cm ON cm.company_no::text = cbj.company_no::text
      LEFT JOIN ${tables.officeMaster} om ON om.office_no::text = cbj.office_no::text
      LEFT JOIN ${tables.announcementsEstimatedAmounts} aea ON aea.announcement_no::text = cbj.announcement_no::text
      LEFT JOIN ${tables.evaluationStatuses} evs ON evs."evaluationNo" = cbj.evaluation_no::text
    `;
  }

  private getStatusExpression(): string {
    return `
      CASE
        WHEN COALESCE(cbj.final_status, FALSE) THEN 'all_met'
        WHEN
          COALESCE(cbj.requirement_ineligibility, FALSE) = TRUE
          AND COALESCE(cbj.requirement_grade_item, FALSE) = TRUE
          AND COALESCE(cbj.requirement_location, FALSE) = TRUE
          AND COALESCE(cbj.requirement_experience, FALSE) = TRUE
          AND COALESCE(cbj.requirement_technician, FALSE) = TRUE
          AND COALESCE(cbj.requirement_other, FALSE) = FALSE
        THEN 'other_only_unmet'
        ELSE 'unmet'
      END
    `;
  }

  private getWorkStatusExpression(): string {
    return `COALESCE(evs."workStatus", 'not_started')`;
  }

  private getCurrentStepExpression(): string {
    return `COALESCE(evs."currentStep", 'judgment')`;
  }

  private getPriorityExpression(): string {
    return `1`;
  }

  private async attachDocumentContents(documents: any[]): Promise<any[]> {
    return Promise.all(
      documents.map(async (doc: any) => {
        let content = "文字起こしデータがありません";
        if (doc.markdown_path && typeof doc.markdown_path === "string" && doc.markdown_path.startsWith("gs://")) {
          try {
            content = await readMarkdownFromGCS(doc.markdown_path);
          } catch (error) {
            logger.error({ err: error }, `Failed to load markdown for document ${doc.id}`);
          }
        }
        return {
          ...doc,
          content,
          markdown_path: undefined,
        };
      })
    );
  }
}
