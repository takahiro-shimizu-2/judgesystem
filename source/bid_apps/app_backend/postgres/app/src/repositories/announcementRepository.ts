import { PoolClient } from "pg";
import { pool, TABLES, schemaPrefix } from "../config/database";
import { FilterParams } from "../types";
import { readMarkdownFromGCS } from "../utils/gcs";

export class AnnouncementRepository {
  /**
   * Get paginated announcements list with filters
   * bid_announcements テーブルから一覧表示に必要な最小限のデータを取得
   */
  async findWithFilters(filters: FilterParams): Promise<{ data: any[]; total: number }> {
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
      const orderByClause = this.buildOrderByClause(filters.sortField, filters.sortOrder);

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
   * bid_announcements をベースに、documents と competing_companies を取得
   */
  async findByNo(announcementNo: number): Promise<any | null> {
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
        )
        SELECT
          CONCAT('ann-', a.announcement_no) AS id,
          a.announcement_no AS "no",
          a.announcement_no AS "announcementNo",
          COALESCE(a.orderer_id, '') AS "ordererId",
          COALESCE(a."workName", '') AS title,
          COALESCE(a."topAgencyName", '') AS organization,
          COALESCE(a.category, '') AS category,
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
          COALESCE(cc.competing_companies, '[]'::jsonb) AS "competingCompanies"

        FROM ${schemaPrefix}bid_announcements a
        LEFT JOIN documents_agg d ON d.announcement_id = a.announcement_no
        LEFT JOIN competing_companies_agg cc ON cc.announcement_id = a.announcement_no
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
          announcement.documents.map(async (doc: any) => {
            let content = '';

            if (doc.markdown_path && doc.markdown_path.startsWith('gs://')) {
              try {
                content = await readMarkdownFromGCS(doc.markdown_path);
              } catch (error) {
                // Markdownファイルが存在しない場合でもページ全体は表示可能にする
                // 開発中なので詳細なエラー情報はログに出力
                console.error(`Failed to load markdown for document ${doc.id}:`, error);
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
   * Build WHERE clause from filters
   * bid_announcements テーブルのカラム名に対応
   */
  private buildWhereClause(filters: FilterParams): {
    whereClause: string;
    queryParams: any[];
    paramIndex: number;
  } {
    const whereClauses: string[] = [];
    const queryParams: any[] = [];
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
      filters.prefectures.forEach(p => queryParams.push(`%${p}%`));
      paramIndex += filters.prefectures.length;
    }

    if (filters.searchQuery && filters.searchQuery.trim()) {
      whereClauses.push(
        `("workName" ILIKE $${paramIndex} OR ` +
        `"topAgencyName" ILIKE $${paramIndex} OR ` +
        `category ILIKE $${paramIndex})`
      );
      queryParams.push(`%${filters.searchQuery}%`);
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
   * Build ORDER BY clause
   * bid_announcements テーブルのカラム名に対応
   */
  private buildOrderByClause(sortField?: string, sortOrder?: string): string {
    if (!sortField) return '';

    const direction = sortOrder === 'desc' ? 'DESC' : 'ASC';
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

    if (fieldMap[sortField]) {
      return `ORDER BY ${fieldMap[sortField]} ${direction} NULLS LAST`;
    }

    return '';
  }
}
