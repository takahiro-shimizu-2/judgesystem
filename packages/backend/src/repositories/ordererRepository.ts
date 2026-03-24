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
  private readonly orderersTable = `${schemaPrefix}${TABLES.orderers}`;
  private readonly announcementsTable = `${schemaPrefix}bid_announcements`;

  private buildBaseQuery(whereClause = ""): string {
    return `
      WITH orderer_departments AS (
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
        bo.orderer_id AS id,
        COALESCE(
          bo."no",
          ROW_NUMBER() OVER (ORDER BY bo.orderer_id)
        )::integer AS "no",
        COALESCE(bo.name, '') AS name,
        COALESCE(bo.category, 'other') AS category,
        COALESCE(bo.address, '') AS address,
        COALESCE(bo.phone, '') AS phone,
        COALESCE(bo.fax, '') AS fax,
        COALESCE(bo.email, '') AS email,
        COALESCE(dept.departments, '[]'::jsonb) AS departments,
        COALESCE(bo.announcementcount, 0)::integer AS "announcementCount",
        COALESCE(bo.awardcount, 0)::integer AS "awardCount",
        COALESCE(bo.averageamount, 0)::double precision AS "averageAmount",
        COALESCE(bo.lastannouncementdate::text, '') AS "lastAnnouncementDate"
      FROM ${this.orderersTable} AS bo
      LEFT JOIN orderer_departments AS dept
        ON dept.orderer_id = bo.orderer_id
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
      ${this.buildBaseQuery("WHERE bo.orderer_id IS NOT NULL")}
      ORDER BY "no"
    `;
    const rows = await this.executeQuery(query);
    return rows.map((row) => this.mapRow(row));
  }

  async findById(id: string): Promise<Orderer | null> {
    const query = `
      ${this.buildBaseQuery("WHERE bo.orderer_id = $1")}
      LIMIT 1
    `;
    const rows = await this.executeQuery(query, [id]);
    if (rows.length === 0) {
      return null;
    }
    return this.mapRow(rows[0]);
  }
}
