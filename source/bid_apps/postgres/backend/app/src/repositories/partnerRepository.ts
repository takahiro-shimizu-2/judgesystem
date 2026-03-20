import { pool, TABLES, schemaPrefix } from "../config/database";

type PartnerBaseRow = {
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
  partner_id: string;
  categories: string | null;
};

type PastProjectRow = {
  partner_id: string;
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
  partner_id: string;
  name: string | null;
  address: string | null;
};

type UnifiedQualificationRow = {
  partner_id: string;
  mainCategory: string | null;
  category: string | null;
  region: string | null;
  value: string | null;
  grade: string | null;
};

type OrdererRow = {
  partner_id: string;
  ordererName: string | null;
};

type OrdererItemRow = {
  partner_id: string;
  ordererName: string | null;
  category: string | null;
  region: string | null;
  value: string | null;
  grade: string | null;
};

export class PartnerRepository {
  /**
   * Get all partners
   */
  async findAll(): Promise<any[]> {
    return this.fetchPartners();
  }

  /**
   * Find single partner by ID
   */
  async findById(id: string): Promise<any | null> {
    const partners = await this.fetchPartners(id);
    return partners.length === 0 ? null : partners[0];
  }

  private getFilter(partnerId?: string) {
    return partnerId
      ? { clause: "WHERE partner_id = $1", params: [partnerId] }
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

  private async fetchPartners(partnerId?: string): Promise<any[]> {
    const { clause, params } = this.getFilter(partnerId);
    const client = await pool.connect();

    try {
      const masterResult = await client.query<PartnerBaseRow>(
        `
          SELECT
            partner_id AS id,
            "no",
            "name",
            "postalCode",
            "address",
            "phone",
            "fax",
            "email",
            "url",
            "surveyCount",
            "rating",
            "resultCount",
            "representative",
            "established",
            "capital",
            "employeeCount"
          FROM ${schemaPrefix}${TABLES.partners}
          ${clause}
          ORDER BY "no"
        `,
        params
      );

      const categoryResult = await client.query<CategoryRow>(
        `SELECT partner_id, categories FROM ${schemaPrefix}${TABLES.partnerCategories} ${clause}`,
        params
      );

      const pastProjectsResult = await client.query<PastProjectRow>(
        `
          SELECT
            partner_id,
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
          FROM ${schemaPrefix}${TABLES.partnerPastProjects}
          ${clause}
        `,
        params
      );

      const branchesResult = await client.query<BranchRow>(
        `SELECT partner_id, name, address FROM ${schemaPrefix}${TABLES.partnerBranches} ${clause}`,
        params
      );

      const unifiedResult = await client.query<UnifiedQualificationRow>(
        `
          SELECT
            partner_id,
            "mainCategory",
            "category",
            "region",
            "value",
            "grade"
          FROM ${schemaPrefix}${TABLES.partnerQualificationsUnified}
          ${clause}
        `,
        params
      );

      const orderersResult = await client.query<OrdererRow>(
        `SELECT partner_id, "ordererName" FROM ${schemaPrefix}${TABLES.partnerQualificationsOrderers} ${clause}`,
        params
      );

      const ordererItemsResult = await client.query<OrdererItemRow>(
        `
          SELECT
            partner_id,
            "ordererName",
            "category",
            "region",
            "value",
            "grade"
          FROM ${schemaPrefix}${TABLES.partnerQualificationsOrdererItems}
          ${clause}
        `,
        params
      );
      const partnerMap = new Map<string, any>();

      masterResult.rows.forEach((row) => {
        partnerMap.set(row.id, {
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
          categories: [] as string[],
          pastProjects: [] as any[],
          branches: [] as any[],
          qualifications: {
            unified: [] as any[],
            orderers: [] as any[],
          },
        });
      });
      categoryResult.rows.forEach((row) => {
        if (!row.partner_id || !row.categories) {
          return;
        }
        const partner = partnerMap.get(row.partner_id);
        if (partner) {
          partner.categories.push(row.categories);
        }
      });

      pastProjectsResult.rows.forEach((row) => {
        if (!row.partner_id) {
          return;
        }
        const partner = partnerMap.get(row.partner_id);
        if (!partner) {
          return;
        }
        partner.pastProjects.push({
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
        if (!row.partner_id) {
          return;
        }
        const partner = partnerMap.get(row.partner_id);
        if (!partner) {
          return;
        }
        if (!row.name && !row.address) {
          return;
        }
        partner.branches.push({
          name: this.normalizeString(row.name),
          address: this.normalizeString(row.address),
        });
      });

      unifiedResult.rows.forEach((row) => {
        if (!row.partner_id) {
          return;
        }
        const partner = partnerMap.get(row.partner_id);
        if (!partner) {
          return;
        }
        partner.qualifications.unified.push({
          mainCategory: this.normalizeString(row.mainCategory),
          category: this.normalizeString(row.category),
          region: this.normalizeString(row.region),
          value: this.normalizeString(row.value),
          grade: this.normalizeString(row.grade),
        });
      });

      const ordererNameMap = new Map<string, Set<string>>();
      orderersResult.rows.forEach((row) => {
        if (!row.partner_id || !row.ordererName) {
          return;
        }
        const set = ordererNameMap.get(row.partner_id) ?? new Set<string>();
        set.add(row.ordererName);
        ordererNameMap.set(row.partner_id, set);
      });

      const ordererItemsMap = new Map<string, Map<string, any[]>>();
      ordererItemsResult.rows.forEach((row) => {
        if (!row.partner_id || !row.ordererName) {
          return;
        }
        const partnerOrderers = ordererItemsMap.get(row.partner_id) ?? new Map<string, any[]>();
        const items = partnerOrderers.get(row.ordererName) ?? [];
        items.push({
          category: this.normalizeString(row.category),
          region: this.normalizeString(row.region),
          value: this.normalizeString(row.value),
          grade: this.normalizeString(row.grade),
        });
        partnerOrderers.set(row.ordererName, items);
        ordererItemsMap.set(row.partner_id, partnerOrderers);
      });

      partnerMap.forEach((partner, partnerId) => {
        const names = new Set<string>();
        const predefined = ordererNameMap.get(partnerId);
        predefined?.forEach((name) => names.add(name));
        const itemsForPartner = ordererItemsMap.get(partnerId);
        itemsForPartner?.forEach((_, ordererName) => names.add(ordererName));

        partner.qualifications.orderers = Array.from(names).map((ordererName) => ({
          ordererName,
          items: itemsForPartner?.get(ordererName) ?? [],
        }));
      });

      return Array.from(partnerMap.values());
    } finally {
      client.release();
    }
  }
}
