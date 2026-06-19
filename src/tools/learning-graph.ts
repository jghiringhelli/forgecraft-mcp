/**
 * learning-graph.csv emission — the harness as a literal Compact Knowledge Graph.
 *
 * Serializes the project's knowledge structure as a learning graph per
 * Yarmoluk & McCreary's Definition 1: G = (C, E, T, τ) in the 4-column CSV
 * schema `ConceptID,ConceptLabel,Dependencies,TaxonomyID` (Dependencies =
 * pipe-delimited prerequisite ConceptIDs; the pair (C,E) must be a DAG).
 *
 * Concepts are the harness artifacts; edges encode reading order ("understand
 * X before Y"): the routing table, the doc obligation table, and @gs-links.
 * Empirical basis: the KX experiment (experiments/kx) measured CNT-routed
 * retrieval at RDS 1.7–5.6× over dump/search baselines — the CKG economics.
 *
 * This is a DERIVED artifact (Living Documentation): regenerated on every
 * setup/refresh, never hand-edited. It is machine data, not session prose —
 * it is not part of the routed CNT and does not count against the harness budget.
 */

import { existsSync, readFileSync, writeFileSync, readdirSync } from "fs";
import { join, relative } from "path";

export interface LearningGraphResult {
  readonly written: boolean;
  readonly concepts: number;
  readonly edges: number;
}

export interface Node {
  readonly id: number;
  readonly label: string;
  readonly taxonomy: string;
  readonly deps: Set<number>;
}

/** Taxonomy categories (τ): coarse artifact classes, per LG convention (≤16). */
const TAXONOMY = {
  CNT: "CNT", // navigation tree branches
  DOC: "DOC", // core documents (PRD, TechSpec, status, manifest)
  ARCH: "ARCH", // architecture branch docs
  ADR: "ADR", // decision records
  UC: "UC", // use cases
  SPEC: "SPEC", // spec decision records
  GATE: "GATE", // quality gates
  STD: "STD", // domain standards
  CODE: "CODE", // source files carrying @gs-links
} as const;

/**
 * Emit docs/learning-graph.csv from the project's harness artifacts.
 * Always regenerates (derived artifact). Returns counts for reporting.
 *
 * @param projectDir - Project root
 * @returns written flag + concept/edge counts (written=false when no harness)
 */
export function emitLearningGraph(projectDir: string): LearningGraphResult {
  const rootMd = join(projectDir, "CLAUDE.md");
  if (!existsSync(rootMd)) return { written: false, concepts: 0, edges: 0 };

  const nodes: Node[] = [];
  const byLabel = new Map<string, Node>();
  let nextId = 1;

  const addNode = (label: string, taxonomy: string): Node => {
    const clean = sanitizeLabel(label);
    const existing = byLabel.get(clean);
    if (existing) return existing;
    const node: Node = {
      id: nextId++,
      label: clean,
      taxonomy,
      deps: new Set(),
    };
    nodes.push(node);
    byLabel.set(clean, node);
    return node;
  };
  const addEdge = (from: Node, prerequisite: Node): void => {
    // Self-references and forward cycles are excluded by construction:
    // prerequisites are always added before their dependents, and we never
    // point a node at itself.
    if (from.id !== prerequisite.id) from.deps.add(prerequisite.id);
  };

  // ── Foundational layer: CNT root + always-load ──────────────────────
  const root = addNode("CLAUDE.md (CNT root)", TAXONOMY.CNT);
  const constitution = maybeNode(
    projectDir,
    ".claude/constitution.md",
    "Constitution",
    TAXONOMY.CNT,
    addNode,
  );
  const corrections = maybeNode(
    projectDir,
    ".claude/corrections.md",
    "Corrections Log",
    TAXONOMY.CNT,
    addNode,
  );
  for (const n of [constitution, corrections]) if (n) addEdge(n, root);

  // CNT branches depend on the root (read root first, then descend)
  const lifecycle = maybeNode(
    projectDir,
    ".claude/lifecycle.md",
    "Lifecycle",
    TAXONOMY.CNT,
    addNode,
  );
  const routesCode = maybeNode(
    projectDir,
    ".claude/routes/code.md",
    "Code Routes",
    TAXONOMY.CNT,
    addNode,
  );
  const routesDocs = maybeNode(
    projectDir,
    ".claude/routes/docs.md",
    "Docs Routes",
    TAXONOMY.CNT,
    addNode,
  );
  for (const n of [lifecycle, routesCode, routesDocs]) if (n) addEdge(n, root);

  // ── Core documents ───────────────────────────────────────────────────
  const prd = maybeNode(
    projectDir,
    "docs/PRD.md",
    "PRD",
    TAXONOMY.DOC,
    addNode,
  );
  const techSpec = maybeNode(
    projectDir,
    "docs/TechSpec.md",
    "TechSpec",
    TAXONOMY.DOC,
    addNode,
  );
  const status = maybeNode(
    projectDir,
    "docs/status.md",
    "Status",
    TAXONOMY.DOC,
    addNode,
  );
  const manifest = maybeNode(
    projectDir,
    "docs/manifest.yaml",
    "Docs Manifest",
    TAXONOMY.DOC,
    addNode,
  );
  if (techSpec && prd) addEdge(techSpec, prd); // architecture derives from spec
  if (status && root) addEdge(status, root);
  if (manifest && root) addEdge(manifest, root);

  // ── Architecture branch docs (depend on TechSpec when present) ──────
  const archDir = join(projectDir, "docs", "architecture");
  if (existsSync(archDir)) {
    for (const f of readdirSync(archDir).filter((x) => x.endsWith(".md"))) {
      const n = addNode(
        `Architecture: ${f.replace(/\.md$/, "")}`,
        TAXONOMY.ARCH,
      );
      if (techSpec) addEdge(n, techSpec);
      else if (prd) addEdge(n, prd);
    }
  }

  // ── ADRs (decisions derive from the spec context) ───────────────────
  const adrNodesByFile = new Map<string, Node>();
  for (const adrDir of ["docs/adrs/active", "docs/adrs"]) {
    const dir = join(projectDir, ...adrDir.split("/"));
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir).filter(
      (x) => /^ADR-.*\.md$/i.test(x) || /^\d{4}-.*\.md$/.test(x),
    )) {
      const label = `ADR: ${f.replace(/\.md$/, "")}`;
      if (byLabel.has(sanitizeLabel(label))) continue;
      const n = addNode(label, TAXONOMY.ADR);
      adrNodesByFile.set(
        `${adrDir}/${f}`.replace("docs/adrs/active", "docs/adrs"),
        n,
      );
      adrNodesByFile.set(`docs/adrs/${f}`, n);
      if (prd) addEdge(n, prd);
    }
  }

  // ── Use cases (behavioral contracts derive from the PRD) ────────────
  const ucNodesById = new Map<string, Node>();
  const ucFile = join(projectDir, "docs", "use-cases.md");
  if (existsSync(ucFile)) {
    for (const line of readFileSync(ucFile, "utf-8").split("\n")) {
      const m = /^## (UC-\d+):\s*(.+)$/.exec(line.trim());
      if (!m) continue;
      const n = addNode(`${m[1]}: ${m[2]}`, TAXONOMY.UC);
      ucNodesById.set(m[1]!, n);
      if (prd) addEdge(n, prd);
    }
  }

  // ── Spec decision records (derive from PRD + their use cases) ───────
  const specNodesByFile = new Map<string, Node>();
  const specsDir = join(projectDir, "docs", "specs");
  if (existsSync(specsDir)) {
    for (const f of readdirSync(specsDir).filter(
      (x) => x.endsWith(".md") && x !== "README.md",
    )) {
      const n = addNode(`Spec: ${f.replace(/\.md$/, "")}`, TAXONOMY.SPEC);
      specNodesByFile.set(`docs/specs/${f}`, n);
      if (prd) addEdge(n, prd);
    }
  }

  // ── Quality gates (mandated by the constitution) ────────────────────
  for (const gatesSub of ["active", "registry"]) {
    const base = join(projectDir, ".forgecraft", "gates", gatesSub);
    if (!existsSync(base)) continue;
    walkYaml(base, (full) => {
      const rel = relative(base, full).split("\\").join("/");
      const id = rel
        .replace(/\.ya?ml$/, "")
        .split("/")
        .pop()!;
      const label = `Gate: ${id}`;
      if (byLabel.has(sanitizeLabel(label))) return;
      const n = addNode(label, TAXONOMY.GATE);
      if (constitution) addEdge(n, constitution);
      else addEdge(n, root);
    });
  }

  // ── Standards (expand the constitution per domain) ──────────────────
  const stdDir = join(projectDir, ".claude", "standards");
  if (existsSync(stdDir)) {
    for (const f of readdirSync(stdDir).filter((x) => x.endsWith(".md"))) {
      const n = addNode(`Standards: ${f.replace(/\.md$/, "")}`, TAXONOMY.STD);
      if (constitution) addEdge(n, constitution);
      else addEdge(n, root);
    }
  }

  // ── @gs-links: code nodes depend on their governing documents ───────
  const srcDir = join(projectDir, "src");
  if (existsSync(srcDir)) {
    walkSource(srcDir, (full) => {
      const head = readFileSync(full, "utf-8").slice(0, 2000);
      const m = /@gs-links:\s*(.+)/.exec(head);
      if (!m) return;
      const rel = relative(projectDir, full).split("\\").join("/");
      const codeNode = addNode(`Code: ${rel}`, TAXONOMY.CODE);
      for (const linkRaw of m[1]!.split(",")) {
        const link = linkRaw
          .trim()
          .replace(/\*\/?\s*$/, "")
          .trim();
        const target =
          specNodesByFile.get(link) ??
          adrNodesByFile.get(link) ??
          resolveLooseLink(link, ucNodesById, byLabel);
        if (target) addEdge(codeNode, target);
      }
      if (codeNode.deps.size === 0 && routesCode) addEdge(codeNode, routesCode);
    });
  }

  // ── Validate the DAG invariant at emission (enforced, not assumed) ───
  // Acyclicity is intended by construction (prerequisites precede dependents,
  // self-edges dropped); we verify it on write so a future edge source cannot
  // silently introduce a cycle. Throws with the offending path if it does.
  assertAcyclic(nodes);

  // ── Serialize (4-column CSV per Definition 1) ────────────────────────
  const lines = ["ConceptID,ConceptLabel,Dependencies,TaxonomyID"];
  let edgeCount = 0;
  for (const n of nodes) {
    const deps = [...n.deps].sort((a, b) => a - b).join("|");
    edgeCount += n.deps.size;
    lines.push(`${n.id},${csvField(n.label)},${deps},${n.taxonomy}`);
  }
  const outPath = join(projectDir, "docs", "learning-graph.csv");
  writeFileSync(outPath, lines.join("\n") + "\n", "utf-8");

  return { written: true, concepts: nodes.length, edges: edgeCount };
}

// ── Helpers ───────────────────────────────────────────────────────────

function maybeNode(
  projectDir: string,
  rel: string,
  label: string,
  taxonomy: string,
  addNode: (label: string, taxonomy: string) => Node,
): Node | null {
  return existsSync(join(projectDir, ...rel.split("/")))
    ? addNode(label, taxonomy)
    : null;
}

function walkYaml(dir: string, visit: (full: string) => void): void {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, e.name);
    if (e.isDirectory()) walkYaml(full, visit);
    else if (/\.ya?ml$/.test(e.name)) visit(full);
  }
}

function walkSource(dir: string, visit: (full: string) => void): void {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, e.name);
    if (e.isDirectory()) walkSource(full, visit);
    else if (
      /\.(ts|tsx|js|py)$/.test(e.name) &&
      !/\.test\.|\.spec\./.test(e.name)
    )
      visit(full);
  }
}

function resolveLooseLink(
  link: string,
  ucNodesById: Map<string, Node>,
  byLabel: Map<string, Node>,
): Node | undefined {
  const uc = /UC-\d+/.exec(link);
  if (uc) return ucNodesById.get(uc[0]);
  if (/use-cases\.md/.test(link)) {
    // generic use-cases link → first UC node if any (closest stable anchor)
    return ucNodesById.values().next().value;
  }
  const adr = /ADR-[\w-]+/.exec(link);
  if (adr) {
    for (const [label, node] of byLabel) {
      if (label.includes(adr[0])) return node;
    }
  }
  return undefined;
}

/**
 * Runtime DAG validation. Three-color DFS over (C,E); throws if any cycle
 * exists, naming the offending path. Makes the "DAG-validated" property true
 * at emission rather than only by construction / in tests.
 */
export function assertAcyclic(nodes: Node[]): void {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const WHITE = 0,
    GRAY = 1,
    BLACK = 2;
  const color = new Map<number, number>(nodes.map((n) => [n.id, WHITE]));
  const stack: number[] = [];
  const visit = (id: number): void => {
    color.set(id, GRAY);
    stack.push(id);
    for (const dep of byId.get(id)!.deps) {
      const c = color.get(dep);
      if (c === GRAY) {
        const path = [...stack.slice(stack.indexOf(dep)), dep]
          .map((x) => byId.get(x)?.label ?? String(x))
          .join(" → ");
        throw new Error(`learning-graph.csv is not a DAG: cycle ${path}`);
      }
      if (c === WHITE) visit(dep);
    }
    stack.pop();
    color.set(id, BLACK);
  };
  for (const n of nodes) if (color.get(n.id) === WHITE) visit(n.id);
}

function sanitizeLabel(label: string): string {
  return label
    .replace(/[,\r\n"]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function csvField(s: string): string {
  return /[,"]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
