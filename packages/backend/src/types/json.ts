/**
 * Generic JSON value type for JSONB columns returned by PostgreSQL.
 *
 * Used where the database returns jsonb_build_object / jsonb_agg results
 * that are consumed opaquely by the frontend.
 */
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };
