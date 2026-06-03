/**
 * Tests for src/tools/gate-genesis.ts
 *
 * Gate genesis proposes new gates from repeated friction:
 *   - gate-violations.jsonl entries (same hook ≥3x)
 *   - corrections.md entries (same category ≥2x)
 * Candidates become drafts in .forgecraft/gates/drafts/ — never auto-activated.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  mkdirSync,
  writeFileSync,
  existsSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  proposeGateCandidates,
  writeGateDrafts,
} from "../../src/tools/gate-genesis.js";

function makeTempDir(): string {
  const dir = join(tmpdir(), `gate-genesis-test-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function writeViolations(
  projectRoot: string,
  entries: Array<{ hook: string; message?: string }>,
): void {
  const dir = join(projectRoot, ".forgecraft");
  mkdirSync(dir, { recursive: true });
  const lines = entries
    .map((e) =>
      JSON.stringify({
        hook: e.hook,
        severity: "error",
        message: e.message ?? `violation from ${e.hook}`,
        timestamp: "2026-06-01T00:00:00Z",
      }),
    )
    .join("\n");
  writeFileSync(join(dir, "gate-violations.jsonl"), lines + "\n", "utf-8");
}

function writeCorrections(projectRoot: string, entries: string[]): void {
  const dir = join(projectRoot, ".claude");
  mkdirSync(dir, { recursive: true });
  const content = ["## Corrections Log", "", ...entries, ""].join("\n");
  writeFileSync(join(dir, "corrections.md"), content, "utf-8");
}

describe("proposeGateCandidates", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = makeTempDir();
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("returns empty when no violation or correction files exist", () => {
    expect(proposeGateCandidates(tempDir)).toHaveLength(0);
  });

  it("proposes a candidate when the same hook is violated 3+ times", () => {
    writeViolations(tempDir, [
      { hook: "pre-commit-prod-quality", message: "hardcoded URL in src/a.ts" },
      { hook: "pre-commit-prod-quality", message: "hardcoded URL in src/b.ts" },
      { hook: "pre-commit-prod-quality", message: "hardcoded URL in src/c.ts" },
    ]);
    const candidates = proposeGateCandidates(tempDir);
    expect(candidates).toHaveLength(1);
    expect(candidates[0].source).toBe("violations");
    expect(candidates[0].pattern).toBe("pre-commit-prod-quality");
    expect(candidates[0].occurrences).toBe(3);
    expect(candidates[0].examples.length).toBeGreaterThan(0);
  });

  it("does not propose below the violation threshold (2 occurrences)", () => {
    writeViolations(tempDir, [
      { hook: "pre-commit-secrets" },
      { hook: "pre-commit-secrets" },
    ]);
    expect(proposeGateCandidates(tempDir)).toHaveLength(0);
  });

  it("proposes a candidate when the same correction category appears 2+ times", () => {
    writeCorrections(tempDir, [
      "2026-05-01 | [architecture] business logic in route handler | delegate to service",
      "2026-05-15 | [architecture] direct DB call in controller | use repository layer",
    ]);
    const candidates = proposeGateCandidates(tempDir);
    expect(candidates).toHaveLength(1);
    expect(candidates[0].source).toBe("corrections");
    expect(candidates[0].pattern).toBe("architecture");
    expect(candidates[0].occurrences).toBe(2);
  });

  it("ignores commented-out example entries in the corrections stub", () => {
    const dir = join(tempDir, ".claude");
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, "corrections.md"),
      [
        "## Corrections Log",
        "",
        "<!-- Add entries below. Examples:",
        "2026-01-15 | [architecture] example one | fix one",
        "2026-01-20 | [architecture] example two | fix two",
        "-->",
        "",
      ].join("\n"),
      "utf-8",
    );
    expect(proposeGateCandidates(tempDir)).toHaveLength(0);
  });

  it("skips patterns already covered by an active gate", () => {
    writeViolations(tempDir, [
      { hook: "pre-commit-prod-quality" },
      { hook: "pre-commit-prod-quality" },
      { hook: "pre-commit-prod-quality" },
    ]);
    // An active gate already formalizes this pattern
    const activeDir = join(tempDir, ".forgecraft", "gates", "active");
    mkdirSync(activeDir, { recursive: true });
    writeFileSync(
      join(activeDir, "prod-quality.yaml"),
      "id: prod-quality\n",
      "utf-8",
    );

    expect(proposeGateCandidates(tempDir)).toHaveLength(0);
  });

  it("skips malformed JSONL lines without dropping valid ones", () => {
    const dir = join(tempDir, ".forgecraft");
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, "gate-violations.jsonl"),
      [
        '{"hook":"pre-commit-compile","severity":"error","message":"a","timestamp":"t"}',
        "{ broken json",
        '{"hook":"pre-commit-compile","severity":"error","message":"b","timestamp":"t"}',
        '{"hook":"pre-commit-compile","severity":"error","message":"c","timestamp":"t"}',
      ].join("\n"),
      "utf-8",
    );
    const candidates = proposeGateCandidates(tempDir);
    expect(candidates).toHaveLength(1);
    expect(candidates[0].occurrences).toBe(3);
  });

  it("sorts candidates by occurrence count, highest first", () => {
    writeViolations(tempDir, [
      { hook: "pre-commit-compile" },
      { hook: "pre-commit-compile" },
      { hook: "pre-commit-compile" },
      { hook: "pre-commit-secrets" },
      { hook: "pre-commit-secrets" },
      { hook: "pre-commit-secrets" },
      { hook: "pre-commit-secrets" },
      { hook: "pre-commit-secrets" },
    ]);
    const candidates = proposeGateCandidates(tempDir);
    expect(candidates).toHaveLength(2);
    expect(candidates[0].pattern).toBe("pre-commit-secrets");
    expect(candidates[1].pattern).toBe("pre-commit-compile");
  });
});

describe("writeGateDrafts", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = makeTempDir();
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("writes a draft YAML with FILL markers and observed evidence", () => {
    writeViolations(tempDir, [
      { hook: "pre-commit-prod-quality", message: "hardcoded URL in src/a.ts" },
      { hook: "pre-commit-prod-quality", message: "hardcoded URL in src/b.ts" },
      { hook: "pre-commit-prod-quality", message: "hardcoded URL in src/c.ts" },
    ]);
    const candidates = proposeGateCandidates(tempDir);
    const written = writeGateDrafts(tempDir, candidates);
    expect(written).toHaveLength(1);

    const draftPath = join(tempDir, written[0]!);
    expect(existsSync(draftPath)).toBe(true);
    const content = readFileSync(draftPath, "utf-8");
    expect(content).toContain("DRAFT gate");
    expect(content).toContain("FILL");
    expect(content).toContain("generalizable: false");
    expect(content).toContain("status: draft");
    expect(content).toContain("hardcoded URL in src/a.ts");
    // Provenance: genesis drafts are marked as system-detected
    expect(content).toContain("origin: genesis");
    expect(content).toContain("detectedFrom: violations");
  });

  it("never overwrites an existing draft (idempotent)", () => {
    writeViolations(tempDir, [
      { hook: "pre-commit-compile" },
      { hook: "pre-commit-compile" },
      { hook: "pre-commit-compile" },
    ]);
    const candidates = proposeGateCandidates(tempDir);
    const first = writeGateDrafts(tempDir, candidates);
    expect(first).toHaveLength(1);
    const second = writeGateDrafts(tempDir, candidates);
    expect(second).toHaveLength(0);
  });

  it("returns empty for an empty candidate list without creating directories", () => {
    const written = writeGateDrafts(tempDir, []);
    expect(written).toHaveLength(0);
    expect(existsSync(join(tempDir, ".forgecraft", "gates", "drafts"))).toBe(
      false,
    );
  });

  it("draft existence suppresses re-proposal on the next cycle", () => {
    writeViolations(tempDir, [
      { hook: "pre-commit-compile" },
      { hook: "pre-commit-compile" },
      { hook: "pre-commit-compile" },
    ]);
    const candidates = proposeGateCandidates(tempDir);
    writeGateDrafts(tempDir, candidates);
    // Next cycle: same violations still in the log, but the draft covers them
    expect(proposeGateCandidates(tempDir)).toHaveLength(0);
  });
});
