import { CompanyRepository, CompanyInput, CompanyFilterParams } from "../repositories/companyRepository";
import { PaginatedResponse } from "../types";
import { DEFAULT_PAGE_SIZE } from "../constants";
import type { CompanyListSummary, CompanyDetail } from "../types/company";

export class CompanyService {
  private repository: CompanyRepository;

  constructor() {
    this.repository = new CompanyRepository();
  }

  async getList(filters: CompanyFilterParams): Promise<PaginatedResponse<CompanyListSummary>> {
    const { data, total } = await this.repository.findWithFilters(filters);
    const page = filters.page || 0;
    const pageSize = filters.pageSize || DEFAULT_PAGE_SIZE;
    return { data, total, page, pageSize };
  }

  async getById(id: string): Promise<CompanyDetail | null> {
    return await this.repository.findById(id);
  }

  async create(input: CompanyInput): Promise<CompanyDetail> {
    return await this.repository.create(input);
  }

  async update(id: string, input: Partial<CompanyInput>): Promise<CompanyDetail | null> {
    return await this.repository.update(id, input);
  }

  async delete(id: string) {
    return await this.repository.delete(id);
  }
}
