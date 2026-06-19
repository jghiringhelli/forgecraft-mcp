/**
 * Field-analysis fixes (wave 1) — derived from the SafetyCore Mobile report on
 * forgecraft-mcp@1.8.0. Each describe block maps to one finding (U#).
 */
import { describe, it, expect, afterEach } from "vitest";
import { join } from "node:path";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import {
  computeUpdatedTags,
  computeRejectedTags,
} from "../../src/tools/refresh-analyzer.js";
import { analyzeProject } from "../../src/analyzers/package-json.js";
import {
  detectCodeDefinedSchema,
  checkSchemaDefinitions,
} from "../../src/tools/check-cascade-contracts.js";
import { preserveUserBlocks } from "../../src/tools/refresh-output.js";
import { collectSpecCandidates } from "../../src/tools/setup-context.js";
import { renderSentinelTree } from "../../src/registry/sentinel-renderer.js";
import type { RenderContext } from "../../src/registry/renderer.js";
import type { Tag } from "../../src/shared/types.js";

function tmp(slug: string): string {
  const dir = join(tmpdir(), `fc-w1-${slug}-${Date.now()}-${Math.round(performance.now())}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

// ── U4: persistent rejected tags ──────────────────────────────────────
describe("U4 — rejected tags are not re-added by inference", () => {
  it("computeUpdatedTags ignores a high-confidence suggestion that was rejected", () => {
    const result = computeUpdatedTags(
      ["UNIVERSAL", "MOBILE"],
      [{ tag: "WEB-REACT", confidence: 0.9 }],
      undefined,
      undefined,
      ["WEB-REACT"], // rejected
    );
    expect(result).not.toContain("WEB-REACT");
    expect(result).toContain("MOBILE");
  });

  it("re-adding a rejected tag via addTags overrides the rejection", () => {
    const result = computeUpdatedTags(
      ["UNIVERSAL"],
      [{ tag: "WEB-REACT", confidence: 0.9 }],
      ["WEB-REACT"], // explicit add this run
      undefined,
      ["WEB-REACT"], // previously rejected
    );
    expect(result).toContain("WEB-REACT");
  });

  it("computeRejectedTags remembers removed tags and forgets re-added ones", () => {
    const afterRemove = computeRejectedTags(undefined, ["WEB-REACT"], undefined);
    expect(afterRemove).toEqual(["WEB-REACT"]);

    const afterReAdd = computeRejectedTags(["WEB-REACT"], undefined, ["WEB-REACT"]);
    expect(afterReAdd).toEqual([]);

    expect(computeRejectedTags(["WEB-REACT"], ["UNIVERSAL"], undefined)).not.toContain(
      "UNIVERSAL",
    );
  });
});

// ── U5: LIBRARY no longer over-triggers ───────────────────────────────
describe("U5 — LIBRARY tag requires a publishable package", () => {
  let dir: string;
  afterEach(() => dir && rmSync(dir, { recursive: true, force: true }));

  it("does NOT tag an end-user app (tsconfig + private, no exports) as LIBRARY", () => {
    dir = tmp("app");
    writeFileSync(join(dir, "tsconfig.json"), "{}");
    writeFileSync(
      join(dir, "package.json"),
      JSON.stringify({ private: true, dependencies: { expo: "^56" } }),
    );
    const tags = analyzeProject(dir).map((d) => d.tag);
    expect(tags).not.toContain("LIBRARY");
  });

  it("DOES tag a real package (exports + not private) as LIBRARY", () => {
    dir = tmp("lib");
    writeFileSync(join(dir, "tsconfig.json"), "{}");
    writeFileSync(
      join(dir, "package.json"),
      JSON.stringify({
        name: "my-lib",
        exports: "./dist/index.js",
        types: "./dist/index.d.ts",
      }),
    );
    const lib = analyzeProject(dir).find((d) => d.tag === "LIBRARY");
    expect(lib).toBeDefined();
    expect(lib!.confidence).toBeGreaterThanOrEqual(0.6);
  });

  it("does not tag a private package even with a main field", () => {
    dir = tmp("priv");
    writeFileSync(
      join(dir, "package.json"),
      JSON.stringify({ private: true, main: "index.js" }),
    );
    expect(analyzeProject(dir).map((d) => d.tag)).not.toContain("LIBRARY");
  });
});

// ── U8: code-defined schema detection ─────────────────────────────────
describe("U8 — schema detection sees code-defined ORMs", () => {
  let dir: string;
  afterEach(() => dir && rmSync(dir, { recursive: true, force: true }));

  it("detects a Drizzle schema in src/", () => {
    dir = tmp("drizzle");
    mkdirSync(join(dir, "src", "db"), { recursive: true });
    writeFileSync(
      join(dir, "src", "db", "schema.ts"),
      `import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const users = sqliteTable("users", { id: text("id") });`,
    );
    const hit = detectCodeDefinedSchema(dir);
    expect(hit).toContain("Drizzle");
  });

  it("checkSchemaDefinitions PASSes when a Drizzle schema exists", () => {
    dir = tmp("drizzle-cascade");
    writeFileSync(join(dir, "package.json"), "{}");
    mkdirSync(join(dir, "src"), { recursive: true });
    writeFileSync(
      join(dir, "src", "models.ts"),
      `export const t = pgTable("t", {});`,
    );
    const step = checkSchemaDefinitions(dir);
    expect(step.status).toBe("PASS");
    expect(step.detail).toContain("Code-defined schema");
  });

  it("detects TypeORM and Mongoose too", () => {
    dir = tmp("orm");
    mkdirSync(join(dir, "src"), { recursive: true });
    writeFileSync(join(dir, "src", "user.ts"), `@Entity()\nclass User {}`);
    expect(detectCodeDefinedSchema(dir)).toContain("TypeORM");

    rmSync(join(dir, "src", "user.ts"));
    writeFileSync(
      join(dir, "src", "post.ts"),
      `const PostSchema = new Schema({ title: String });`,
    );
    expect(detectCodeDefinedSchema(dir)).toContain("Mongoose");
  });

  it("still WARNs when there is genuinely no schema", () => {
    dir = tmp("noschema");
    writeFileSync(join(dir, "package.json"), "{}");
    mkdirSync(join(dir, "src"), { recursive: true });
    writeFileSync(join(dir, "src", "index.ts"), `console.log("hi");`);
    expect(checkSchemaDefinitions(dir).status).toBe("WARN");
  });
});

// ── U10: preserve blocks survive refresh ──────────────────────────────
describe("U10 — forgecraft:preserve blocks survive a refresh overwrite", () => {
  let dir: string;
  afterEach(() => dir && rmSync(dir, { recursive: true, force: true }));

  it("appends a preserved block from the existing file to regenerated content", () => {
    dir = tmp("preserve");
    const path = join(dir, "CLAUDE.md");
    writeFileSync(
      path,
      `# old\n<!-- forgecraft:preserve-start -->\nMY CUSTOM RULE\n<!-- forgecraft:preserve-end -->\n`,
    );
    const out = preserveUserBlocks(path, "# regenerated\n");
    expect(out).toContain("# regenerated");
    expect(out).toContain("MY CUSTOM RULE");
  });

  it("is idempotent — does not duplicate an already-present block", () => {
    dir = tmp("preserve-idem");
    const block =
      "<!-- forgecraft:preserve-start -->\nKEEP\n<!-- forgecraft:preserve-end -->";
    const path = join(dir, "CLAUDE.md");
    writeFileSync(path, `# x\n${block}\n`);
    const out = preserveUserBlocks(path, `# regen\n${block}\n`);
    expect(out.match(/KEEP/g)?.length).toBe(1);
  });

  it("returns content unchanged when there are no preserve blocks", () => {
    dir = tmp("preserve-none");
    const path = join(dir, "CLAUDE.md");
    writeFileSync(path, "# old\n");
    expect(preserveUserBlocks(path, "# new\n")).toBe("# new\n");
  });
});

// ── U9: spec discovery ranks the authoritative spec first ─────────────
describe("U9 — largest spec ranked first for authoritative discovery", () => {
  let dir: string;
  afterEach(() => dir && rmSync(dir, { recursive: true, force: true }));

  it("ranks a large docs/specs/ document above a smaller README", () => {
    dir = tmp("spec-rank");
    mkdirSync(join(dir, "docs", "specs"), { recursive: true });
    // Small (but >500 chars) README-like doc.
    writeFileSync(
      join(dir, "docs", "overview.md"),
      "# Overview\n" + "small doc line\n".repeat(40),
    );
    // Large authoritative spec.
    writeFileSync(
      join(dir, "docs", "specs", "app-spec.md"),
      "# App Spec\n" + "authoritative spec line\n".repeat(800),
    );
    const candidates = collectSpecCandidates(dir);
    expect(candidates.length).toBeGreaterThanOrEqual(2);
    // Largest first.
    expect(candidates[0].path.replace(/\\/g, "/")).toContain(
      "docs/specs/app-spec.md",
    );
    expect(candidates[0].lines).toBeGreaterThan(candidates[1].lines);
  });
});

// ── U3: Stack line reflects mobile ────────────────────────────────────
describe("U3 — CLAUDE.md Stack line reflects MOBILE over API", () => {
  function ctx(tags: Tag[]): RenderContext {
    return {
      projectName: "SafetyCore",
      language: "typescript",
      tags,
    };
  }

  it("a MOBILE+API project reports a React Native stack, not a REST API", () => {
    const files = renderSentinelTree([], ctx(["UNIVERSAL", "MOBILE", "API"]));
    const root = files.find((f) => f.relativePath === "CLAUDE.md");
    expect(root).toBeDefined();
    expect(root!.content).toContain("React Native");
    expect(root!.content).not.toContain("REST/GraphQL API");
  });
});
