import { PoolClient } from "pg";
import { pool, TABLES, schemaPrefix } from "../config/database";
import { AnnouncementFilterParams, SortOption } from "../types";
import type {
  AnnouncementListItem,
  AnnouncementDetail,
  ProgressingCompany,
  SimilarCase,
  DocumentFile,
} from "../types/announcement";
import { downloadFileFromGCS, readMarkdownFromGCS } from "../utils/gcs";
import { logger } from "../utils/logger";
import { escapeLikePattern } from "../utils/sql";

export class AnnouncementRepository {
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

  /**
   * Get paginated announcements list with filters
   * bid_announcements テーブルから一覧表示に必要な最小限のデータを取得
   */
  async findWithFilters(filters: AnnouncementFilterParams): Promise<{ data: AnnouncementListItem[]; total: number }> {
    const client = await pool.connect();
    try {
      // Build WHERE clause
      const { whereClause, queryParams, paramIndex } = this.buildWhereClause(filters);

      // Get total count
      const countQuery = `
        SELECT COUNT(*) as count
        FROM ${schemaPrefix}bid_announcements
        ${whereClause}
      `;
      const countResult = await client.query(countQuery, queryParams);
      const total = parseInt(countResult.rows[0].count);

      // Build ORDER BY clause
      const sortOptions = this.normalizeSortOptions(filters.sortOptions, filters.sortField, filters.sortOrder);
      const orderByClause = this.buildOrderByClause(sortOptions);

      // Get paginated data
      const page = filters.page || 0;
      const pageSize = filters.pageSize || 25;
      const offset = page * pageSize;

      // 一覧表示に必要な最小限のフィールドのみ取得
      const dataQuery = `
        SELECT
          CONCAT('ann-', announcement_no) AS id,
          announcement_no AS "announcementNo",
          COALESCE("workName", '') AS title,
          COALESCE("topAgencyName", '') AS organization,
          COALESCE(category, '') AS category,
          COALESCE(category_segment, '') AS "categorySegment",
          COALESCE(category_detail, '') AS "categoryDetail",
          COALESCE(notice_category_name, '') AS "noticeCategoryName",
          COALESCE(notice_category_code, '') AS "noticeCategoryCode",
          COALESCE(notice_procurement_method, '') AS "noticeProcurementMethod",
          COALESCE("bidType", 'unknown') AS "bidType",
          COALESCE("workPlace", '') AS "workLocation",
          COALESCE("publishDate", '') AS "publishDate",
          COALESCE("bidEndDate", '') AS deadline,

          -- ステータスを締切日から動的に計算（文字列比較で安全に）
          CASE
            -- 締切が有効な日付形式でない場合は closed
            WHEN "bidEndDate" IS NULL OR "bidEndDate" !~ '^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$'
              THEN 'closed'
            -- 締切まで14日以上 → upcoming (公告中) ※文字列比較
            WHEN "bidEndDate" >= TO_CHAR(CURRENT_DATE + INTERVAL '14 days', 'YYYY-MM-DD')
              THEN 'upcoming'
            -- 締切前で14日以内 → ongoing (締切間近) ※文字列比較
            WHEN "bidEndDate" >= TO_CHAR(CURRENT_DATE, 'YYYY-MM-DD')
              THEN 'ongoing'
            -- 締切後 → awaiting_result (結果待)
            ELSE 'awaiting_result'
          END AS status

        FROM ${schemaPrefix}bid_announcements
        ${whereClause}
        ${orderByClause || 'ORDER BY announcement_no DESC'}
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
   * bid_announcements をベースに、documents と competing_companies を取得
   */
  async findByNo(announcementNo: number): Promise<AnnouncementDetail | null> {
    const client = await pool.connect();
    try {
      const result = await client.query(
        `
        WITH
        -- documents を集約
        documents_agg AS (
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
              ) ORDER BY document_id
            ) AS documents
          FROM ${schemaPrefix}announcements_documents_master
          WHERE announcement_id = $1
          GROUP BY announcement_id
        ),
        -- competing companies を集約
        competing_companies_agg AS (
          SELECT
            cc.announcement_id,
            jsonb_agg(
              jsonb_build_object(
                'name', cc.company_name,
                'isWinner', cc."isWinner",
                'bidAmounts', COALESCE(
                  (
                    SELECT jsonb_agg(bid_amount ORDER BY bid_order)
                    FROM ${schemaPrefix}announcements_competing_company_bids_master b
                    WHERE b.announcement_id = cc.announcement_id
                      AND b.company_name = cc.company_name
                  ),
                  '[]'::jsonb
                )
              ) ORDER BY cc.company_name
            ) AS competing_companies
          FROM ${schemaPrefix}announcements_competing_companies_master cc
          WHERE cc.announcement_id = $1
          GROUP BY cc.announcement_id
        ),
        submission_docs AS (
          SELECT
            announcement_no,
            jsonb_agg(
              jsonb_build_object(
                'documentId', document_id,
                'name', COALESCE(submission_document_name, ''),
                'dateValue', CASE WHEN date_value IS NOT NULL THEN TO_CHAR(date_value, 'YYYY-MM-DD') ELSE NULL END,
                'dateRaw', COALESCE(date_raw, ''),
                'dateMeaning', COALESCE(date_meaning, ''),
                'timepointType', COALESCE(timepoint_type, '')
              )
              ORDER BY date_value IS NULL, date_value, submission_document_name
            ) AS submission_documents
          FROM ${schemaPrefix}bid_announcements_dates
          WHERE announcement_no = $1
          GROUP BY announcement_no
        )
        SELECT
          CONCAT('ann-', a.announcement_no) AS id,
          a.announcement_no AS "no",
          a.announcement_no AS "announcementNo",
          COALESCE(a.orderer_id, '') AS "ordererId",
          COALESCE(a."workName", '') AS title,
          COALESCE(a."topAgencyName", '') AS organization,
          COALESCE(a.category, '') AS category,
          COALESCE(a.category_segment, '') AS "categorySegment",
          COALESCE(a.category_detail, '') AS "categoryDetail",
          COALESCE(a."bidType", 'unknown') AS "bidType",
          COALESCE(a."workPlace", '') AS "workLocation",

          -- department を JSONB オブジェクトとして構築
          jsonb_build_object(
            'postalCode', COALESCE(a.zipcode, ''),
            'address', COALESCE(a.address, ''),
            'name', COALESCE(a.department, ''),
            'contactPerson', COALESCE(a."assigneeName", ''),
            'phone', COALESCE(a.telephone, ''),
            'fax', COALESCE(a.fax, ''),
            'email', COALESCE(a.mail, '')
          ) AS department,

          COALESCE(a."publishDate", '') AS "publishDate",
          COALESCE(a."docDistStart", '') AS "explanationStartDate",
          COALESCE(a."docDistEnd", '') AS "explanationEndDate",
          COALESCE(a."submissionStart", '') AS "applicationStartDate",
          COALESCE(a."submissionEnd", '') AS "applicationEndDate",
          COALESCE(a."bidStartDate", '') AS "bidStartDate",
          COALESCE(a."bidEndDate", '') AS "bidEndDate",
          COALESCE(a."bidEndDate", '') AS deadline,
          COALESCE(a.notice_category_name, '') AS "noticeCategoryName",
          COALESCE(a.notice_category_code, '') AS "noticeCategoryCode",
          COALESCE(a.notice_procurement_method, '') AS "noticeProcurementMethod",

          -- ステータスを締切日から動的に計算（文字列比較で安全に）
          CASE
            WHEN a."bidEndDate" IS NULL OR a."bidEndDate" !~ '^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$'
              THEN 'closed'
            WHEN a."bidEndDate" >= TO_CHAR(CURRENT_DATE + INTERVAL '14 days', 'YYYY-MM-DD')
              THEN 'upcoming'
            WHEN a."bidEndDate" >= TO_CHAR(CURRENT_DATE, 'YYYY-MM-DD')
              THEN 'ongoing'
            ELSE 'awaiting_result'
          END AS status,

          -- 見積金額・落札金額（今後別テーブルから取得予定、現在は NULL）
          NULL::integer AS "estimatedAmountMin",
          NULL::integer AS "estimatedAmountMax",
          NULL::integer AS "actualAmount",
          NULL::text AS "winningCompanyId",
          NULL::text AS "winningCompanyName",

          -- documents と competing_companies
          COALESCE(d.documents, '[]'::jsonb) AS documents,
          COALESCE(cc.competing_companies, '[]'::jsonb) AS "competingCompanies",
          COALESCE(sd.submission_documents, '[]'::jsonb) AS "submissionDocuments"

        FROM ${schemaPrefix}bid_announcements a
        LEFT JOIN documents_agg d ON d.announcement_id = a.announcement_no
        LEFT JOIN competing_companies_agg cc ON cc.announcement_id = a.announcement_no
        LEFT JOIN submission_docs sd ON sd.announcement_no = a.announcement_no
        WHERE a.announcement_no = $1
        `,
        [announcementNo]
      );

      if (result.rowCount === 0) {
        return null;
      }

      const announcement = result.rows[0];

      // documents の各アイテムについて、markdown_path から content を取得
      if (announcement.documents && Array.isArray(announcement.documents)) {
        const documentsWithContent = await Promise.all(
          announcement.documents.map(async (doc: { markdown_path?: string; id?: string | number; [key: string]: unknown }) => {
            let content = '';

            if (doc.markdown_path && doc.markdown_path.startsWith('gs://')) {
              try {
                content = await readMarkdownFromGCS(doc.markdown_path);
              } catch (error) {
                // Markdownファイルが存在しない場合でもページ全体は表示可能にする
                // 開発中なので詳細なエラー情報はログに出力
                logger.error({ err: error }, `Failed to load markdown for document ${doc.id}`);
                content = '文字起こしデータがありません'; // エラー時はメッセージを表示
              }
            } else {
              // markdown_path がない場合
              content = '文字起こしデータがありません';
            }

            return {
              ...doc,
              content,
              markdown_path: undefined, // フロントエンドには渡さない
            };
          })
        );
        announcement.documents = documentsWithContent;
      }

      return announcement;
    } finally {
      client.release();
    }
  }

  /**
   * Get progressing companies (in_progress / completed) for a given announcement
   */
  async findProgressingCompanies(announcementNo: number): Promise<ProgressingCompany[]> {
    const client = await pool.connect();
    try {
      const statusExpression = this.getStatusExpression();
      const result = await client.query(
        `
        SELECT
          cbj.evaluation_no::text AS "evaluationId",
          cbj.announcement_no::text AS "announcementNo",
          cbj.company_no::text AS "companyId",
          COALESCE(cm.company_name, '') AS "companyName",
          cbj.office_no::text AS "branchId",
          COALESCE(om.office_name, '') AS "branchName",
          COALESCE(om.office_address, '') AS "branchAddress",
          COALESCE(cm.company_address, '') AS "companyAddress",
          1 AS priority,
          COALESCE(evs."workStatus", 'not_started') AS "workStatus",
          ${statusExpression} AS "evaluationStatus",
          COALESCE(evs."updatedAt", cbj."updatedDate"::timestamptz) AS "updatedAt"
        FROM ${schemaPrefix}company_bid_judgement cbj
        JOIN ${schemaPrefix}company_master cm
          ON cm.company_no::text = cbj.company_no::text
        LEFT JOIN ${schemaPrefix}office_master om
          ON om.office_no::text = cbj.office_no::text
        LEFT JOIN ${schemaPrefix}${TABLES.evaluationStatuses} evs
          ON evs."evaluationNo" = cbj.evaluation_no::text
        WHERE cbj.announcement_no = $1
          AND COALESCE(evs."workStatus", 'not_started') = ANY($2::text[])
        ORDER BY COALESCE(evs."updatedAt", cbj."updatedDate"::timestamptz) DESC NULLS LAST
        `,
        [announcementNo, ['in_progress', 'completed']]
      );
      return result.rows;
    } finally {
      client.release();
    }
  }

  /**
   * Get similar cases for a specific announcement (by announcement_no)
   */
  async findSimilarCases(announcementNo: number): Promise<SimilarCase[]> {
    const client = await pool.connect();
    try {
      const announcementIdCandidates = [`ann-${announcementNo}`, String(announcementNo)];
      const tableSimilarCases = `${schemaPrefix}similar_cases_master`;
      const tableCompetitors = `${schemaPrefix}similar_cases_competitors`;

      const result = await client.query(
        `
        WITH filtered_cases AS (
          SELECT
            announcement_id::text AS announcement_id,
            similar_case_announcement_id::text AS similar_case_announcement_id,
            COALESCE(case_name, '') AS case_name,
            COALESCE(winning_company, '') AS winning_company,
            winning_amount
          FROM ${tableSimilarCases}
          WHERE announcement_id::text = ANY($1::text[])
        ),
        competitors AS (
          SELECT
            similar_case_announcement_id::text AS similar_case_announcement_id,
            jsonb_agg(competitor_name ORDER BY competitor_name) AS names
          FROM ${tableCompetitors}
          WHERE similar_case_announcement_id::text IN (
            SELECT similar_case_announcement_id FROM filtered_cases
          )
          GROUP BY similar_case_announcement_id
        )
        SELECT
          sc.announcement_id,
          sc.similar_case_announcement_id,
          sc.case_name,
          sc.winning_company,
          sc.winning_amount,
          COALESCE(comp.names, '[]'::jsonb) AS competitors
        FROM filtered_cases sc
        LEFT JOIN competitors comp
          ON comp.similar_case_announcement_id = sc.similar_case_announcement_id
        ORDER BY sc.case_name
        `,
        [announcementIdCandidates]
      );

      return result.rows.map(row => ({
        id: row.similar_case_announcement_id ?? row.announcement_id,
        announcementId: row.announcement_id,
        similarAnnouncementId: row.similar_case_announcement_id,
        caseName: row.case_name,
        winningCompany: row.winning_company,
        winningAmount: row.winning_amount,
        competitors: row.competitors ?? [],
      }));
    } catch (error) {
      logger.error({ err: error }, `ERROR fetching similar cases for announcement ${announcementNo}`);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Build WHERE clause from filters
   * bid_announcements テーブルのカラム名に対応
   */
  private buildWhereClause(filters: AnnouncementFilterParams): {
    whereClause: string;
    queryParams: unknown[];
    paramIndex: number;
  } {
    const whereClauses: string[] = [];
    const queryParams: unknown[] = [];
    let paramIndex = 1;

    // ステータスフィルター（文字列比較で安全に）
    if (filters.statuses && filters.statuses.length > 0) {
      const statusConditions = filters.statuses.map(status => {
        switch (status) {
          case 'upcoming':
            return `(
              "bidEndDate" ~ '^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$'
              AND "bidEndDate" >= TO_CHAR(CURRENT_DATE + INTERVAL '14 days', 'YYYY-MM-DD')
            )`;
          case 'ongoing':
            return `(
              "bidEndDate" ~ '^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$'
              AND "bidEndDate" >= TO_CHAR(CURRENT_DATE, 'YYYY-MM-DD')
              AND "bidEndDate" < TO_CHAR(CURRENT_DATE + INTERVAL '14 days', 'YYYY-MM-DD')
            )`;
          case 'awaiting_result':
            return `(
              "bidEndDate" ~ '^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$'
              AND "bidEndDate" < TO_CHAR(CURRENT_DATE, 'YYYY-MM-DD')
            )`;
          case 'closed':
            return `(
              "bidEndDate" IS NULL
              OR "bidEndDate" !~ '^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$'
            )`;
          default:
            return 'FALSE';
        }
      }).join(' OR ');
      whereClauses.push(`(${statusConditions})`);
    }

    if (filters.bidTypes && filters.bidTypes.length > 0) {
      // 'unknown' が含まれている場合は NULL や空文字も含める
      if (filters.bidTypes.includes('unknown')) {
        const otherTypes = filters.bidTypes.filter(t => t !== 'unknown');
        if (otherTypes.length > 0) {
          whereClauses.push(
            `("bidType" = ANY($${paramIndex}) OR "bidType" IS NULL OR "bidType" = '')`
          );
          queryParams.push(otherTypes);
          paramIndex++;
        } else {
          // 'unknown' のみの場合
          whereClauses.push(`("bidType" IS NULL OR "bidType" = '')`);
        }
      } else {
        whereClauses.push(`"bidType" = ANY($${paramIndex})`);
        queryParams.push(filters.bidTypes);
        paramIndex++;
      }
    }

    if (filters.categories && filters.categories.length > 0) {
      whereClauses.push(`category = ANY($${paramIndex})`);
      queryParams.push(filters.categories);
      paramIndex++;
    }

    if (filters.categorySegments && filters.categorySegments.length > 0) {
      whereClauses.push(`category_segment = ANY($${paramIndex})`);
      queryParams.push(filters.categorySegments);
      paramIndex++;
    }

    if (filters.categoryDetails && filters.categoryDetails.length > 0) {
      whereClauses.push(`category_detail = ANY($${paramIndex})`);
      queryParams.push(filters.categoryDetails);
      paramIndex++;
    }

    if (filters.organizations && filters.organizations.length > 0) {
      whereClauses.push(`"topAgencyName" = ANY($${paramIndex})`);
      queryParams.push(filters.organizations);
      paramIndex++;
    }

    if (filters.prefectures && filters.prefectures.length > 0) {
      const prefLikes = filters.prefectures
        .map((_, i) => `"workPlace" ILIKE $${paramIndex + i}`)
        .join(' OR ');
      whereClauses.push(`(${prefLikes})`);
      filters.prefectures.forEach(p => queryParams.push(`%${escapeLikePattern(p)}%`));
      paramIndex += filters.prefectures.length;
    }

    if (filters.searchQuery && filters.searchQuery.trim()) {
      whereClauses.push(
        `("workName" ILIKE $${paramIndex} OR ` +
        `"topAgencyName" ILIKE $${paramIndex} OR ` +
        `category ILIKE $${paramIndex} OR ` +
        `category_segment ILIKE $${paramIndex} OR ` +
        `category_detail ILIKE $${paramIndex})`
      );
      queryParams.push(`%${escapeLikePattern(filters.searchQuery)}%`);
      paramIndex++;
    }

    if (filters.ordererId) {
      whereClauses.push(`orderer_id = $${paramIndex}`);
      queryParams.push(filters.ordererId);
      paramIndex++;
    }

    const whereClause = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    return { whereClause, queryParams, paramIndex };
  }

  /**
   * Normalize sort inputs (新旧パラメータ対応)
   */
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
   * bid_announcements テーブルのカラム名に対応
   */
  private buildOrderByClause(sortOptions?: SortOption[]): string {
    if (!sortOptions || sortOptions.length === 0) return '';

    const fieldMap: Record<string, string> = {
      announcementNo: 'announcement_no',
      no: 'announcement_no',
      status: `(
        CASE
          WHEN "bidEndDate" IS NULL OR "bidEndDate" !~ '^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$'
            THEN 4
          WHEN "bidEndDate" >= TO_CHAR(CURRENT_DATE + INTERVAL '14 days', 'YYYY-MM-DD')
            THEN 1
          WHEN "bidEndDate" >= TO_CHAR(CURRENT_DATE, 'YYYY-MM-DD')
            THEN 2
          ELSE 3
        END
      )`,
      bidType: '"bidType"',
      title: '"workName"',
      organization: '"topAgencyName"',
      category: 'category',
      publishDate: `
        CASE
          WHEN "publishDate" IS NULL OR "publishDate" = '' THEN NULL
          WHEN "publishDate" ~ '^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$' THEN "publishDate"
          ELSE NULL
        END
      `,
      deadline: `
        CASE
          WHEN "bidEndDate" IS NULL OR "bidEndDate" = '' THEN NULL
          WHEN "bidEndDate" ~ '^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$' THEN "bidEndDate"
          ELSE NULL
        END
      `,
      workLocation: '"workPlace"',
      prefecture: '"workPlace"',
    };

    const orderParts: string[] = [];
    let includesPrimary = false;

    sortOptions.forEach(({ field, order }) => {
      const target = fieldMap[field];
      if (!target) return;

      if (field === 'announcementNo' || field === 'no') {
        includesPrimary = true;
      }

      const direction = order === 'desc' ? 'DESC' : 'ASC';
      orderParts.push(`${target} ${direction} NULLS LAST`);
    });

    if (orderParts.length === 0) return '';

    if (!includesPrimary) {
      orderParts.push('announcement_no DESC');
    }

    return `ORDER BY ${orderParts.join(', ')}`;
  }

  /**
   * 指定した資料ファイルを GCS から取得
   */
  async getDocumentFile(announcementNo: number, documentId: string): Promise<DocumentFile | null> {
    const client = await pool.connect();
    try {
      const result = await client.query(
        `
        SELECT
          document_id,
          title,
          "fileFormat",
          save_path,
          url
        FROM ${schemaPrefix}announcements_documents_master
        WHERE announcement_id = $1
          AND document_id = $2
        `,
        [announcementNo, documentId]
      );

      if (result.rowCount === 0) {
        return null;
      }

      const row = result.rows[0] as {
        document_id: number;
        title: string;
        fileFormat: string | null;
        save_path: string | null;
        url: string | null;
      };

      const gcsPath = row.save_path?.startsWith('gs://') ? row.save_path : undefined;
      if (!gcsPath) {
        const message = `Document ${documentId} for announcement ${announcementNo} has no GCS save_path`;
        logger.warn(message);
        throw new Error("Document file not found in storage");
      }

      const fileBuffer = await downloadFileFromGCS(gcsPath);

      return {
        data: fileBuffer,
        fileFormat: row.fileFormat || 'pdf',
        title: row.title || `document-${row.document_id}`,
      };
    } finally {
      client.release();
    }
  }
}
