// @ts-nocheck
import { describe, it, expect } from "vitest";
import { UserService } from "../services/user-service";

describe("UserService", () => {
  it("returns all users", async () => {
    const repo = { findAll: async () => [{ id: "1", name: "Alice" }] };
    const svc = new UserService(repo);
    expect(await svc.getAll()).toHaveLength(1);
  });
});
