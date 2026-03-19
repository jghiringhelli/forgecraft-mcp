// @ts-nocheck
export interface UserRepository {
  findAll(): Promise<{ id: string; name: string }[]>;
}
