import { PoolClient } from "pg";
import { pool, schemaPrefix, TABLES } from "../config/database";

export interface EvaluationAssigneeRecord {
  evaluationNo: string;
  stepId: string;
  staffId: string;
  assignedAt: string | null;
}

export class EvaluationAssignmentRepository {
  private readonly tableName = `${schemaPrefix}${TABLES.evaluationAssignees}`;

  private mapRow(row: any): EvaluationAssigneeRecord {
    return {
      evaluationNo: row.evaluationNo ?? row.evaluation_no ?? "",
      stepId: row.stepId ?? row.step_id ?? "",
      staffId: row.staffId ?? row.contact_id ?? "",
      assignedAt: row.assignedAt ?? row.assigned_at ?? null,
    };
  }

  private async query<T = EvaluationAssigneeRecord>(sql: string, params: any[] = []): Promise<T[]> {
    let client: PoolClient | undefined;
    try {
      client = await pool.connect();
      const result = await client.query(sql, params);
      return result.rows as T[];
    } finally {
      client?.release();
    }
  }

  async findByEvaluation(evaluationNo: string): Promise<EvaluationAssigneeRecord[]> {
    const sql = `
      SELECT
        evaluation_no::text AS "evaluationNo",
        step_id AS "stepId",
        contact_id::text AS "staffId",
        assigned_at AS "assignedAt"
      FROM ${this.tableName}
      WHERE evaluation_no::text = $1
      ORDER BY step_id
    `;
    const rows = await this.query(sql, [evaluationNo]);
    return rows.map((row) => this.mapRow(row));
  }

  async upsert(
    evaluationNo: string,
    stepId: string,
    staffId: string
  ): Promise<EvaluationAssigneeRecord> {
    const sql = `
      INSERT INTO ${this.tableName} (evaluation_no, step_id, contact_id, assigned_at)
      VALUES ($1, $2, $3::uuid, NOW())
      ON CONFLICT (evaluation_no, step_id)
      DO UPDATE SET contact_id = EXCLUDED.contact_id, assigned_at = NOW()
      RETURNING
        evaluation_no::text AS "evaluationNo",
        step_id AS "stepId",
        contact_id::text AS "staffId",
        assigned_at AS "assignedAt"
    `;
    const rows = await this.query(sql, [evaluationNo, stepId, staffId]);
    if (rows.length === 0) {
      throw new Error("Failed to upsert evaluation assignee");
    }
    return this.mapRow(rows[0]);
  }

  async delete(evaluationNo: string, stepId: string): Promise<void> {
    const sql = `
      DELETE FROM ${this.tableName}
      WHERE evaluation_no::text = $1 AND step_id = $2
    `;
    await this.query(sql, [evaluationNo, stepId]);
  }
}
