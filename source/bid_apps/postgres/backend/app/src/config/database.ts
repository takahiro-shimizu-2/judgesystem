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

  // Pool optimization for scalability
  config.max = parseInt(process.env.PG_POOL_MAX || "20", 10);
  config.min = parseInt(process.env.PG_POOL_MIN || "5", 10);
  config.idleTimeoutMillis = parseInt(process.env.PG_IDLE_TIMEOUT || "30000", 10);
  config.connectionTimeoutMillis = parseInt(process.env.PG_CONNECT_TIMEOUT || "5000", 10);

  return config;
};

export const pool = new Pool(buildPoolConfig());

export const TABLES = {
  orderers: "bid_orderers",
  contacts: "workflow_contacts",
  partners: "partners_master",
  partnerCategories: "partners_categories",
  partnerPastProjects: "partners_past_projects",
  partnerBranches: "partners_branches",
  partnerQualificationsUnified: "partners_qualifications_unified",
  partnerQualificationsOrderers: "partners_qualifications_orderers",
  partnerQualificationsOrdererItems: "partners_qualifications_orderer_items",
  evaluationStatuses: "backend_evaluation_statuses",
  evaluationAssignees: "evaluation_assignees",
  evaluationOrdererWorkflowStates: "evaluation_orderer_workflow_states",
  companyMaster: "company_master",
  officeMaster: "office_master",
} as const;

export const schemaPrefix = process.env.PG_SCHEMA ? `${process.env.PG_SCHEMA}.` : "";
