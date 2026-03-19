// @ts-nocheck
import { UserRepository } from "../repositories/user-repository";
import { UserService } from "../services/user-service";

export const userService = new UserService(new UserRepository());
