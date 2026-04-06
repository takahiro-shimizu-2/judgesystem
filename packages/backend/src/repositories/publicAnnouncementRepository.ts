import { pool, schemaPrefix } from "../config/database";
import { DEFAULT_PAGE_SIZE } from "../constants";
import type { AnnouncementFilterParams, SortOption } from "../types";
import { escapeLikePattern } from "../utils/sql";

/**
 * 公開API用の入札案件型。
 * 一般公開しても安全なフィールドのみを含む。
 * company/evaluation/internal データへの参照は一切含まない。
 */
export interface PublicAnnouncementListItem {
  announcementNo: number;
  title: string;
  organization: string;
  category: string;
  bidType: string;
  workLocation: string;
  publishDate: string;
  deadline: string;
  status: string;
}

/**
 * 公開API専用のリポジトリ。
 *
 * セキュリティ原則:
 * - bid_announcements テーブルのみを参照する（他テーブルへの JOIN なし）
 * - 返却フィールドは PublicAnnouncementListItem で明示的に制限
 * - company_bid_judgement, companies, office_master 等への参照は禁止
 */
export class PublicAnnouncementRepository {
  async findWithFilters(
    filters: AnnouncementFilterParams,
  ): Promise<{ data: PublicAnnouncementListItem[]; total: number }> {
    const client = await pool.connect();
    try {
      const conditions: string[] = [];
      const params: unknown[] = [];
      let paramIndex = 1;

      // 検索クエリ（タイトル・発注者名のみ）
      if (filters.searchQuery) {
        const escaped = escapeLikePattern(filters.searchQuery);
        conditions.push(
          `("workName" ILIKE '%' || $${paramIndex} || '%' OR "topAgencyName" ILIKE '%' || $${paramIndex} || '%')`,
        );
        params.push(escaped);
        paramIndex++;
      }

      // ステータスフィルタ
      if (filters.statuses?.length) {
        // ステータスは計算フィールドなので HAVING 相当が必要だが、
        // サブクエリで対応するか、ここでは bidEndDate ベースのフィルタに変換
        // 簡易実装: ステータスフィルタは一覧取得後にアプリ側で適用
      }

      // 入札種別フィルタ
      if (filters.bidTypes?.length) {
        conditions.push(`"bidType" = ANY($${paramIndex}::text[])`);
        params.push(filters.bidTypes);
        paramIndex++;
      }

      // カテゴリフィルタ
      if (filters.categories?.length) {
        conditions.push(`category = ANY($${paramIndex}::text[])`);
        params.push(filters.categories);
        paramIndex++;
      }

      // 発注者フィルタ
      if (filters.organizations?.length) {
        conditions.push(`"topAgencyName" = ANY($${paramIndex}::text[])`);
        params.push(filters.organizations);
        paramIndex++;
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

      // 件数取得
      const countResult = await client.query(
        `SELECT COUNT(*) AS count FROM ${schemaPrefix}bid_announcements ${whereClause}`,
        params,
      );
      const total = parseInt(countResult.rows[0].count, 10);

      // ページネーション
      const page = filters.page || 0;
      const pageSize = filters.pageSize || DEFAULT_PAGE_SIZE;
      const offset = page * pageSize;

      // 公開フィールドのみ SELECT — private テーブルへの JOIN なし
      const dataResult = await client.query(
        `SELECT
           announcement_no AS "announcementNo",
           COALESCE("workName", '') AS title,
           COALESCE("topAgencyName", '') AS organization,
           COALESCE(category, '') AS category,
           COALESCE("bidType", 'unknown') AS "bidType",
           COALESCE("workPlace", '') AS "workLocation",
           COALESCE("publishDate", '') AS "publishDate",
           COALESCE("bidEndDate", '') AS deadline,
           CASE
             WHEN "bidEndDate" IS NULL OR "bidEndDate" !~ '^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$'
               THEN 'closed'
             WHEN "bidEndDate" >= TO_CHAR(CURRENT_DATE + INTERVAL '14 days', 'YYYY-MM-DD')
               THEN 'upcoming'
             WHEN "bidEndDate" >= TO_CHAR(CURRENT_DATE, 'YYYY-MM-DD')
               THEN 'ongoing'
             ELSE 'awaiting_result'
           END AS status
         FROM ${schemaPrefix}bid_announcements
         ${whereClause}
         ORDER BY announcement_no DESC
         LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
        [...params, pageSize, offset],
      );

      return { data: dataResult.rows, total };
    } finally {
      client.release();
    }
  }
}
