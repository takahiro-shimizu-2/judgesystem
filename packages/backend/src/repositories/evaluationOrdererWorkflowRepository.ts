import { PoolClient } from "pg";
import { pool, schemaPrefix, TABLES } from "../config/database";

export type WorkflowMemoTag = "question" | "answer" | "memo" | "idea" | "evaluation";

export interface OrdererWorkflowMemo {
  id: string;
  createdAt: string;
  updatedAt?: string;
  content: string;
  tag: WorkflowMemoTag;
  parentId?: string;
}

export interface OrdererWorkflowDocument {
  id: string;
  name: string;
  status: "pending" | "submitted";
  dueDate?: string;
  uploadedAt?: string;
  fileName?: string;
  contentType?: string;
  dataUrl?: string;
  size?: number;
}

export interface OrdererWorkflowTranscription {
  id: string;
  createdAt: string;
  updatedAt?: string;
  content: string;
}

export interface OrdererWorkflowState {
  callMemos: OrdererWorkflowMemo[];
  evaluations: OrdererWorkflowMemo[];
  preSubmitDocs: OrdererWorkflowDocument[];
  transcriptions: OrdererWorkflowTranscription[];
}

const VALID_MEMO_TAGS: WorkflowMemoTag[] = [
  "question",
  "answer",
  "memo",
  "idea",
  "evaluation",
];

export class EvaluationOrdererWorkflowRepository {
  private readonly tableName = `${schemaPrefix}${TABLES.evaluationOrdererWorkflowStates}`;
  private ensureTablePromise: Promise<void> | null = null;

  private createEmptyState(): OrdererWorkflowState {
    return {
      callMemos: [],
      evaluations: [],
      preSubmitDocs: [],
      transcriptions: [],
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

  private async ensureTable(): Promise<void> {
    if (!this.ensureTablePromise) {
      this.ensureTablePromise = this.query(
        `
        CREATE TABLE IF NOT EXISTS ${this.tableName} (
          evaluation_no TEXT PRIMARY KEY,
          state JSONB NOT NULL DEFAULT '{}'::jsonb,
          "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
        `
      ).then(() => undefined);
    }

    return this.ensureTablePromise;
  }

  private normalizeString(value: unknown): string | undefined {
    if (typeof value !== "string") {
      return undefined;
    }
    const trimmed = value.trim();
    return trimmed ? trimmed : undefined;
  }

  private normalizeMemo(raw: any): OrdererWorkflowMemo | null {
    const id = this.normalizeString(raw?.id);
    const createdAt = this.normalizeString(raw?.createdAt);
    const content = this.normalizeString(raw?.content);
    const tag = VALID_MEMO_TAGS.includes(raw?.tag) ? raw.tag : undefined;

    if (!id || !createdAt || !content || !tag) {
      return null;
    }

    return {
      id,
      createdAt,
      content,
      tag,
      updatedAt: this.normalizeString(raw?.updatedAt),
      parentId: this.normalizeString(raw?.parentId),
    };
  }

  private normalizeDocument(raw: any): OrdererWorkflowDocument | null {
    const id = this.normalizeString(raw?.id);
    const name = this.normalizeString(raw?.name);
    if (!id || !name) {
      return null;
    }

    const status = raw?.status === "pending" ? "pending" : "submitted";
    const size = typeof raw?.size === "number" && Number.isFinite(raw.size) ? raw.size : undefined;

    return {
      id,
      name,
      status,
      dueDate: this.normalizeString(raw?.dueDate),
      uploadedAt: this.normalizeString(raw?.uploadedAt),
      fileName: this.normalizeString(raw?.fileName),
      contentType: this.normalizeString(raw?.contentType),
      dataUrl: this.normalizeString(raw?.dataUrl),
      size,
    };
  }

  private normalizeTranscription(raw: any): OrdererWorkflowTranscription | null {
    const id = this.normalizeString(raw?.id);
    const createdAt = this.normalizeString(raw?.createdAt);
    const content = this.normalizeString(raw?.content);

    if (!id || !createdAt || !content) {
      return null;
    }

    return {
      id,
      createdAt,
      content,
      updatedAt: this.normalizeString(raw?.updatedAt),
    };
  }

  private normalizeState(raw: any): OrdererWorkflowState {
    const emptyState = this.createEmptyState();

    return {
      callMemos: Array.isArray(raw?.callMemos)
        ? raw.callMemos.map((item: any) => this.normalizeMemo(item)).filter(Boolean)
        : emptyState.callMemos,
      evaluations: Array.isArray(raw?.evaluations)
        ? raw.evaluations.map((item: any) => this.normalizeMemo(item)).filter(Boolean)
        : emptyState.evaluations,
      preSubmitDocs: Array.isArray(raw?.preSubmitDocs)
        ? raw.preSubmitDocs.map((item: any) => this.normalizeDocument(item)).filter(Boolean)
        : emptyState.preSubmitDocs,
      transcriptions: Array.isArray(raw?.transcriptions)
        ? raw.transcriptions.map((item: any) => this.normalizeTranscription(item)).filter(Boolean)
        : emptyState.transcriptions,
    };
  }

  async findByEvaluation(evaluationNo: string): Promise<OrdererWorkflowState> {
    await this.ensureTable();

    const rows = await this.query<{ state: unknown }>(
      `
      SELECT state
      FROM ${this.tableName}
      WHERE evaluation_no = $1
      `,
      [evaluationNo]
    );

    if (rows.length === 0) {
      return this.createEmptyState();
    }

    return this.normalizeState(rows[0]?.state);
  }

  async upsert(evaluationNo: string, state: OrdererWorkflowState): Promise<OrdererWorkflowState> {
    await this.ensureTable();

    const normalizedState = this.normalizeState(state);
    const rows = await this.query<{ state: unknown }>(
      `
      INSERT INTO ${this.tableName} (evaluation_no, state, "updatedAt")
      VALUES ($1, $2::jsonb, NOW())
      ON CONFLICT (evaluation_no)
      DO UPDATE SET
        state = EXCLUDED.state,
        "updatedAt" = NOW()
      RETURNING state
      `,
      [evaluationNo, JSON.stringify(normalizedState)]
    );

    if (rows.length === 0) {
      throw new Error("Failed to save orderer workflow state");
    }

    return this.normalizeState(rows[0]?.state);
  }
}
