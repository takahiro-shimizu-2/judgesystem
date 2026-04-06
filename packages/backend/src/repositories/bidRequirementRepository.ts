import { pool, schemaPrefix } from "../config/database";
import { DEFAULT_PAGE_SIZE } from "../constants";
import { escapeLikePattern } from "../utils/sql";
import { logger } from "../utils/logger";

export interface BidRequirementSearchResult {
  requirementNo: number;
  announcementNo: number;
  documentId: string;
  requirementType: string;
  requirementText: string;
  announcementTitle: string;
}

export class BidRequirementRepository {
  /**
   * Full-text search on bid_requirements.requirement_text using pg_bigm LIKE.
   * The gin_bigm_ops index on requirement_text accelerates the LIKE '%keyword%' pattern.
   */
  async searchByText(
    query: string,
    page: number,
    pageSize: number,
  ): Promise<{ data: BidRequirementSearchResult[]; total: number }> {
    const client = await pool.connect();
    try {
      const table = `${schemaPrefix}bid_requirements`;
      const announcementsTable = `${schemaPrefix}bid_announcements`;
      const escapedQuery = escapeLikePattern(query);

      const countResult = await client.query(
        `SELECT COUNT(*) AS total
         FROM ${table} br
         WHERE br.requirement_text LIKE '%' || $1 || '%'`,
        [escapedQuery],
      );
      const total = parseInt(countResult.rows[0].total, 10);

      const offset = page * pageSize;
      const result = await client.query(
        `SELECT
           br.requirement_no AS "requirementNo",
           br.announcement_no AS "announcementNo",
           br.document_id AS "documentId",
           COALESCE(br.requirement_type, '') AS "requirementType",
           br.requirement_text AS "requirementText",
           COALESCE(ba."workName", '') AS "announcementTitle"
         FROM ${table} br
         LEFT JOIN ${announcementsTable} ba
           ON ba.announcement_no = br.announcement_no
         WHERE br.requirement_text LIKE '%' || $1 || '%'
         ORDER BY br.announcement_no DESC, br.requirement_no ASC
         LIMIT $2 OFFSET $3`,
        [escapedQuery, pageSize, offset],
      );

      return { data: result.rows, total };
    } catch (err) {
      logger.error({ err, query }, "BidRequirementRepository.searchByText failed");
      throw err;
    } finally {
      client.release();
    }
  }
}
