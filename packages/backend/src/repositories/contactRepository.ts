import { PoolClient } from "pg";
import { pool, schemaPrefix, TABLES } from "../config/database";

export interface ContactInput {
  name: string;
  companyName: string;
  department: string;
  email: string;
  phone: string;
}

export interface ContactRecord extends ContactInput {
  id: string;
  no: number;
}

export class ContactRepository {
  private readonly tableName = `${schemaPrefix}${TABLES.contacts}`;

  private baseSelectQuery(): string {
    return `
      SELECT
        contact_id::text AS id,
        ROW_NUMBER() OVER (ORDER BY LOWER(name), contact_id) AS no,
        name,
        company_name,
        department,
        email,
        phone
      FROM ${this.tableName}
      WHERE COALESCE(is_active, true)
    `;
  }

  private mapRow(row: any): ContactRecord {
    return {
      id: row.id,
      no: Number(row.no) || 0,
      name: row.name ?? "",
      companyName: row.company_name ?? "",
      department: row.department ?? "",
      email: row.email ?? "",
      phone: row.phone ?? "",
    };
  }

  private async query<T = ContactRecord>(sql: string, params: any[] = []): Promise<T[]> {
    let client: PoolClient | undefined;
    try {
      client = await pool.connect();
      const result = await client.query(sql, params);
      return result.rows as T[];
    } finally {
      client?.release();
    }
  }

  async findAll(): Promise<ContactRecord[]> {
    const sql = `
      SELECT *
      FROM (${this.baseSelectQuery()}) contacts
      ORDER BY contacts.no
    `;
    const rows = await this.query(sql);
    return rows.map((row) => this.mapRow(row));
  }

  async findById(id: string): Promise<ContactRecord | null> {
    const sql = `
      SELECT *
      FROM (${this.baseSelectQuery()}) contacts
      WHERE contacts.id = $1
    `;
    const rows = await this.query(sql, [id]);
    if (rows.length === 0) {
      return null;
    }
    return this.mapRow(rows[0]);
  }

  async create(input: ContactInput): Promise<ContactRecord> {
    const sql = `
      INSERT INTO ${this.tableName} (name, company_name, department, email, phone)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING contact_id::text AS id
    `;
    const rows = await this.query<{ id: string }>(sql, [
      input.name,
      input.companyName,
      input.department,
      input.email,
      input.phone,
    ]);
    const createdId = rows[0]?.id;
    if (!createdId) {
      throw new Error("Failed to create contact");
    }
    const record = await this.findById(createdId);
    if (!record) {
      throw new Error("Failed to load created contact");
    }
    return record;
  }

  async update(id: string, input: Partial<ContactInput>): Promise<ContactRecord | null> {
    const fields: string[] = [];
    const values: any[] = [];
    let index = 1;

    (["name", "companyName", "department", "email", "phone"] as const).forEach((key) => {
      if (input[key] !== undefined) {
        const column = key === "companyName" ? "company_name" : key;
        fields.push(`${column} = $${index + 1}`);
        values.push(input[key]);
        index += 1;
      }
    });

    if (fields.length === 0) {
      return await this.findById(id);
    }

    const sql = `
      UPDATE ${this.tableName}
      SET ${fields.join(", ")}, updated_at = NOW()
      WHERE contact_id::text = $1
      RETURNING contact_id::text AS id
    `;
    const result = await this.query<{ id: string }>(sql, [id, ...values]);
    if (result.length === 0) {
      return null;
    }
    return await this.findById(id);
  }

  async delete(id: string): Promise<boolean> {
    const sql = `
      UPDATE ${this.tableName}
      SET is_active = FALSE, updated_at = NOW()
      WHERE contact_id::text = $1
    `;
    const client = await pool.connect();
    try {
      const result = await client.query(sql, [id]);
      return (result.rowCount ?? 0) > 0;
    } finally {
      client.release();
    }
  }
}
