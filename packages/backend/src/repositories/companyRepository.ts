import { PoolClient } from "pg";
import { pool, TABLES, schemaPrefix } from "../config/database";
import { escapeLikePattern } from "../utils/sql";
import { BaseFilterParams } from "../types";
import { DEFAULT_PAGE_SIZE } from "../constants";
import type {
  CompanyListSummary,
  CompanyDetail,
  CompanyCategory,
  CompanyPastProject,
  CompanyBranch,
  UnifiedQualification,
  OrdererQualificationItem,
  OrdererQualification,
  CompanyQualifications,
} from "../types/company";

type CompanyBaseRow = {
  id: string;
  no: number;
  name: string;
  postalCode: string;
  address: string;
  phone: string;
  fax: string;
  email: string;
  url: string;
  surveyCount: number;
  rating: number;
  resultCount: number;
  representative: string;
  established: string;
  capital: number;
  employeeCount: number;
};

type CategoryRow = {
  company_id: string;
  category_group: string | null;
  categories: string | null;
};

type PastProjectRow = {
  company_id: string;
  evaluationId: string | null;
  announcementId: string | null;
  announcementNo: number | null;
  announcementTitle: string | null;
  branchName: string | null;
  workStatus: string | null;
  evaluationStatus: string | null;
  priority: number | null;
  bidType: string | null;
  category: string | null;
  prefecture: string | null;
  publishDate: string | null;
  deadline: string | null;
  evaluatedAt: string | null;
  organization: string | null;
};

type BranchRow = {
  company_id: string;
  name: string | null;
  address: string | null;
};

type UnifiedQualificationRow = {
  company_id: string;
  mainCategory: string | null;
  category: string | null;
  region: string | null;
  value: string | null;
  grade: string | null;
};

type OrdererRow = {
  company_id: string;
  ordererName: string | null;
};

type OrdererItemRow = {
  company_id: string;
  ordererName: string | null;
  category: string | null;
  region: string | null;
  value: string | null;
  grade: string | null;
};

/** Raw row returned by the findWithFilters master query (includes window-function column). */
interface CompanyListRow {
  id: string;
  no: number;
  name: string;
  address: string;
  phone: string;
  surveyCount: number | null;
  rating: number | null;
  resultCount: number | null;
  hasPrimeQualification: boolean;
  total_count: string;
}

export interface CompanyFilterParams extends BaseFilterParams {
  prefectures?: string[];
  categories?: string[];
  ratings?: number[];
  hasSurvey?: "yes" | "no";
  hasPrimeQualification?: "yes" | "no";
}

export interface CompanyInput {
  name: string;
  postalCode: string;
  address: string;
  phone: string;
  fax: string;
  email: string;
  url: string;
  representative: string;
  established: string;
  capital: string;
  employeeCount: string;
  categories: { group: string | null; name: string }[];
  branches: { name: string; address: string }[];
}

export class CompanyRepository {
  /**
   * Get companies (partners) with server-side filtering, sorting and pagination
   */
  async findWithFilters(
    filters: CompanyFilterParams
  ): Promise<{ data: CompanyListSummary[]; total: number }> {
    const page = filters.page || 0;
    const pageSize = filters.pageSize || DEFAULT_PAGE_SIZE;
    const offset = page * pageSize;

    const conditions: string[] = [
      "COALESCE(p.is_active, true)",
      "p.is_partner = true",
    ];
    const params: unknown[] = [];
    let paramIndex = 1;

    // Search query: name, address, phone, or category name
    if (filters.searchQuery) {
      const escaped = escapeLikePattern(filters.searchQuery);
      const pattern = `%${escaped}%`;
      conditions.push(`(
        p."name" ILIKE $${paramIndex}
        OR p."address" ILIKE $${paramIndex}
        OR p."phone" ILIKE $${paramIndex}
        OR EXISTS (
          SELECT 1 FROM ${schemaPrefix}${TABLES.companyCategories} pc
          WHERE pc.company_id = p.id AND pc.categories ILIKE $${paramIndex}
        )
      )`);
      params.push(pattern);
      paramIndex++;
    }

    // Prefecture filter (address starts with prefecture name)
    if (filters.prefectures && filters.prefectures.length > 0) {
      const prefConditions = filters.prefectures.map((pref) => {
        params.push(`${pref}%`);
        return `p."address" LIKE $${paramIndex++}`;
      });
      conditions.push(`(${prefConditions.join(" OR ")})`);
    }

    // Category filter
    if (filters.categories && filters.categories.length > 0) {
      conditions.push(`EXISTS (
        SELECT 1 FROM ${schemaPrefix}${TABLES.companyCategories} pc
        WHERE pc.company_id = p.id AND pc.categories = ANY($${paramIndex})
      )`);
      params.push(filters.categories);
      paramIndex++;
    }

    // Rating filter
    if (filters.ratings && filters.ratings.length > 0) {
      conditions.push(`p."rating" = ANY($${paramIndex})`);
      params.push(filters.ratings);
      paramIndex++;
    }

    // Survey filter
    if (filters.hasSurvey === "yes") {
      conditions.push(`COALESCE(p.survey_count, 0) > 0`);
    } else if (filters.hasSurvey === "no") {
      conditions.push(`COALESCE(p.survey_count, 0) = 0`);
    }

    // Prime qualification filter
    if (filters.hasPrimeQualification === "yes") {
      conditions.push(`(
        EXISTS (SELECT 1 FROM ${schemaPrefix}${TABLES.companyQualificationsUnified} q WHERE q.company_id = p.id)
        OR EXISTS (SELECT 1 FROM ${schemaPrefix}${TABLES.companyQualificationsOrderers} q WHERE q.company_id = p.id)
      )`);
    } else if (filters.hasPrimeQualification === "no") {
      conditions.push(`(
        NOT EXISTS (SELECT 1 FROM ${schemaPrefix}${TABLES.companyQualificationsUnified} q WHERE q.company_id = p.id)
        AND NOT EXISTS (SELECT 1 FROM ${schemaPrefix}${TABLES.companyQualificationsOrderers} q WHERE q.company_id = p.id)
      )`);
    }

    const whereClause = `WHERE ${conditions.join(" AND ")}`;

    // Sort
    const sortFieldMap: Record<string, string> = {
      name: 'p."name"',
      rating: 'p."rating"',
      resultCount: "p.result_count",
      surveyCount: "p.survey_count",
      address: 'p."address"',
      no: 'p."no"',
    };
    const sortColumn =
      filters.sortField && sortFieldMap[filters.sortField]
        ? sortFieldMap[filters.sortField]
        : 'p."no"';
    const sortDirection = filters.sortOrder === "desc" ? "DESC" : "ASC";
    const nullsLast = ["rating", "resultCount", "surveyCount"].includes(
      filters.sortField || ""
    )
      ? " NULLS LAST"
      : "";

    const client = await pool.connect();
    try {
      params.push(pageSize, offset);

      const masterResult = await client.query<CompanyListRow>(
        `
          SELECT
            p.id,
            p."no",
            p."name",
            p."address",
            p."phone",
            p.survey_count AS "surveyCount",
            p."rating",
            p.result_count AS "resultCount",
            (
              EXISTS (SELECT 1 FROM ${schemaPrefix}${TABLES.companyQualificationsUnified} q WHERE q.company_id = p.id)
              OR EXISTS (SELECT 1 FROM ${schemaPrefix}${TABLES.companyQualificationsOrderers} q WHERE q.company_id = p.id)
            ) AS "hasPrimeQualification",
            COUNT(*) OVER() AS total_count
          FROM ${schemaPrefix}${TABLES.companies} p
          ${whereClause}
          ORDER BY ${sortColumn} ${sortDirection}${nullsLast}
          LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
        `,
        params
      );

      const total =
        masterResult.rows.length > 0
          ? parseInt(masterResult.rows[0].total_count)
          : 0;

      if (masterResult.rows.length === 0) {
        return { data: [], total: 0 };
      }

      // Fetch categories only for paginated company IDs
      const companyIds = masterResult.rows.map((r) => r.id);
      const categoryResult = await client.query<CategoryRow>(
        `SELECT company_id, category_group, categories
         FROM ${schemaPrefix}${TABLES.companyCategories}
         WHERE company_id = ANY($1)`,
        [companyIds]
      );

      const categoryMap = new Map<string, CompanyCategory[]>();
      categoryResult.rows.forEach((row) => {
        if (!row.company_id || !row.categories) return;
        const list = categoryMap.get(row.company_id) || [];
        list.push({ group: row.category_group || null, name: row.categories });
        categoryMap.set(row.company_id, list);
      });

      const data: CompanyListSummary[] = masterResult.rows.map(
        ({ total_count: _totalCount, ...row }) => ({
          id: row.id as string,
          no: this.toNumberOrDefault(row.no, 0),
          name: this.normalizeString(row.name),
          address: this.normalizeString(row.address),
          phone: this.normalizeString(row.phone),
          surveyCount: this.toNumber(row.surveyCount),
          rating: this.toNumber(row.rating),
          resultCount: this.toNumber(row.resultCount),
          hasPrimeQualification: row.hasPrimeQualification === true,
          categories: categoryMap.get(row.id) || [],
        })
      );

      return { data, total };
    } finally {
      client.release();
    }
  }

  /**
   * Get all companies (partners) with full detail
   */
  async findAll(): Promise<CompanyDetail[]> {
    return this.fetchCompanies();
  }

  /**
   * Find single company by ID
   */
  async findById(id: string): Promise<CompanyDetail | null> {
    const companies = await this.fetchCompanies(id);
    return companies.length === 0 ? null : companies[0];
  }

  private getFilter(companyId?: string) {
    return companyId
      ? { clause: "WHERE company_id = $1", params: [companyId] }
      : { clause: "", params: [] as unknown[] };
  }

  private toNumber(value: unknown): number | null {
    if (value === null || value === undefined || value === "") {
      return null;
    }
    const num = Number(value);
    return Number.isFinite(num) ? num : null;
  }

  private toNumberOrDefault(value: unknown, defaultValue = 0): number {
    const parsed = this.toNumber(value);
    return parsed === null ? defaultValue : parsed;
  }

  private normalizeString(value: unknown): string {
    if (value === null || value === undefined) {
      return "";
    }
    return String(value);
  }

  private normalizeDate(value: unknown): string {
    if (!value) {
      return "";
    }
    if (value instanceof Date) {
      return value.toISOString();
    }
    return String(value);
  }

  private async fetchCompanies(companyId?: string): Promise<CompanyDetail[]> {
    const { clause, params } = this.getFilter(companyId);
    const masterWhereClause = companyId
      ? `WHERE COALESCE(is_active, true) AND is_partner = true AND id = $1`
      : `WHERE COALESCE(is_active, true) AND is_partner = true`;
    const client = await pool.connect();

    try {
      const masterResult = await client.query<CompanyBaseRow>(
        `
          SELECT
            id,
            "no",
            "name",
            postal_code AS "postalCode",
            "address",
            "phone",
            "fax",
            "email",
            "url",
            survey_count AS "surveyCount",
            "rating",
            result_count AS "resultCount",
            "representative",
            "establishment_date" AS "established",
            "capital",
            employee_count AS "employeeCount"
          FROM ${schemaPrefix}${TABLES.companies}
          ${masterWhereClause}
          ORDER BY "no"
        `,
        params
      );

      const categoryResult = await client.query<CategoryRow>(
        `SELECT company_id, category_group, categories FROM ${schemaPrefix}${TABLES.companyCategories} ${clause}`,
        params
      );

      const pastProjectsResult = await client.query<PastProjectRow>(
        `
          SELECT
            company_id,
            "evaluationId",
            "announcementId",
            "announcementNo",
            "announcementTitle",
            "branchName",
            "workStatus",
            "evaluationStatus",
            "priority",
            "bidType",
            "category",
            "prefecture",
            "publishDate",
            "deadline",
            "evaluatedAt",
            "organization"
          FROM ${schemaPrefix}${TABLES.companyPastProjects}
          ${clause}
        `,
        params
      );

      const branchesResult = await client.query<BranchRow>(
        `SELECT company_id, name, address FROM ${schemaPrefix}${TABLES.companyBranches} ${clause}`,
        params
      );

      const unifiedResult = await client.query<UnifiedQualificationRow>(
        `
          SELECT
            company_id,
            "mainCategory",
            "category",
            "region",
            "value",
            "grade"
          FROM ${schemaPrefix}${TABLES.companyQualificationsUnified}
          ${clause}
        `,
        params
      );

      const orderersResult = await client.query<OrdererRow>(
        `SELECT company_id, "ordererName" FROM ${schemaPrefix}${TABLES.companyQualificationsOrderers} ${clause}`,
        params
      );

      const ordererItemsResult = await client.query<OrdererItemRow>(
        `
          SELECT
            company_id,
            "ordererName",
            "category",
            "region",
            "value",
            "grade"
          FROM ${schemaPrefix}${TABLES.companyQualificationsOrdererItems}
          ${clause}
        `,
        params
      );
      const companyMap = new Map<string, CompanyDetail>();

      masterResult.rows.forEach((row) => {
        companyMap.set(row.id, {
          id: row.id,
          no: this.toNumberOrDefault(row.no, 0),
          name: this.normalizeString(row.name),
          postalCode: this.normalizeString(row.postalCode),
          address: this.normalizeString(row.address),
          phone: this.normalizeString(row.phone),
          fax: this.normalizeString(row.fax),
          email: this.normalizeString(row.email),
          url: this.normalizeString(row.url),
          surveyCount: this.toNumber(row.surveyCount),
          rating: this.toNumber(row.rating),
          resultCount: this.toNumber(row.resultCount),
          representative: this.normalizeString(row.representative),
          established: this.normalizeString(row.established),
          capital: this.toNumber(row.capital),
          employeeCount: this.toNumber(row.employeeCount),
          categories: [] as CompanyCategory[],
          pastProjects: [] as CompanyPastProject[],
          branches: [] as CompanyBranch[],
          qualifications: {
            unified: [] as UnifiedQualification[],
            orderers: [] as OrdererQualification[],
          } as CompanyQualifications,
        });
      });
      categoryResult.rows.forEach((row) => {
        if (!row.company_id || !row.categories) {
          return;
        }
        const company = companyMap.get(row.company_id);
        if (company) {
          company.categories.push({ group: row.category_group || null, name: row.categories });
        }
      });

      pastProjectsResult.rows.forEach((row) => {
        if (!row.company_id) {
          return;
        }
        const company = companyMap.get(row.company_id);
        if (!company) {
          return;
        }
        company.pastProjects.push({
          evaluationId: this.normalizeString(row.evaluationId),
          announcementId: this.normalizeString(row.announcementId),
          announcementNo: this.toNumber(row.announcementNo),
          announcementTitle: this.normalizeString(row.announcementTitle),
          branchName: this.normalizeString(row.branchName),
          workStatus: this.normalizeString(row.workStatus),
          evaluationStatus: this.normalizeString(row.evaluationStatus),
          priority: this.toNumber(row.priority),
          bidType: this.normalizeString(row.bidType),
          category: this.normalizeString(row.category),
          prefecture: this.normalizeString(row.prefecture),
          publishDate: this.normalizeDate(row.publishDate),
          deadline: this.normalizeDate(row.deadline),
          evaluatedAt: this.normalizeDate(row.evaluatedAt),
          organization: this.normalizeString(row.organization),
        });
      });

      branchesResult.rows.forEach((row) => {
        if (!row.company_id) {
          return;
        }
        const company = companyMap.get(row.company_id);
        if (!company) {
          return;
        }
        if (!row.name && !row.address) {
          return;
        }
        company.branches.push({
          name: this.normalizeString(row.name),
          address: this.normalizeString(row.address),
        });
      });

      unifiedResult.rows.forEach((row) => {
        if (!row.company_id) {
          return;
        }
        const company = companyMap.get(row.company_id);
        if (!company) {
          return;
        }
        company.qualifications.unified.push({
          mainCategory: this.normalizeString(row.mainCategory),
          category: this.normalizeString(row.category),
          region: this.normalizeString(row.region),
          value: this.normalizeString(row.value),
          grade: this.normalizeString(row.grade),
        });
      });

      const ordererNameMap = new Map<string, Set<string>>();
      orderersResult.rows.forEach((row) => {
        if (!row.company_id || !row.ordererName) {
          return;
        }
        const set = ordererNameMap.get(row.company_id) ?? new Set<string>();
        set.add(row.ordererName);
        ordererNameMap.set(row.company_id, set);
      });

      const ordererItemsMap = new Map<string, Map<string, OrdererQualificationItem[]>>();
      ordererItemsResult.rows.forEach((row) => {
        if (!row.company_id || !row.ordererName) {
          return;
        }
        const companyOrderers = ordererItemsMap.get(row.company_id) ?? new Map<string, OrdererQualificationItem[]>();
        const items = companyOrderers.get(row.ordererName) ?? [];
        items.push({
          category: this.normalizeString(row.category),
          region: this.normalizeString(row.region),
          value: this.normalizeString(row.value),
          grade: this.normalizeString(row.grade),
        });
        companyOrderers.set(row.ordererName, items);
        ordererItemsMap.set(row.company_id, companyOrderers);
      });

      companyMap.forEach((company, companyId) => {
        const names = new Set<string>();
        const predefined = ordererNameMap.get(companyId);
        predefined?.forEach((name) => names.add(name));
        const itemsForCompany = ordererItemsMap.get(companyId);
        itemsForCompany?.forEach((_, ordererName) => names.add(ordererName));

        company.qualifications.orderers = Array.from(names).map((ordererName) => ({
          ordererName,
          items: itemsForCompany?.get(ordererName) ?? [],
        }));
      });

      return Array.from(companyMap.values());
    } finally {
      client.release();
    }
  }

  /**
   * Create a new company (partner) with categories and branches
   */
  async create(input: CompanyInput): Promise<CompanyDetail> {
    const client: PoolClient = await pool.connect();
    try {
      await client.query("BEGIN");

      const masterResult = await client.query<{ id: string }>(
        `
          INSERT INTO ${schemaPrefix}${TABLES.companies}
            (id, name, postal_code, address, phone, fax, email, url,
             representative, establishment_date, capital, employee_count,
             is_partner, created_at, updated_at)
          VALUES
            (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11,
             true, NOW(), NOW())
          RETURNING id
        `,
        [
          input.name,
          input.postalCode,
          input.address,
          input.phone,
          input.fax,
          input.email,
          input.url,
          input.representative,
          input.established,
          input.capital,
          input.employeeCount,
        ]
      );

      const companyId = masterResult.rows[0]?.id;
      if (!companyId) {
        throw new Error("Failed to create company");
      }

      for (const category of input.categories) {
        await client.query(
          `INSERT INTO ${schemaPrefix}${TABLES.companyCategories} (company_id, category_group, categories) VALUES ($1, $2, $3)`,
          [companyId, category.group, category.name]
        );
      }

      for (const branch of input.branches) {
        await client.query(
          `INSERT INTO ${schemaPrefix}${TABLES.companyBranches} (company_id, name, address) VALUES ($1, $2, $3)`,
          [companyId, branch.name, branch.address]
        );
      }

      await client.query("COMMIT");

      const record = await this.findById(companyId);
      if (!record) {
        throw new Error("Failed to load created company");
      }
      return record;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Update an existing company
   */
  async update(id: string, input: Partial<CompanyInput>): Promise<CompanyDetail | null> {
    const client: PoolClient = await pool.connect();
    try {
      await client.query("BEGIN");

      const fieldMap: Record<string, string> = {
        name: "name",
        postalCode: "postal_code",
        address: "address",
        phone: "phone",
        fax: "fax",
        email: "email",
        url: "url",
        representative: "representative",
        established: "establishment_date",
        capital: "capital",
        employeeCount: "employee_count",
      };

      const setClauses: string[] = [];
      const values: unknown[] = [id];
      let paramIndex = 2;

      for (const [inputKey, columnName] of Object.entries(fieldMap)) {
        const value = (input as Record<string, unknown>)[inputKey];
        if (value !== undefined) {
          setClauses.push(`${columnName} = $${paramIndex}`);
          values.push(value);
          paramIndex += 1;
        }
      }

      setClauses.push(`updated_at = NOW()`);

      const updateResult = await client.query(
        `
          UPDATE ${schemaPrefix}${TABLES.companies}
          SET ${setClauses.join(", ")}
          WHERE id = $1
          RETURNING id
        `,
        values
      );

      if (updateResult.rowCount === 0) {
        await client.query("ROLLBACK");
        return null;
      }

      if (input.categories !== undefined) {
        await client.query(
          `DELETE FROM ${schemaPrefix}${TABLES.companyCategories} WHERE company_id = $1`,
          [id]
        );
        for (const category of input.categories) {
          await client.query(
            `INSERT INTO ${schemaPrefix}${TABLES.companyCategories} (company_id, category_group, categories) VALUES ($1, $2, $3)`,
            [id, category.group, category.name]
          );
        }
      }

      if (input.branches !== undefined) {
        await client.query(
          `DELETE FROM ${schemaPrefix}${TABLES.companyBranches} WHERE company_id = $1`,
          [id]
        );
        for (const branch of input.branches) {
          await client.query(
            `INSERT INTO ${schemaPrefix}${TABLES.companyBranches} (company_id, name, address) VALUES ($1, $2, $3)`,
            [id, branch.name, branch.address]
          );
        }
      }

      await client.query("COMMIT");

      return await this.findById(id);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Soft delete a company (set is_active = FALSE)
   */
  async delete(id: string): Promise<boolean> {
    const client = await pool.connect();
    try {
      const result = await client.query(
        `
          UPDATE ${schemaPrefix}${TABLES.companies}
          SET is_active = FALSE, updated_at = NOW()
          WHERE id = $1
        `,
        [id]
      );
      return (result.rowCount ?? 0) > 0;
    } finally {
      client.release();
    }
  }
}
