import { PoolClient } from "pg";
import { pool, TABLES, schemaPrefix } from "../config/database";

export interface Orderer {
  id: string;
  no: number;
  name: string;
  category: string;
  address: string;
  phone: string;
  fax: string;
  email: string;
  departments: string[];
  announcementCount: number;
  awardCount: number;
  averageAmount: number;
  lastAnnouncementDate: string;
}

type OrdererQueryRow = {
  id: string | null;
  no: number | null;
  name: string | null;
  category: string | null;
  address: string | null;
  phone: string | null;
  fax: string | null;
  email: string | null;
  departments: string[] | null;
  announcementCount: number | null;
  awardCount: number | null;
  averageAmount: number | null;
  lastAnnouncementDate: string | null;
};

export class OrdererRepository {
  private readonly agencyTable = `${schemaPrefix}${TABLES.orderers}`;
  private readonly announcementsTable = `${schemaPrefix}bid_announcements`;

  private buildBaseQuery(whereClause = ""): string {
    return `
      WITH announcement_stats AS (
        SELECT
          orderer_id,
          COUNT(*)::integer AS announcement_count,
          MAX("publishDate") AS last_announcement_date
        FROM ${this.announcementsTable}
        WHERE orderer_id IS NOT NULL AND TRIM(orderer_id) <> ''
        GROUP BY orderer_id
      ),
      orderer_departments AS (
        SELECT
          orderer_id,
          jsonb_agg(department ORDER BY department) AS departments
        FROM (
          SELECT DISTINCT
            orderer_id,
            TRIM(department) AS department
          FROM ${this.announcementsTable}
          WHERE
            orderer_id IS NOT NULL
            AND TRIM(orderer_id) <> ''
            AND department IS NOT NULL
            AND TRIM(department) <> ''
        ) AS dept
        GROUP BY orderer_id
      )
      SELECT
        ag.agency_no::text AS id,
        ag.sort_order AS "no",
        COALESCE(ag.agency_name, '') AS name,
        CASE ag.agency_level
          WHEN 0 THEN 'national'
          WHEN 1 THEN 'prefecture'
          ELSE 'city'
        END AS category,
        COALESCE(ag.agency_area, '') AS address,
        '' AS phone,
        '' AS fax,
        '' AS email,
        COALESCE(dept.departments, '[]'::jsonb) AS departments,
        COALESCE(stats.announcement_count, 0) AS "announcementCount",
        0 AS "awardCount",
        0 AS "averageAmount",
        COALESCE(stats.last_announcement_date, '') AS "lastAnnouncementDate"
      FROM ${this.agencyTable} AS ag
      LEFT JOIN announcement_stats AS stats
        ON stats.orderer_id = ag.agency_name
      LEFT JOIN orderer_departments AS dept
        ON dept.orderer_id = ag.agency_name
      ${whereClause}
    `;
  }

  private mapRow(row: OrdererQueryRow): Orderer {
    return {
      id: row.id ?? "",
      no: row.no ?? 0,
      name: row.name ?? "",
      category: row.category ?? "other",
      address: row.address ?? "",
      phone: row.phone ?? "",
      fax: row.fax ?? "",
      email: row.email ?? "",
      departments: Array.isArray(row.departments) ? row.departments : [],
      announcementCount: row.announcementCount ?? 0,
      awardCount: row.awardCount ?? 0,
      averageAmount: row.averageAmount ?? 0,
      lastAnnouncementDate: row.lastAnnouncementDate ?? "",
    };
  }

  private async executeQuery(sql: string, params: any[] = []): Promise<OrdererQueryRow[]> {
    let client: PoolClient | undefined;
    try {
      client = await pool.connect();
      const result = await client.query(sql, params);
      return result.rows as OrdererQueryRow[];
    } finally {
      client?.release();
    }
  }

  async findAll(): Promise<Orderer[]> {
    const query = `
      ${this.buildBaseQuery()}
      ORDER BY "no"
    `;
    const rows = await this.executeQuery(query);
    return rows.map((row) => this.mapRow(row));
  }

  async findById(id: string): Promise<Orderer | null> {
    const query = `
      ${this.buildBaseQuery("WHERE ag.agency_no::text = $1")}
      LIMIT 1
    `;
    const rows = await this.executeQuery(query, [id]);
    if (rows.length === 0) {
      return null;
    }
    return this.mapRow(rows[0]);
  }
}
