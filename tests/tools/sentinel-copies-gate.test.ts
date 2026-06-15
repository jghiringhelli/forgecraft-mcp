/**
 * Tests for src/tools/sentinel-copies-gate.ts (PT-2).
 *
 * Covers: resolveSentinelTargets defaults/override/unknown-filtering, the
 * override loader (rationale mandatory / empty / missing file), and the pure
 * evaluator (no-config-green, in-sync-green, content-drift, missing,
 * not-opted-ignored, overridden-with/without-rationale) plus evaluator purity.
 *
 * To produce a byte-identical in-sync copy without coupling to template prose,
 * the test re-renders the canonical body the same way the evaluator does and
 * writes that to disk — then asserts the evaluator agrees (green).
 */

import { describe, it, expect, afterEach } from "vitest";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
  existsSync,
  readdirSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  resolveSentinelTargets,
  loadSentinelOverrides,
  evaluateSentinelCopies,
  DEFAULT_SENTINEL_TARGETS,
} from "../../src/tools/sentinel-copies-gate.js";
import { loadAllTemplatesWithExtras } from "../../src/registry/loader.js";
import { composeTemplates } from "../../src/registry/composer.js";
import { detectProjectContext } from "../../src/analyzers/project-context.js";
import { detectLanguage } from "../../src/analyzers/language-detector.js";
import { inferProjectName } from "../../src/tools/refresh-analyzer.js";
import {
  renderCanonicalSentinel,
  projectSentinel,
} from "../../src/registry/sentinel-projection.js";
import {
  buildPlaceholderContext,
  resolveTemplatePlaceholders,
} from "../../src/shared/template-resolver.js";

// ── Helpers ───────────────────────────────────────────────────────────

const tmpDirs: string[] = [];

function makeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "fc-sentinel-copies-"));
  tmpDirs.push(dir);
  return dir;
}

function write(dir: string, relPath: string, content: string): void {
  const parts = relPath.split("/");
  if (parts.length > 1) {
    mkdirSync(join(dir, ...parts.slice(0, -1)), { recursive: true });
  }
  writeFileSync(join(dir, relPath), content, "utf-8");
}

/** Re-render the exact projected content the evaluator expects for a target. */
function expectedProjection(dir: string, target: string): string {
  const tags = ["UNIVERSAL"] as Parameters<typeof composeTemplates>[0];
  const composed = composeTemplates(
    tags,
    loadAllTemplatesWithExtras(undefined, undefined),
    {},
  );
  const context = detectProjectContext(
    dir,
    inferProjectName(dir),
    detectLanguage(dir),
    tags,
  );
  const body = renderCanonicalSentinel(composed.instructionBlocks, context);
  const projected = projectSentinel(target, body, context);
  if (projected === null) throw new Error(`no projection for ${target}`);
  const placeholderContext = buildPlaceholderContext(
    dir,
    undefined,
    tags.map(String),
  );
  return resolveTemplatePlaceholders(projected, placeholderContext);
}

afterEach(() => {
  while (tmpDirs.length > 0) {
    const dir = tmpDirs.pop()!;
    rmSync(dir, { recursive: true, force: true });
  }
});

// ── resolveSentinelTargets ────────────────────────────────────────────

describe("resolveSentinelTargets", () => {
  it("defaults to ['agents-md'] when sentinel.targets absent", () => {
    expect(resolveSentinelTargets(null)).toEqual([...DEFAULT_SENTINEL_TARGETS]);
    expect(resolveSentinelTargets({})).toEqual(["agents-md"]);
  });

  it("returns configured targets, filtering unknown and claude/cnt", () => {
    expect(
      resolveSentinelTargets({
        sentinel: { targets: ["copilot", "cursor", "claude", "nope"] },
      }),
    ).toEqual(["copilot", "cursor"]);
  });

  it("de-duplicates", () => {
    expect(
      resolveSentinelTargets({ sentinel: { targets: ["cline", "cline"] } }),
    ).toEqual(["cline"]);
  });

  it("falls back to default when configured list is empty", () => {
    expect(resolveSentinelTargets({ sentinel: { targets: [] } })).toEqual([
      "agents-md",
    ]);
  });
});

// ── loadSentinelOverrides ─────────────────────────────────────────────

describe("loadSentinelOverrides", () => {
  it("returns [] when no config file exists", () => {
    expect(loadSentinelOverrides(makeTempDir())).toEqual([]);
  });

  it("accepts an override with a non-empty rationale", () => {
    const dir = makeTempDir();
    write(
      dir,
      "forgecraft.yaml",
      "sentinel:\n  overrides:\n    - target: copilot\n      rationale: hand-tuned for org\n",
    );
    expect(loadSentinelOverrides(dir)).toEqual([
      { target: "copilot", rationale: "hand-tuned for org" },
    ]);
  });

  it("drops an override with an empty/whitespace/missing rationale", () => {
    const dir = makeTempDir();
    write(
      dir,
      "forgecraft.yaml",
      "sentinel:\n  overrides:\n    - target: copilot\n      rationale: '   '\n    - target: cline\n",
    );
    expect(loadSentinelOverrides(dir)).toEqual([]);
  });
});

// ── evaluateSentinelCopies ────────────────────────────────────────────

describe("evaluateSentinelCopies", () => {
  it("is green when there is no forgecraft.yaml (nothing to govern)", () => {
    const result = evaluateSentinelCopies(makeTempDir());
    expect(result.status).toBe("green");
    expect(result.blocked).toBe(false);
  });

  it("is green (default copy-set) when AGENTS.md matches the canonical body", () => {
    const dir = makeTempDir();
    write(dir, "forgecraft.yaml", "tags:\n  - UNIVERSAL\n");
    write(dir, "AGENTS.md", expectedProjection(dir, "agents-md"));
    const result = evaluateSentinelCopies(dir);
    expect(result.status).toBe("green");
    expect(result.drifted).toEqual([]);
    expect(result.blocked).toBe(false);
  });

  it("reports content-drift when an opted-in copy differs", () => {
    const dir = makeTempDir();
    write(dir, "forgecraft.yaml", "tags:\n  - UNIVERSAL\n");
    write(dir, "AGENTS.md", "# AGENTS.md\nstale hand-edited content\n");
    const result = evaluateSentinelCopies(dir);
    expect(result.blocked).toBe(true);
    expect(result.drifted).toEqual([
      { target: "agents-md", path: "AGENTS.md", reason: "content-drift" },
    ]);
  });

  it("reports missing when an opted-in copy is absent", () => {
    const dir = makeTempDir();
    write(
      dir,
      "forgecraft.yaml",
      "tags:\n  - UNIVERSAL\nsentinel:\n  targets:\n    - copilot\n",
    );
    const result = evaluateSentinelCopies(dir);
    expect(result.blocked).toBe(true);
    expect(result.drifted).toEqual([
      {
        target: "copilot",
        path: ".github/copilot-instructions.md",
        reason: "missing",
      },
    ]);
  });

  it("ignores a target that is not opted in", () => {
    const dir = makeTempDir();
    // default copy-set = agents-md only; copilot is NOT opted in.
    write(dir, "forgecraft.yaml", "tags:\n  - UNIVERSAL\n");
    write(dir, "AGENTS.md", expectedProjection(dir, "agents-md"));
    // a stale, non-opted copilot copy on disk must not affect the gate
    write(dir, ".github/copilot-instructions.md", "totally stale\n");
    const result = evaluateSentinelCopies(dir);
    expect(result.status).toBe("green");
    expect(result.blocked).toBe(false);
  });

  it("does not block when a drifted target has a valid override", () => {
    const dir = makeTempDir();
    write(
      dir,
      "forgecraft.yaml",
      "tags:\n  - UNIVERSAL\nsentinel:\n  targets:\n    - copilot\n  overrides:\n    - target: copilot\n      rationale: hand-tuned\n",
    );
    // copilot copy missing → would drift, but override excuses it
    const result = evaluateSentinelCopies(dir);
    expect(result.blocked).toBe(false);
    expect(result.status).toBe("green");
    expect(result.drifted).toEqual([]);
    expect(result.overridden).toEqual([
      {
        target: "copilot",
        path: ".github/copilot-instructions.md",
        reason: "missing",
      },
    ]);
  });

  it("blocks when a drifted target's override has an empty rationale", () => {
    const dir = makeTempDir();
    write(
      dir,
      "forgecraft.yaml",
      "tags:\n  - UNIVERSAL\nsentinel:\n  targets:\n    - copilot\n  overrides:\n    - target: copilot\n      rationale: '   '\n",
    );
    const result = evaluateSentinelCopies(dir);
    expect(result.blocked).toBe(true);
    expect(result.drifted).toHaveLength(1);
    expect(result.overridden).toEqual([]);
  });

  it("is PURE — writes nothing and creates no files", () => {
    const dir = makeTempDir();
    write(dir, "forgecraft.yaml", "tags:\n  - UNIVERSAL\n");
    write(dir, "AGENTS.md", "# AGENTS.md\ndrifted\n");
    const before = readdirSync(dir).sort();
    evaluateSentinelCopies(dir);
    const after = readdirSync(dir).sort();
    expect(after).toEqual(before);
    expect(existsSync(join(dir, ".forgecraft"))).toBe(false);
  });
});
