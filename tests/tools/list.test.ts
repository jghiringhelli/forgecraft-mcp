/**
 * Tests for the list_tags, list_hooks, and list_skills tool handlers.
 */
import { describe, it, expect } from "vitest";
import {
  listTagsHandler,
  listHooksHandler,
  listSkillsHandler,
} from "../../src/tools/list.js";

describe("listTagsHandler", () => {
  it("returns exactly 24 tags", async () => {
    const result = await listTagsHandler();
    const text = result.content[0]!.text;
    const match = text.match(/Available Tags \((\d+)\)/);
    expect(match).not.toBeNull();
    expect(parseInt(match![1]!, 10)).toBe(24);
  });

  it("includes UNIVERSAL tag description", async () => {
    const result = await listTagsHandler();
    expect(result.content[0]!.text).toContain("[UNIVERSAL]");
  });
});

describe("listHooksHandler", () => {
  it("returns hooks content for UNIVERSAL tag", async () => {
    const result = await listHooksHandler({ tags: ["UNIVERSAL"] });
    const text = result.content[0]!.text;
    expect(text.length).toBeGreaterThan(0);
  });

  it("returns all hooks when no tags filter provided", async () => {
    const result = await listHooksHandler({});
    expect(result.content[0]!.text.length).toBeGreaterThan(0);
  });
});

describe("listSkillsHandler", () => {
  it("returns skills or no-skills message", async () => {
    const result = await listSkillsHandler({});
    expect(result.content[0]!.text.length).toBeGreaterThan(0);
  });
});
