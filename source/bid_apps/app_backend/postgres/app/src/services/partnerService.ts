import { PartnerRepository } from "../repositories/partnerRepository";

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
}
