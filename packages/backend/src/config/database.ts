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

export const pool = new Pool({
  ...buildPoolConfig(),
  max: Number(process.env.PG_POOL_MAX ?? "20"),
  min: Number(process.env.PG_POOL_MIN ?? "5"),
  idleTimeoutMillis: Number(process.env.PG_IDLE_TIMEOUT ?? "30000"),
  connectionTimeoutMillis: Number(process.env.PG_CONNECT_TIMEOUT ?? "5000"),
});

export const TABLES = {
  orderers: "agency_master",
  contacts: "workflow_contacts",
  companies: "companies",
  companyCategories: "companies_categories",
  companyPastProjects: "companies_past_projects",
  companyBranches: "companies_branches",
  companyQualificationsUnified: "companies_qualifications_unified",
  companyQualificationsOrderers: "companies_qualifications_orderers",
  companyQualificationsOrdererItems: "companies_qualifications_orderer_items",
  companyDisqualifications: "company_disqualifications",
  evaluationStatuses: "backend_evaluation_statuses",
  evaluationAssignees: "evaluation_assignees",
  evaluationOrdererWorkflowStates: "evaluation_orderer_workflow_states",
  evaluationCompanyCandidates: "evaluation_partner_candidates",
  evaluationCompanyWorkflowStates: "evaluation_partner_workflow_states",
  officeMaster: "office_master",
} as const;

export const schemaPrefix = process.env.PG_SCHEMA ? `${process.env.PG_SCHEMA}.` : "";
