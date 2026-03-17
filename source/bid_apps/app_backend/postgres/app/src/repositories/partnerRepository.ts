import { pool, TABLES, schemaPrefix } from "../config/database";

export class PartnerRepository {
  /**
   * Get all partners
   */
  async findAll(): Promise<any[]> {
    const client = await pool.connect();
    try {
      const result = await client.query(
        `SELECT * FROM ${schemaPrefix}${TABLES.partners} ORDER BY "no"`
      );
      return result.rows;
    } finally {
      client.release();
    }
  }

  /**
   * Find single partner by ID
   */
  async findById(id: string): Promise<any | null> {
    const client = await pool.connect();
    try {
      const result = await client.query(
        `SELECT * FROM ${schemaPrefix}${TABLES.partners} WHERE id = $1`,
        [id]
      );
      return result.rowCount === 0 ? null : result.rows[0];
    } finally {
      client.release();
    }
  }
}
