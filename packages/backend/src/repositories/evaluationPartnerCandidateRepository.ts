import { PoolClient } from "pg";
import { pool, schemaPrefix, TABLES } from "../config/database";

export interface EvaluationPartnerCandidateRecord {
  id: string;
  evaluationNo: string;
  partnerId: string;
  partnerName: string;
  contactPerson: string | null;
  phone: string | null;
  email: string | null;
  fax: string | null;
  status: string;
  surveyApproved: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateEvaluationPartnerCandidateInput {
  partnerId: string;
  partnerName: string;
  contactPerson?: string | null;
  phone?: string | null;
  email?: string | null;
  fax?: string | null;
}

export interface UpdateEvaluationPartnerCandidateInput {
  partnerName?: string;
  contactPerson?: string | null;
  phone?: string | null;
  email?: string | null;
  fax?: string | null;
  status?: string;
  surveyApproved?: boolean;
}

export class EvaluationPartnerCandidateRepository {
  private readonly tableName = `${schemaPrefix}${TABLES.evaluationCompanyCandidates}`;

  private mapRow(row: any): EvaluationPartnerCandidateRecord {
    return {
      id: String(row.id),
      evaluationNo: row.evaluation_no?.toString() ?? "",
      partnerId: row.partner_id ? String(row.partner_id) : "",
      partnerName: row.partner_name ?? "",
      contactPerson: row.contact_person ?? null,
      phone: row.phone ?? null,
      email: row.email ?? null,
      fax: row.fax ?? null,
      status: row.status ?? "not_called",
      surveyApproved: Boolean(row.survey_approved),
      createdAt: row.created_at?.toISOString?.() ?? row.created_at ?? "",
      updatedAt: row.updated_at?.toISOString?.() ?? row.updated_at ?? "",
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

  async findByEvaluation(evaluationNo: string): Promise<EvaluationPartnerCandidateRecord[]> {
    const sql = `
      SELECT
        id,
        evaluation_no,
        partner_id,
        partner_name,
        contact_person,
        phone,
        email,
        fax,
        status,
        survey_approved,
        created_at,
        updated_at
      FROM ${this.tableName}
      WHERE evaluation_no::text = $1
      ORDER BY created_at ASC, id ASC
    `;
    const rows = await this.query(sql, [evaluationNo]);
    return rows.map((row) => this.mapRow(row));
  }

  async create(
    evaluationNo: string,
    input: CreateEvaluationPartnerCandidateInput
  ): Promise<EvaluationPartnerCandidateRecord> {
    const sql = `
      INSERT INTO ${this.tableName} (
        evaluation_no,
        partner_id,
        partner_name,
        contact_person,
        phone,
        email,
        fax,
        status,
        survey_approved,
        created_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, 'not_called', false, NOW(), NOW())
      RETURNING
        id,
        evaluation_no,
        partner_id,
        partner_name,
        contact_person,
        phone,
        email,
        fax,
        status,
        survey_approved,
        created_at,
        updated_at
    `;

    const rows = await this.query(sql, [
      evaluationNo,
      input.partnerId,
      input.partnerName,
      input.contactPerson ?? null,
      input.phone ?? null,
      input.email ?? null,
      input.fax ?? null,
    ]);

    if (rows.length === 0) {
      throw new Error("Failed to create partner candidate");
    }

    return this.mapRow(rows[0]);
  }

  async update(
    evaluationNo: string,
    candidateId: string,
    updates: UpdateEvaluationPartnerCandidateInput
  ): Promise<EvaluationPartnerCandidateRecord | null> {
    const fields: string[] = [];
    const params: any[] = [];

    if (updates.partnerName !== undefined) {
      params.push(updates.partnerName);
      fields.push(`partner_name = $${params.length}`);
    }
    if (updates.contactPerson !== undefined) {
      params.push(updates.contactPerson);
      fields.push(`contact_person = $${params.length}`);
    }
    if (updates.phone !== undefined) {
      params.push(updates.phone);
      fields.push(`phone = $${params.length}`);
    }
    if (updates.email !== undefined) {
      params.push(updates.email);
      fields.push(`email = $${params.length}`);
    }
    if (updates.fax !== undefined) {
      params.push(updates.fax);
      fields.push(`fax = $${params.length}`);
    }
    if (updates.status !== undefined) {
      params.push(updates.status);
      fields.push(`status = $${params.length}`);
    }
    if (updates.surveyApproved !== undefined) {
      params.push(updates.surveyApproved);
      fields.push(`survey_approved = $${params.length}`);
    }

    if (fields.length === 0) {
      return await this.findOne(evaluationNo, candidateId);
    }

    params.push(evaluationNo);
    params.push(candidateId);

    const sql = `
      UPDATE ${this.tableName}
      SET ${fields.join(", ")}, updated_at = NOW()
      WHERE evaluation_no::text = $${params.length - 1}
        AND id::text = $${params.length}
      RETURNING
        id,
        evaluation_no,
        partner_id,
        partner_name,
        contact_person,
        phone,
        email,
        fax,
        status,
        survey_approved,
        created_at,
        updated_at
    `;

    const rows = await this.query(sql, params);
    if (rows.length === 0) {
      return null;
    }

    return this.mapRow(rows[0]);
  }

  async delete(evaluationNo: string, candidateId: string): Promise<boolean> {
    const sql = `
      DELETE FROM ${this.tableName}
      WHERE evaluation_no::text = $1 AND id::text = $2
    `;

    let client: PoolClient | undefined;
    try {
      client = await pool.connect();
      const result = await client.query(sql, [evaluationNo, candidateId]);
      const rowCount = result.rowCount ?? 0;
      return rowCount > 0;
    } finally {
      client?.release();
    }
  }

  private async findOne(evaluationNo: string, candidateId: string): Promise<EvaluationPartnerCandidateRecord | null> {
    const sql = `
      SELECT
        id,
        evaluation_no,
        partner_id,
        partner_name,
        contact_person,
        phone,
        email,
        fax,
        status,
        survey_approved,
        created_at,
        updated_at
      FROM ${this.tableName}
      WHERE evaluation_no::text = $1 AND id::text = $2
      LIMIT 1
    `;
    const rows = await this.query(sql, [evaluationNo, candidateId]);
    if (rows.length === 0) {
      return null;
    }
    return this.mapRow(rows[0]);
  }
}
