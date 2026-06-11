/**
 * Field-analysis fixes (wave 2) — tag taxonomy & content.
 *   U7  EXPO tag (EAS Build/Submit/Update, expo-doctor, jest-expo)
 *   U6  API axios constraint is role-aware (consumer vs provider)
 *   U12 mobile guidance is mobile-native (no web bleed)
 */
import { describe, it, expect, afterEach } from "vitest";
import { join } from "node:path";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { analyzeProject } from "../../src/analyzers/package-json.js";
import { loadAllTemplates } from "../../src/registry/loader.js";
import { composeTemplates } from "../../src/registry/composer.js";
import { ALL_TAGS } from "../../src/shared/types.js";

const TEMPLATES_DIR = join(import.meta.dirname, "..", "..", "templates");

function blockText(tags: Parameters<typeof composeTemplates>[0]): string {
  const templates = loadAllTemplates(TEMPLATES_DIR);
  const composed = composeTemplates(tags, templates, {});
  return composed.instructionBlocks.map((b) => b.content).join("\n\n");
}

// ── U7: EXPO tag ──────────────────────────────────────────────────────
describe("U7 — EXPO tag", () => {
  let dir: string;
  afterEach(() => dir && rmSync(dir, { recursive: true, force: true }));

  it("EXPO is a registered tag", () => {
    expect(ALL_TAGS).toContain("EXPO");
  });

  it("an Expo project is detected as both MOBILE and EXPO", () => {
    dir = join(tmpdir(), `fc-expo-${Date.now()}`);
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, "package.json"),
      JSON.stringify({ dependencies: { expo: "^56", "expo-router": "^4" } }),
    );
    const tags = analyzeProject(dir).map((d) => d.tag);
    expect(tags).toContain("EXPO");
    expect(tags).toContain("MOBILE");
  });

  it("EXPO content covers EAS Build/Submit/Update and expo-doctor", () => {
    const text = blockText(["UNIVERSAL", "EXPO"]);
    expect(text).toContain("EAS Build");
    expect(text).toContain("EAS Submit");
    expect(text).toContain("EAS Update");
    expect(text).toContain("expo-doctor");
    expect(text).toContain("jest-expo");
  });

  it("EXPO ships a blocking expo-doctor pre-commit hook", () => {
    const templates = loadAllTemplates(TEMPLATES_DIR);
    const composed = composeTemplates(["UNIVERSAL", "EXPO"], templates, {});
    const hook = composed.hooks.find(
      (h) => h.filename === "pre-commit-expo-doctor.sh",
    );
    expect(hook).toBeDefined();
    expect(hook!.script).toContain("expo-doctor");
    expect(hook!.script).toContain("exit 1");
  });
});

// ── U6: API axios constraint is role-aware ────────────────────────────
describe("U6 — axios constraint distinguishes provider from consumer", () => {
  it("the API stack block clarifies axios is acceptable for API consumers", () => {
    const text = blockText(["UNIVERSAL", "API"]);
    // Still constrains the server's own outbound calls...
    expect(text).toContain("server's outbound calls");
    // ...but no longer flatly bans axios everywhere.
    expect(text.toLowerCase()).toContain("consume");
    expect(text).toMatch(/axios.*may use|may use.*axios/i);
  });
});

// ── U12: mobile guidance is mobile-native ─────────────────────────────
describe("U12 — mobile guidance does not bleed web concepts", () => {
  it("recommends React Native layout tools, not CSS media queries", () => {
    const text = blockText(["UNIVERSAL", "MOBILE"]);
    expect(text).toContain("useWindowDimensions");
    // CSS media/container queries are explicitly called out as not applicable.
    expect(text).not.toMatch(/Use CSS media queries or container queries to adapt/);
  });

  it("does not list IndexedDB as a primary on-device store option", () => {
    const text = blockText(["UNIVERSAL", "MOBILE"]);
    // IndexedDB may appear only in the 'web-only, not an option' caveat.
    const idxMentions = text.match(/IndexedDB/g) ?? [];
    expect(idxMentions.length).toBeLessThanOrEqual(1);
    if (idxMentions.length === 1) {
      expect(text).toMatch(/IndexedDB is web-only/);
    }
    // expo-sqlite / secure-store are the recommended native stores.
    expect(text).toMatch(/expo-sqlite|expo-secure-store/);
  });
});
