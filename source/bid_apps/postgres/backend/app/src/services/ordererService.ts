import { OrdererRepository } from "../repositories/ordererRepository";

export class OrdererService {
  private repository: OrdererRepository;

  constructor() {
    this.repository = new OrdererRepository();
  }

  async getList() {
    return this.repository.findAll();
  }

  async getById(id: string) {
    return this.repository.findById(id);
  }
}
