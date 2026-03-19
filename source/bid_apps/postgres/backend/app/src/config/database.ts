import { Pool, PoolConfig } from "pg";

const shouldEnableSsl = (): boolean => {
  const flag = (process.env.PGSSLMODE ?? process.env.PGSSL ?? "").toLowerCase();
  return flag === "require" || flag === "true";
};

const buildPoolConfig = (): PoolConfig => {
  const config: PoolConfig = process.env.DATABASE_URL
    ? { connectionString: process.env.DATABASE_URL }
    : {
        host: process.env.PGHOST ?? "127.0.0.1",
        port: Number(process.env.PGPORT ?? "5432"),
        database: process.env.PGDATABASE ?? "postgres",
        user: process.env.PGUSER ?? "postgres",
        password: process.env.PGPASSWORD,
      };

  if (shouldEnableSsl()) {
    config.ssl = {
      rejectUnauthorized:
        (process.env.PGSSL_REJECT_UNAUTHORIZED ?? "false").toLowerCase() === "true",
    };
  }

  return config;
};

export const pool = new Pool(buildPoolConfig());

export const TABLES = {
  evaluations: "backend_evaluations",
  companies: "backend_companies",
  orderers: "backend_orderers",
  partners: "backend_partners",
  evaluationStatuses: "backend_evaluation_statuses",
} as const;

export type TableName = (typeof TABLES)[keyof typeof TABLES];

export const schemaPrefix = process.env.PG_SCHEMA ? `${process.env.PG_SCHEMA}.` : "";
