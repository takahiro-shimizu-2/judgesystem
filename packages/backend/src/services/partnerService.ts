import { PartnerRepository, PartnerInput } from "../repositories/partnerRepository";

export class PartnerService {
  private repository: PartnerRepository;

  constructor() {
    this.repository = new PartnerRepository();
  }

  /**
   * Get all partners
   */
  async getList() {
    return await this.repository.findAll();
  }

  /**
   * Get single partner by ID
   */
  async getById(id: string) {
    return await this.repository.findById(id);
  }

  /**
   * Create a new partner
   */
  async create(input: PartnerInput) {
    return await this.repository.create(input);
  }

  /**
   * Update an existing partner
   */
  async update(id: string, input: Partial<PartnerInput>) {
    return await this.repository.update(id, input);
  }

  /**
   * Soft delete a partner
   */
  async delete(id: string) {
    return await this.repository.delete(id);
  }
}
