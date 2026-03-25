import { CompanyRepository, CompanyInput } from "../repositories/companyRepository";

export class CompanyService {
  private repository: CompanyRepository;

  constructor() {
    this.repository = new CompanyRepository();
  }

  async getList() {
    return await this.repository.findAll();
  }

  async getById(id: string) {
    return await this.repository.findById(id);
  }

  async create(input: CompanyInput) {
    return await this.repository.create(input);
  }

  async update(id: string, input: Partial<CompanyInput>) {
    return await this.repository.update(id, input);
  }

  async delete(id: string) {
    return await this.repository.delete(id);
  }
}
