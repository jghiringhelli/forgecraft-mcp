/**
 * Tests for docs/learning-graph.csv emission — the harness serialized as a
 * Compact Knowledge Graph (Yarmoluk & McCreary Definition 1).
 *
 * Validity properties asserted (their corpus §3.4 + Definition 1):
 * - 4-column schema, header exact
 * - (C,E) is a DAG: no self-references, no cycles
 * - ≥2 foundational concepts (zero prerequisites)
 * - pipe-delimited integer dependencies referencing existing ConceptIDs
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
  emitLearningGraph,
  assertAcyclic,
  type Node,
} from "../../src/tools/learning-graph.js";

function makeTempDir(): string {
  const dir = join(tmpdir(), `lg-test-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

/** Build a minimal harness with every artifact class represented. */
function buildHarness(dir: string): void {
  const w = (rel: string, content: string) => {
    const full = join(dir, ...rel.split("/"));
    mkdirSync(join(full, ".."), { recursive: true });
    writeFileSync(full, content, "utf-8");
  };
  w("CLAUDE.md", "# Root\n");
  w(".claude/constitution.md", "# Constitution\n");
  w(".claude/corrections.md", "# Corrections\n");
  w(".claude/lifecycle.md", "# Lifecycle\n");
  w(".claude/routes/code.md", "# Code routes\n");
  w(".claude/routes/docs.md", "# Docs routes\n");
  w(".claude/standards/api.md", "# API standards\n");
  w("docs/PRD.md", "# PRD\n");
  w("docs/TechSpec.md", "# TechSpec\n");
  w("docs/status.md", "# Status\n");
  w("docs/manifest.yaml", "project:\n  name: t\n");
  w("docs/architecture/layers.md", "# Layers\n");
  w("docs/architecture/modules.md", "# Modules\n");
  w(
    "docs/use-cases.md",
    "# UCs\n\n## UC-001: Create Thing\n\n## UC-002: List Things\n",
  );
  w("docs/specs/things.md", "# Things spec\n");
  w("docs/adrs/ADR-0001-stack.md", "# ADR\n");
  w(
    ".forgecraft/gates/registry/security/dependency-audit.yaml",
    "id: dependency-audit\n",
  );
  w(
    "src/http/ThingController.ts",
    "/**\n * @gs-links: docs/specs/things.md, docs/use-cases.md\n */\nexport {};\n",
  );
  w(
    "src/adapters/ThingRepo.ts",
    "/**\n * @gs-links: docs/adrs/ADR-0001-stack.md\n */\nexport {};\n",
  );
}

function parseCsv(dir: string) {
  const raw = readFileSync(
    join(dir, "docs", "learning-graph.csv"),
    "utf-8",
  ).trim();
  const [header, ...rows] = raw.split("\n");
  return {
    header,
    rows: rows.map((r) => {
      // naive CSV split is fine: labels with commas are quoted, tests avoid them
      const m = /^(\d+),("(?:[^"]|"")*"|[^,]*),([^,]*),(\w+)$/.exec(r);
      if (!m) throw new Error("unparseable row: " + r);
      return {
        id: parseInt(m[1]!, 10),
        label: m[2]!.replace(/^"|"$/g, "").replace(/""/g, '"'),
        deps: m[3] ? m[3].split("|").filter(Boolean).map(Number) : [],
        taxonomy: m[4]!,
      };
    }),
  };
}

describe("emitLearningGraph", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = makeTempDir();
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("returns written:false when no harness exists", () => {
    const r = emitLearningGraph(tempDir);
    expect(r.written).toBe(false);
    expect(existsSync(join(tempDir, "docs", "learning-graph.csv"))).toBe(false);
  });

  it("emits the exact 4-column header (Definition 1 serialization)", () => {
    buildHarness(tempDir);
    emitLearningGraph(tempDir);
    const { header } = parseCsv(tempDir);
    expect(header).toBe("ConceptID,ConceptLabel,Dependencies,TaxonomyID");
  });

  it("covers all artifact classes in the taxonomy", () => {
    buildHarness(tempDir);
    const r = emitLearningGraph(tempDir);
    expect(r.written).toBe(true);
    const { rows } = parseCsv(tempDir);
    const taxa = new Set(rows.map((r) => r.taxonomy));
    for (const t of [
      "CNT",
      "DOC",
      "ARCH",
      "ADR",
      "UC",
      "SPEC",
      "GATE",
      "STD",
      "CODE",
    ]) {
      expect(taxa, `missing taxonomy ${t}`).toContain(t);
    }
  });

  it("the graph is a DAG: no self-references and no cycles", () => {
    buildHarness(tempDir);
    emitLearningGraph(tempDir);
    const { rows } = parseCsv(tempDir);
    const deps = new Map(rows.map((r) => [r.id, r.deps]));
    for (const r of rows)
      expect(r.deps, `self-ref in ${r.id}`).not.toContain(r.id);
    // cycle detection via DFS coloring
    const color = new Map<number, number>(); // 0 white, 1 grey, 2 black
    const visit = (id: number): boolean => {
      if (color.get(id) === 1) return false; // cycle
      if (color.get(id) === 2) return true;
      color.set(id, 1);
      for (const d of deps.get(id) ?? []) if (!visit(d)) return false;
      color.set(id, 2);
      return true;
    };
    for (const r of rows) expect(visit(r.id), "cycle detected").toBe(true);
  });

  it("has at least 2 foundational concepts (zero prerequisites)", () => {
    buildHarness(tempDir);
    emitLearningGraph(tempDir);
    const { rows } = parseCsv(tempDir);
    expect(
      rows.filter((r) => r.deps.length === 0).length,
    ).toBeGreaterThanOrEqual(2);
  });

  it("all dependencies reference existing ConceptIDs", () => {
    buildHarness(tempDir);
    emitLearningGraph(tempDir);
    const { rows } = parseCsv(tempDir);
    const ids = new Set(rows.map((r) => r.id));
    for (const r of rows)
      for (const d of r.deps)
        expect(ids, `dangling dep ${d} in ${r.id}`).toContain(d);
  });

  it("@gs-links become CODE→SPEC and CODE→ADR edges", () => {
    buildHarness(tempDir);
    emitLearningGraph(tempDir);
    const { rows } = parseCsv(tempDir);
    const byLabel = new Map(rows.map((r) => [r.label, r]));
    const spec = byLabel.get("Spec: things");
    const adr = [...byLabel.values()].find((r) => r.taxonomy === "ADR");
    const controller = [...byLabel.values()].find((r) =>
      r.label.includes("ThingController"),
    );
    const repo = [...byLabel.values()].find((r) =>
      r.label.includes("ThingRepo"),
    );
    expect(controller!.deps).toContain(spec!.id);
    expect(repo!.deps).toContain(adr!.id);
  });

  it("use cases derive from the PRD (UC depends on PRD)", () => {
    buildHarness(tempDir);
    emitLearningGraph(tempDir);
    const { rows } = parseCsv(tempDir);
    const prd = rows.find((r) => r.label === "PRD")!;
    const ucs = rows.filter((r) => r.taxonomy === "UC");
    expect(ucs.length).toBe(2);
    for (const uc of ucs) expect(uc.deps).toContain(prd.id);
  });

  it("regenerates (overwrites) on repeat emission — derived artifact", () => {
    buildHarness(tempDir);
    const first = emitLearningGraph(tempDir);
    const second = emitLearningGraph(tempDir);
    expect(second.written).toBe(true);
    expect(second.concepts).toBe(first.concepts);
  });
});

describe("assertAcyclic (runtime DAG validation)", () => {
  const mk = (id: number, deps: number[]): Node => ({
    id,
    label: `n${id}`,
    taxonomy: "DOC",
    deps: new Set(deps),
  });

  it("passes a valid DAG without throwing", () => {
    expect(() =>
      assertAcyclic([mk(1, []), mk(2, [1]), mk(3, [1, 2])]),
    ).not.toThrow();
  });

  it("throws and names the path when a cycle exists", () => {
    expect(() => assertAcyclic([mk(1, [2]), mk(2, [1])])).toThrow(/not a DAG/);
  });
});
