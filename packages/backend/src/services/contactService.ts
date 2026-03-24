import { ContactRepository, ContactInput } from "../repositories/contactRepository";

export class ContactService {
  private repository: ContactRepository;

  constructor() {
    this.repository = new ContactRepository();
  }

  async getList() {
    return await this.repository.findAll();
  }

  async getById(id: string) {
    return await this.repository.findById(id);
  }

  async create(input: ContactInput) {
    return await this.repository.create(input);
  }

  async update(id: string, input: Partial<ContactInput>) {
    return await this.repository.update(id, input);
  }

  async delete(id: string) {
    return await this.repository.delete(id);
  }
}
