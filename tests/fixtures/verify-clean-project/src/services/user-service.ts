import { UserRepository } from "../repositories/user-repository";

export class UserService {
  constructor(private readonly repo: UserRepository) {}
  async getAll() { return this.repo.findAll(); }
}
