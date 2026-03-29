import { pool, schemaPrefix } from "../config/database";

export type PartnerFileFlowType = "sent" | "received";

export interface PartnerFileRecord {
  id: string;
  evaluationNo: string;
  partnerId: string | null;
  flowType: PartnerFileFlowType;
  name: string;
  contentType: string | null;
  size: number;
  data: Buffer;
}

export interface PartnerFileMetadata {
  id: string;
  evaluationNo: string;
  partnerId: string | null;
  flowType: PartnerFileFlowType;
  name: string;
  contentType: string | null;
  size: number;
}

interface CreatePartnerFileParams {
  evaluationNo: string;
  partnerId?: string | null;
  flowType: PartnerFileFlowType;
  name: string;
  contentType?: string | null;
  size: number;
  data: Buffer;
}

export class EvaluationPartnerFileRepository {
  private readonly tableName = `${schemaPrefix}evaluation_partner_files`;

  async create(params: CreatePartnerFileParams): Promise<PartnerFileMetadata> {
    const { evaluationNo, partnerId = null, flowType, name, contentType = null, size, data } = params;

    const result = await pool.query<PartnerFileMetadata>(
      `
      INSERT INTO ${this.tableName} (evaluation_no, partner_id, flow_type, name, content_type, size, data)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id, evaluation_no AS "evaluationNo", partner_id AS "partnerId", flow_type AS "flowType",
        name, content_type AS "contentType", size
      `,
      [evaluationNo, partnerId, flowType, name, contentType, size, data]
    );

    return result.rows[0];
  }

  async findById(evaluationNo: string, fileId: string): Promise<PartnerFileRecord | null> {
    const result = await pool.query<PartnerFileRecord>(
      `
      SELECT
        id,
        evaluation_no AS "evaluationNo",
        partner_id AS "partnerId",
        flow_type AS "flowType",
        name,
        content_type AS "contentType",
        size,
        data
      FROM ${this.tableName}
      WHERE evaluation_no = $1 AND id = $2
      `,
      [evaluationNo, fileId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return result.rows[0];
  }

  async delete(evaluationNo: string, fileId: string): Promise<boolean> {
    const result = await pool.query(
      `
      DELETE FROM ${this.tableName}
      WHERE evaluation_no = $1 AND id = $2
      `,
      [evaluationNo, fileId]
    );
    return (result.rowCount ?? 0) > 0;
  }
}
