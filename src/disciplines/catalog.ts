/**
 * Structural disciplines catalog.
 *
 * A "discipline" is a recognised way to organise a codebase — SOLID,
 * hexagonal, layered, clean architecture, DDD, and TDD-as-a-practice.
 * Each entry knows two things:
 *
 *   1. `detect(repoPath)` — does this discipline appear to apply at all?
 *      A heuristic scan of file names, directory structure, and well-known
 *      vocabulary. Cheap, read-only, no parsing.
 *   2. `score(repoPath)` — given that it applies, how well is it followed?
 *      0/1/2 scale, mirroring the existing GS scorer convention. Bodies
 *      are placeholders for now; calibration anchors come later.
 *
 * The catalog is intentionally additive: a repo can match many disciplines
 * at once (e.g. a hexagonal codebase that also speaks DDD), and a repo
 * with nothing recognisable matches none.
 */
import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

export interface DetectResult {
  applies: boolean;
  evidence: string[];
}

export interface ScoreResult {
  score: 0 | 1 | 2;
  evidence: string[];
}

export interface Discipline {
  name: string;
  description: string;
  detect(repoPath: string): DetectResult;
  score(repoPath: string): ScoreResult;
}

const TODO_PLACEHOLDER: ScoreResult = {
  score: 0,
  evidence: ["TODO: scoring heuristic not yet implemented (skeleton)"],
};

function listDirsRecursive(repoPath: string, maxDepth = 3): string[] {
  const out: string[] = [];
  function walk(dir: string, depth: number): void {
    if (depth > maxDepth) return;
    let entries: import("node:fs").Dirent[];
    try {
      entries = readdirSync(dir, { withFileTypes: true, encoding: "utf8" });
    } catch {
      return;
    }
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      const name: string = e.name as string;
      if (name === "node_modules" || name.startsWith(".")) continue;
      const full = join(dir, name);
      out.push(full);
      walk(full, depth + 1);
    }
  }
  walk(repoPath, 0);
  return out;
}

function hasDirNamed(repoPath: string, names: readonly string[]): string[] {
  const dirs = listDirsRecursive(repoPath);
  const lower = new Set(names.map((n) => n.toLowerCase()));
  const hits: string[] = [];
  for (const d of dirs) {
    const base = d.split(/[\\/]/).pop()!.toLowerCase();
    if (lower.has(base)) hits.push(d);
  }
  return hits;
}

function hasAnyFile(repoPath: string, files: readonly string[]): string[] {
  const hits: string[] = [];
  for (const f of files) {
    const full = join(repoPath, f);
    if (existsSync(full) && safeIsFile(full)) hits.push(f);
  }
  return hits;
}

function safeIsFile(p: string): boolean {
  try {
    return statSync(p).isFile();
  } catch {
    return false;
  }
}

const SOLID: Discipline = {
  name: "SOLID",
  description: "Class-oriented design principles (SRP, OCP, LSP, ISP, DIP).",
  detect(repoPath) {
    const interfaceDirs = hasDirNamed(repoPath, ["interfaces", "abstractions"]);
    const classy = hasAnyFile(repoPath, [
      "tsconfig.json",
      "pom.xml",
      "build.gradle",
      "*.csproj",
    ]);
    const evidence: string[] = [];
    if (interfaceDirs.length > 0)
      evidence.push(`interface dirs: ${interfaceDirs.length}`);
    if (classy.length > 0)
      evidence.push(`class-oriented project: ${classy.join(", ")}`);
    return { applies: evidence.length > 0, evidence };
  },
  score: () => TODO_PLACEHOLDER,
};

const TDD: Discipline = {
  name: "TDD",
  description: "Test-driven development practice (tests present and central).",
  detect(repoPath) {
    const testDirs = hasDirNamed(repoPath, [
      "tests",
      "test",
      "__tests__",
      "spec",
    ]);
    const configs = hasAnyFile(repoPath, [
      "vitest.config.ts",
      "vitest.config.js",
      "jest.config.js",
      "jest.config.ts",
      "karma.conf.js",
      "phpunit.xml",
    ]);
    const evidence: string[] = [];
    if (testDirs.length > 0) evidence.push(`test dirs: ${testDirs.length}`);
    if (configs.length > 0)
      evidence.push(`test configs: ${configs.join(", ")}`);
    return { applies: testDirs.length > 0 || configs.length > 0, evidence };
  },
  score: () => TODO_PLACEHOLDER,
};

const HEXAGONAL: Discipline = {
  name: "Hexagonal",
  description: "Ports & adapters — domain isolated behind explicit ports.",
  detect(repoPath) {
    const dirs = hasDirNamed(repoPath, ["ports", "adapters", "hexagon"]);
    const evidence = dirs.length > 0 ? [`hexagonal dirs: ${dirs.length}`] : [];
    return { applies: dirs.length >= 2, evidence };
  },
  score: () => TODO_PLACEHOLDER,
};

const LAYERED: Discipline = {
  name: "Layered",
  description:
    "Classic n-tier separation (controllers / services / repositories).",
  detect(repoPath) {
    const dirs = hasDirNamed(repoPath, [
      "controllers",
      "services",
      "repositories",
      "dao",
      "presentation",
      "business",
      "persistence",
    ]);
    const evidence = dirs.length > 0 ? [`layered dirs: ${dirs.length}`] : [];
    return { applies: dirs.length >= 2, evidence };
  },
  score: () => TODO_PLACEHOLDER,
};

const CLEAN_ARCHITECTURE: Discipline = {
  name: "CleanArchitecture",
  description:
    "Concentric rings — entities, use cases, interface adapters, frameworks.",
  detect(repoPath) {
    const dirs = hasDirNamed(repoPath, [
      "entities",
      "usecases",
      "use-cases",
      "interface-adapters",
      "frameworks",
    ]);
    const evidence = dirs.length > 0 ? [`clean-arch dirs: ${dirs.length}`] : [];
    return { applies: dirs.length >= 2, evidence };
  },
  score: () => TODO_PLACEHOLDER,
};

const DDD: Discipline = {
  name: "DDD",
  description:
    "Domain-driven design vocabulary (aggregate, value object, repository).",
  detect(repoPath) {
    const dirs = hasDirNamed(repoPath, [
      "aggregates",
      "valueobjects",
      "value-objects",
      "domain",
      "domainevents",
      "domain-events",
      "boundedcontexts",
    ]);
    const evidence = dirs.length > 0 ? [`ddd dirs: ${dirs.length}`] : [];
    return { applies: dirs.length >= 1, evidence };
  },
  score: () => TODO_PLACEHOLDER,
};

export const DISCIPLINES: readonly Discipline[] = [
  SOLID,
  TDD,
  HEXAGONAL,
  LAYERED,
  CLEAN_ARCHITECTURE,
  DDD,
];
