/**
 * Tests for src/tools/harvest-debt.ts
 *
 * Covers: empty project; full-form marker (parse + 1-based line + relpath);
 * no-upgrade tail; custom scope; multi-file; skip-list (node_modules /
 * .forgecraft / dotdir + the ledger file); buildDebtLedger aggregation; the
 * write path (apply:true creates both files, default writes nothing);
 * idempotency (scan twice identical, stable order).
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  mkdirSync,
  writeFileSync,
  rmSync,
  existsSync,
  readFileSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  scanDebtMarkers,
  buildDebtLedger,
  renderDebtLedgerMarkdown,
  harvestDebtHandler,
} from "../../src/tools/harvest-debt.js";

function makeTempDir(): string {
  const dir = join(tmpdir(), `fc-debt-${Date.now()}-${Math.random()}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function write(dir: string, relPath: string, content: string): void {
  const parts = relPath.split("/");
  if (parts.length > 1) {
    mkdirSync(join(dir, ...parts.slice(0, -1)), { recursive: true });
  }
  writeFileSync(join(dir, relPath), content, "utf-8");
}

describe("scanDebtMarkers", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = makeTempDir();
  });
  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("returns no markers for an empty project", () => {
    expect(scanDebtMarkers(tempDir)).toEqual([]);
  });

  it("parses a full-form marker with 1-based line, relpath, scope, desc, upgrade", () => {
    write(
      tempDir,
      "src/a.ts",
      [
        "const x = 1;",
        "// TODO(min): inline the helper — upgrade: extract a real module",
      ].join("\n"),
    );

    const markers = scanDebtMarkers(tempDir);
    expect(markers).toHaveLength(1);
    expect(markers[0]).toEqual({
      file: "src/a.ts",
      line: 2,
      scope: "min",
      description: "inline the helper",
      upgradePath: "extract a real module",
    });
  });

  it("parses a marker with no upgrade tail (upgradePath omitted)", () => {
    write(tempDir, "src/b.ts", "// TODO(min): just a quick shortcut\n");

    const markers = scanDebtMarkers(tempDir);
    expect(markers).toHaveLength(1);
    expect(markers[0]?.description).toBe("just a quick shortcut");
    expect(markers[0]?.upgradePath).toBeUndefined();
  });

  it("captures a custom scope (perf)", () => {
    write(
      tempDir,
      "src/c.ts",
      "// TODO(perf): O(n^2) loop — upgrade: use a map\n",
    );

    const markers = scanDebtMarkers(tempDir);
    expect(markers).toHaveLength(1);
    expect(markers[0]?.scope).toBe("perf");
    expect(markers[0]?.upgradePath).toBe("use a map");
  });

  it("scans across multiple files", () => {
    write(tempDir, "src/a.ts", "// TODO(min): a\n");
    write(tempDir, "src/b.ts", "// TODO(min): b\n");

    const markers = scanDebtMarkers(tempDir);
    expect(markers).toHaveLength(2);
  });

  it("sorts markers by file then line (stable diffs)", () => {
    write(tempDir, "src/z.ts", "// TODO(min): z1\n// TODO(min): z2\n");
    write(tempDir, "src/a.ts", "x\n// TODO(min): a-late\n");

    const markers = scanDebtMarkers(tempDir);
    expect(markers.map((m) => `${m.file}:${m.line}`)).toEqual([
      "src/a.ts:2",
      "src/z.ts:1",
      "src/z.ts:2",
    ]);
  });

  it("skips node_modules, .forgecraft, dotdirs, and the ledger file", () => {
    write(tempDir, "node_modules/dep/x.ts", "// TODO(min): in dep\n");
    write(
      tempDir,
      ".forgecraft/debt.json",
      '{"x":"// TODO(min): in ledger"}\n',
    );
    write(tempDir, ".hidden/y.ts", "// TODO(min): in dotdir\n");
    write(
      tempDir,
      "docs/debt-ledger.md",
      "- `x:1` — TODO(min): in md ledger\n",
    );
    write(tempDir, "src/real.ts", "// TODO(min): real one\n");

    const markers = scanDebtMarkers(tempDir);
    expect(markers).toHaveLength(1);
    expect(markers[0]?.file).toBe("src/real.ts");
  });

  it("is idempotent — two scans return identical results in stable order", () => {
    write(tempDir, "src/a.ts", "// TODO(min): a\n");
    write(tempDir, "src/b.ts", "// TODO(perf): b — upgrade: cache\n");

    const first = scanDebtMarkers(tempDir);
    const second = scanDebtMarkers(tempDir);
    expect(second).toEqual(first);
  });
});

describe("buildDebtLedger", () => {
  it("aggregates total and byScope", () => {
    const ledger = buildDebtLedger([
      { file: "a.ts", line: 1, scope: "min", description: "x" },
      { file: "b.ts", line: 2, scope: "min", description: "y" },
      { file: "c.ts", line: 3, scope: "perf", description: "z" },
    ]);
    expect(ledger.total).toBe(3);
    expect(ledger.byScope).toEqual({ min: 2, perf: 1 });
    expect(ledger.markers).toHaveLength(3);
    expect(typeof ledger.generatedAt).toBe("string");
  });

  it("renders markdown grouped by scope with no volatile timestamp", () => {
    const ledger = buildDebtLedger([
      {
        file: "src/a.ts",
        line: 2,
        scope: "min",
        description: "inline helper",
        upgradePath: "extract module",
      },
    ]);
    const md = renderDebtLedgerMarkdown(ledger);
    expect(md).toContain("## min (1)");
    expect(md).toContain(
      "`src/a.ts:2` — inline helper (→ upgrade: extract module)",
    );
    // Stable diffs: the markdown body must NOT embed the generatedAt timestamp.
    expect(md).not.toContain(ledger.generatedAt);
  });
});

describe("harvestDebtHandler", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = makeTempDir();
  });
  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("read-only by default — writes nothing", async () => {
    write(tempDir, "src/a.ts", "// TODO(min): a\n");

    const result = await harvestDebtHandler({ project_dir: tempDir });
    const text = result.content[0]!.text;
    expect(text).toContain("Read-only preview");
    expect(existsSync(join(tempDir, ".forgecraft", "debt.json"))).toBe(false);
    expect(existsSync(join(tempDir, "docs", "debt-ledger.md"))).toBe(false);
  });

  it("apply:true creates both ledger artifacts", async () => {
    write(
      tempDir,
      "src/a.ts",
      "// TODO(min): a — upgrade: do the real thing\n",
    );

    const result = await harvestDebtHandler({
      project_dir: tempDir,
      apply: true,
    });
    const text = result.content[0]!.text;
    expect(text).toContain("Wrote");

    const jsonPath = join(tempDir, ".forgecraft", "debt.json");
    const mdPath = join(tempDir, "docs", "debt-ledger.md");
    expect(existsSync(jsonPath)).toBe(true);
    expect(existsSync(mdPath)).toBe(true);

    const json = JSON.parse(readFileSync(jsonPath, "utf-8")) as {
      total: number;
      generatedAt: string;
    };
    expect(json.total).toBe(1);
    expect(typeof json.generatedAt).toBe("string");

    const md = readFileSync(mdPath, "utf-8");
    expect(md).toContain("# Debt Ledger");
    expect(md).not.toContain(json.generatedAt);
  });

  it("reports an empty ledger cleanly", async () => {
    const result = await harvestDebtHandler({ project_dir: tempDir });
    const text = result.content[0]!.text;
    expect(text).toContain("No inline debt markers found");
  });
});
