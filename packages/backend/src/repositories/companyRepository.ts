import { PoolClient } from "pg";
import { pool, schemaPrefix, TABLES } from "../config/database";

export interface CompanyInput {
  name: string;
  address: string;
  phone: string;
  email: string;
  fax: string;
  postalCode: string;
  representative: string;
  established: string;
  capital: string;
  employeeCount: string;
}

export interface CompanyRecord {
  id: string;
  no: number;
  name: string;
  address: string;
  grade: string;
  priority: number;
  phone: string;
  email: string;
  fax: string;
  postalCode: string;
  representative: string;
  established: string;
  capital: number;
  employeeCount: number;
  branches: { name: string; address: string }[];
  certifications: string[];
}

export class CompanyRepository {
  private readonly companyTable = `${schemaPrefix}${TABLES.companyMaster}`;
  private readonly officeTable = `${schemaPrefix}${TABLES.officeMaster}`;

  private buildBaseQuery(whereClause = ""): string {
    return `
      WITH branches AS (
        SELECT
          company_no,
          jsonb_agg(
            jsonb_build_object(
              'name', COALESCE(office_name, ''),
              'address', COALESCE(office_address, '')
            ) ORDER BY office_no
          ) AS branches
        FROM ${this.officeTable}
        GROUP BY company_no
      )
      SELECT
        concat('com-', comp.company_no::text) AS id,
        comp.company_no::integer AS no,
        COALESCE(comp.company_name, '') AS name,
        COALESCE(comp.company_address, '') AS address,
        'A' AS grade,
        5 AS priority,
        COALESCE(comp.telephone, '') AS phone,
        COALESCE(comp.email, '') AS email,
        COALESCE(comp.fax, '') AS fax,
        COALESCE(comp.postal_code, '') AS "postalCode",
        COALESCE(comp.name_of_representative, '') AS representative,
        COALESCE(comp.establishment_date::text, '') AS established,
        (
          CASE
            WHEN TRIM(comp.capital::text) ~ '^[0-9]+(\\.[0-9]+)?$'
              THEN TRIM(comp.capital::text)::numeric
            ELSE 0::numeric
          END
        )::double precision AS capital,
        0::integer AS "employeeCount",
        COALESCE(br.branches, '[]'::jsonb) AS branches,
        '[]'::jsonb AS certifications
      FROM ${this.companyTable} comp
      LEFT JOIN branches br
        ON br.company_no = comp.company_no
      WHERE COALESCE(comp.is_active, true)
      ${whereClause}
    `;
  }

  private mapRow(row: any): CompanyRecord {
    return {
      id: row.id ?? "",
      no: Number(row.no) || 0,
      name: row.name ?? "",
      address: row.address ?? "",
      grade: row.grade ?? "A",
      priority: Number(row.priority) || 5,
      phone: row.phone ?? "",
      email: row.email ?? "",
      fax: row.fax ?? "",
      postalCode: row.postalCode ?? "",
      representative: row.representative ?? "",
      established: row.established ?? "",
      capital: Number(row.capital) || 0,
      employeeCount: Number(row.employeeCount) || 0,
      branches: Array.isArray(row.branches) ? row.branches : [],
      certifications: Array.isArray(row.certifications) ? row.certifications : [],
    };
  }

  private async query<T = any>(sql: string, params: any[] = []): Promise<T[]> {
    let client: PoolClient | undefined;
    try {
      client = await pool.connect();
      const result = await client.query(sql, params);
      return result.rows as T[];
    } finally {
      client?.release();
    }
  }

  async findAll(): Promise<CompanyRecord[]> {
    const sql = `${this.buildBaseQuery()} ORDER BY comp.company_no`;
    const rows = await this.query(sql);
    return rows.map((row) => this.mapRow(row));
  }

  async findById(id: string): Promise<CompanyRecord | null> {
    // id format: "com-123" or just "123"
    const companyNo = id.startsWith("com-") ? id.slice(4) : id;
    const sql = `${this.buildBaseQuery("AND comp.company_no::text = $1")} LIMIT 1`;
    const rows = await this.query(sql, [companyNo]);
    if (rows.length === 0) return null;
    return this.mapRow(rows[0]);
  }

  async create(input: CompanyInput): Promise<CompanyRecord> {
    const sql = `
      INSERT INTO ${this.companyTable} (
        company_no, company_name, company_address, telephone, email, fax,
        postal_code, name_of_representative, establishment_date, capital,
        created_date, updated_date
      ) VALUES (
        (SELECT COALESCE(MAX(company_no), 0) + 1 FROM ${this.companyTable}),
        $1, $2, $3, $4, $5, $6, $7, $8, $9,
        NOW()::text, NOW()::text
      )
      RETURNING company_no::text AS id
    `;
    const rows = await this.query<{ id: string }>(sql, [
      input.name, input.address, input.phone, input.email, input.fax,
      input.postalCode, input.representative, input.established, input.capital,
    ]);
    const createdId = rows[0]?.id;
    if (!createdId) throw new Error("Failed to create company");
    const record = await this.findById(createdId);
    if (!record) throw new Error("Failed to load created company");
    return record;
  }

  async update(id: string, input: Partial<CompanyInput>): Promise<CompanyRecord | null> {
    const companyNo = id.startsWith("com-") ? id.slice(4) : id;
    const fieldMap: Record<string, string> = {
      name: "company_name",
      address: "company_address",
      phone: "telephone",
      email: "email",
      fax: "fax",
      postalCode: "postal_code",
      representative: "name_of_representative",
      established: "establishment_date",
      capital: "capital",
      employeeCount: "employee_count",
    };

    const fields: string[] = [];
    const values: any[] = [];
    let index = 1;

    for (const [inputKey, dbColumn] of Object.entries(fieldMap)) {
      if ((input as any)[inputKey] !== undefined) {
        fields.push(`${dbColumn} = $${index + 1}`);
        values.push((input as any)[inputKey]);
        index += 1;
      }
    }

    if (fields.length === 0) {
      return await this.findById(id);
    }

    const sql = `
      UPDATE ${this.companyTable}
      SET ${fields.join(", ")}, updated_date = NOW()::text
      WHERE company_no::text = $1
      RETURNING company_no::text AS id
    `;
    const result = await this.query<{ id: string }>(sql, [companyNo, ...values]);
    if (result.length === 0) return null;
    return await this.findById(id);
  }

  async delete(id: string): Promise<boolean> {
    const companyNo = id.startsWith("com-") ? id.slice(4) : id;
    const sql = `
      UPDATE ${this.companyTable}
      SET is_active = FALSE, updated_date = NOW()::text
      WHERE company_no::text = $1
    `;
    const client = await pool.connect();
    try {
      const result = await client.query(sql, [companyNo]);
      return (result.rowCount ?? 0) > 0;
    } finally {
      client.release();
    }
  }
}
