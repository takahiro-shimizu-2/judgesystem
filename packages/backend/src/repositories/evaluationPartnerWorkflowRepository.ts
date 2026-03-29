import { PoolClient } from "pg";
import { pool, schemaPrefix, TABLES } from "../config/database";

export type WorkflowMemoTag = "question" | "answer" | "memo" | "idea" | "evaluation";

export interface PartnerWorkflowMemo {
  id: string;
  createdAt: string;
  updatedAt?: string;
  content: string;
  tag: WorkflowMemoTag;
  parentId?: string;
}

export interface PartnerWorkflowDocument {
  id: string;
  name: string;
  type: "sent" | "received";
  uploadedAt?: string;
  fileName?: string;
  contentType?: string;
  size?: number;
  fileId?: string;
}

export interface PartnerWorkflowTranscription {
  id: string;
  createdAt: string;
  updatedAt?: string;
  content: string;
}

export interface PartnerWorkflowEntry {
  callMemos: PartnerWorkflowMemo[];
  receivedDocuments: PartnerWorkflowDocument[];
  transcriptions: PartnerWorkflowTranscription[];
}

export interface PartnerWorkflowState {
  sentDocuments: PartnerWorkflowDocument[];
  partners: Record<string, PartnerWorkflowEntry>;
}

export class EvaluationPartnerWorkflowRepository {
  private readonly tableName = `${schemaPrefix}${TABLES.evaluationPartnerWorkflowStates}`;

  private createEmptyState(): PartnerWorkflowState {
    return {
      sentDocuments: [],
      partners: {},
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

  private normalizeString(value: unknown): string | undefined {
    if (typeof value !== "string") {
      return undefined;
    }
    const trimmed = value.trim();
    return trimmed ? trimmed : undefined;
  }

  private normalizeDocument(raw: any, defaultType: "sent" | "received" = "sent"): PartnerWorkflowDocument | null {
    const id = this.normalizeString(raw?.id);
    const name = this.normalizeString(raw?.name);
    if (!id || !name) {
      return null;
    }

    const size =
      typeof raw?.size === "number" && Number.isFinite(raw.size) && raw.size >= 0
        ? raw.size
        : undefined;

    const type: "sent" | "received" =
      raw?.type === "received" ? "received" : defaultType;

    return {
      id,
      name,
      type,
      uploadedAt: this.normalizeString(raw?.uploadedAt),
      fileName: this.normalizeString(raw?.fileName),
      contentType: this.normalizeString(raw?.contentType),
      size,
      fileId: this.normalizeString(raw?.fileId) ?? id,
    };
  }

  private normalizeMemo(raw: any): PartnerWorkflowMemo | null {
    const id = this.normalizeString(raw?.id);
    const createdAt = this.normalizeString(raw?.createdAt);
    const content = this.normalizeString(raw?.content);
    const validTags: WorkflowMemoTag[] = ["question", "answer", "memo", "idea", "evaluation"];
    const tag: WorkflowMemoTag = validTags.includes(raw?.tag)
      ? raw.tag
      : "memo";

    if (!id || !createdAt || !content) {
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

  private normalizeTranscription(raw: any): PartnerWorkflowTranscription | null {
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

  private normalizePartnerEntry(raw: any): PartnerWorkflowEntry {
    return {
      callMemos: Array.isArray(raw?.callMemos)
        ? raw.callMemos.map((memo: any) => this.normalizeMemo(memo)).filter(Boolean) as PartnerWorkflowMemo[]
        : [],
      receivedDocuments: Array.isArray(raw?.receivedDocuments)
        ? raw.receivedDocuments
            .map((doc: any) => this.normalizeDocument(doc, "received"))
            .filter(Boolean) as PartnerWorkflowDocument[]
        : [],
      transcriptions: Array.isArray(raw?.transcriptions)
        ? raw.transcriptions
            .map((transcription: any) => this.normalizeTranscription(transcription))
            .filter(Boolean) as PartnerWorkflowTranscription[]
        : [],
    };
  }

  private normalizeState(raw: any): PartnerWorkflowState {
    const emptyState = this.createEmptyState();

    return {
      sentDocuments: Array.isArray(raw?.sentDocuments)
        ? raw.sentDocuments.map((doc: any) => this.normalizeDocument(doc, "sent")).filter(Boolean)
        : emptyState.sentDocuments,
      partners:
        raw && typeof raw.partners === "object" && raw.partners !== null
          ? Object.entries(raw.partners).reduce<Record<string, PartnerWorkflowEntry>>((acc, [partnerId, entry]) => {
              if (typeof partnerId === "string" && partnerId.trim()) {
                acc[partnerId] = this.normalizePartnerEntry(entry);
              }
              return acc;
            }, {})
          : emptyState.partners,
    };
  }

  async findByEvaluation(evaluationNo: string): Promise<PartnerWorkflowState> {
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

  async upsert(
    evaluationNo: string,
    state: PartnerWorkflowState
  ): Promise<PartnerWorkflowState> {
    const normalizedState = this.normalizeState(state);
    const rows = await this.query<{ state: unknown }>(
      `
      INSERT INTO ${this.tableName} (evaluation_no, state, updated_at)
      VALUES ($1, $2::jsonb, NOW())
      ON CONFLICT (evaluation_no)
      DO UPDATE SET
        state = EXCLUDED.state,
        updated_at = NOW()
      RETURNING state
      `,
      [evaluationNo, JSON.stringify(normalizedState)]
    );

    if (rows.length === 0) {
      throw new Error("Failed to save partner workflow state");
    }

    return this.normalizeState(rows[0]?.state);
  }
}
