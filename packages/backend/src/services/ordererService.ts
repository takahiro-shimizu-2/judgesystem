import { OrdererRepository, OrdererInput } from "../repositories/ordererRepository";

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

  async create(input: OrdererInput) {
    return await this.repository.create(input);
  }

  async update(id: string, input: Partial<OrdererInput>) {
    return await this.repository.update(id, input);
  }

  async delete(id: string) {
    return await this.repository.delete(id);
  }
}
