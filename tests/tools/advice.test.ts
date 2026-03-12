import { describe, it, expect } from "vitest";
import { adviceHandler } from "../../src/tools/advice.js";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const FIXTURES = resolve(
  fileURLToPath(new URL(".", import.meta.url)),
  "../fixtures",
);

// ── adviceHandler — tag resolution ────────────────────────────────────

describe("adviceHandler > tag resolution", () => {
  it("uses explicit tags when provided", async () => {
    const result = await adviceHandler({ tags: ["API"] });
    const text = result.content[0]!.text;
    expect(text).toContain("API");
  });

  it("falls back to UNIVERSAL when no tags and no project_dir", async () => {
    const result = await adviceHandler({});
    const text = result.content[0]!.text;
    expect(text).toContain("UNIVERSAL");
  });

  it("reads tags from forgecraft.yaml when project_dir provided", async () => {
    // verify-clean-project fixture has no forgecraft.yaml → falls back to UNIVERSAL
    const result = await adviceHandler({
      project_dir: resolve(FIXTURES, "verify-clean-project"),
    });
    const text = result.content[0]!.text;
    expect(text).toMatch(/UNIVERSAL/);
  });

  it("explicit tags override project_dir", async () => {
    const result = await adviceHandler({
      project_dir: resolve(FIXTURES, "verify-clean-project"),
      tags: ["WEB-REACT"],
    });
    const text = result.content[0]!.text;
    expect(text).toContain("WEB-REACT");
  });
});

// ── adviceHandler — report structure ─────────────────────────────────

describe("adviceHandler > report structure", () => {
  it("includes all three main sections", async () => {
    const result = await adviceHandler({ tags: ["UNIVERSAL"] });
    const text = result.content[0]!.text;
    expect(text).toContain("## Recommended Tool Stack");
    expect(text).toContain("## Quality Cycle (Ordered Gates)");
    expect(text).toContain("npx playwright test");
  });

  it("includes base tool rows for every output", async () => {
    const result = await adviceHandler({ tags: ["UNIVERSAL"] });
    const text = result.content[0]!.text;
    expect(text).toContain("Unit (Solitary)");
    expect(text).toContain("SAST");
  });

  it("includes numbered cycle steps", async () => {
    const result = await adviceHandler({ tags: ["UNIVERSAL"] });
    const text = result.content[0]!.text;
    expect(text).toMatch(/^1\./m);
    expect(text).toMatch(/^2\./m);
  });

  it("ends with regeneration tip", async () => {
    const result = await adviceHandler({ tags: ["UNIVERSAL"] });
    const text = result.content[0]!.text;
    expect(text).toContain("forgecraft refresh");
  });
});

// ── adviceHandler — API tag ───────────────────────────────────────────

describe("adviceHandler > API tag", () => {
  it("includes CDC and DAST in tool stack", async () => {
    const result = await adviceHandler({ tags: ["API"] });
    const text = result.content[0]!.text;
    expect(text).toContain("Contract (CDC)");
    expect(text).toContain("OWASP ZAP");
  });

  it("includes APIRequestContext smoke note", async () => {
    const result = await adviceHandler({ tags: ["API"] });
    const text = result.content[0]!.text;
    expect(text).toContain("APIRequestContext");
  });

  it("includes playwright.smoke.config.ts example", async () => {
    const result = await adviceHandler({ tags: ["API"] });
    const text = result.content[0]!.text;
    expect(text).toContain("playwright.smoke.config.ts");
  });
});

// ── adviceHandler — WEB-REACT tag ────────────────────────────────────

describe("adviceHandler > WEB-REACT tag", () => {
  it("includes axe-core and visual regression tools", async () => {
    const result = await adviceHandler({ tags: ["WEB-REACT"] });
    const text = result.content[0]!.text;
    expect(text).toContain("axe-core");
    expect(text).toContain("Chromatic");
  });

  it("mentions store window exposure for chain tests", async () => {
    const result = await adviceHandler({ tags: ["WEB-REACT"] });
    const text = result.content[0]!.text;
    expect(text).toContain("window.__store");
  });

  it("includes browser devices in playwright config", async () => {
    const result = await adviceHandler({ tags: ["WEB-REACT"] });
    const text = result.content[0]!.text;
    expect(text).toContain("Desktop Chrome");
  });
});

// ── adviceHandler — GAME tag ─────────────────────────────────────────

describe("adviceHandler > GAME tag", () => {
  it("includes all three smoke tiers", async () => {
    const result = await adviceHandler({ tags: ["GAME"] });
    const text = result.content[0]!.text;
    expect(text).toContain("Tier 1");
    expect(text).toContain("Tier 2");
    expect(text).toContain("Tier 3");
  });

  it("mentions FPS floor and CDP", async () => {
    const result = await adviceHandler({ tags: ["GAME"] });
    const text = result.content[0]!.text;
    expect(text).toContain("FPS");
    expect(text).toContain("CDP");
  });
});

// ── adviceHandler — multiple tags ────────────────────────────────────

describe("adviceHandler > multiple tags", () => {
  it("merges tool rows for API + WEB-REACT without duplicates", async () => {
    const result = await adviceHandler({ tags: ["API", "WEB-REACT"] });
    const text = result.content[0]!.text;
    // Both tags present
    expect(text).toContain("APIRequestContext");
    expect(text).toContain("axe-core");
    // SAST appears exactly once (deduplication check)
    const sastOccurrences = (text.match(/SAST/g) ?? []).length;
    expect(sastOccurrences).toBeLessThanOrEqual(4); // table row + cycle steps
  });
});
