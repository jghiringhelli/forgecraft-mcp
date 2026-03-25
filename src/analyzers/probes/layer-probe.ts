/**
 * Layer violations probe — detects DB client imports in route/controller files.
 */

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, extname } from "node:path";
import { spawnSync } from "node:child_process";
import { detectLanguage } from "../language-detector.js";
import type { SupportedLanguage } from "../language-detector.js";
import { ALL_EXTENSIONS, LOC_SKIP_DIRS } from "./tool-runner.js";
import type { ProbeResult } from "./tool-runner.js";

export interface LayerData {
  readonly violations: number;
  readonly source: "depcruise" | "internal";
  readonly details: string[];
}

const DB_PATTERNS: Partial<Record<SupportedLanguage, readonly RegExp[]>> = {
  typescript: [
    /from ['"]@prisma\/client['"]/,
    /require\(['"]@prisma\/client['"]\)/,
    /from ['"]mongoose['"]/,
    /from ['"]pg['"]/,
    /from ['"]mysql2['"]/,
    /from ['"]sqlite3['"]/,
    /from ['"]typeorm['"]/,
    /from ['"]sequelize['"]/,
    /from ['"]knex['"]/,
  ],
  python: [
    /from sqlalchemy/,
    /import sqlalchemy/,
    /from django\.db/,
    /import pymongo/,
    /import psycopg2/,
    /import pymysql/,
  ],
  go: [
    /"database\/sql"/,
    /"gorm\.io\//,
    /"github\.com\/go-pg\//,
    /"github\.com\/jmoiron\/sqlx"/,
  ],
  rust: [/use diesel::/, /use sqlx::/, /use rusqlite::/],
  java: [
    /@Repository/,
    /import javax\.persistence/,
    /import org\.springframework\.data/,
    /import org\.hibernate/,
  ],
  ruby: [/ActiveRecord::/, /Sequel\./],
};

const ROUTE_DIR_PATTERNS = [
  /^routes?$/i,
  /^controllers?$/i,
  /^handlers?$/i,
  /^endpoints?$/i,
  /^api$/i,
  /^views?$/i,
  /^actions?$/i,
];

/**
 * Check for layer violations — DB client imports in route/controller files.
 * Uses dependency-cruiser for JS/TS when available; falls back to pattern scan.
 */
export function probeLayerViolations(
  projectDir: string,
): ProbeResult<LayerData> {
  const language = detectLanguage(projectDir);

  if (language === "typescript") {
    const result = tryDependencyCruiser(projectDir);
    if (result) return result;
  }

  const patterns = DB_PATTERNS[language] ?? DB_PATTERNS["typescript"]!;
  const violations = scanForLayerViolations(projectDir, patterns);
  const installHint =
    language === "typescript"
      ? "For precise dependency rules: `npm i -D dependency-cruiser && npx depcruise --init`"
      : undefined;

  return {
    available: true,
    data: {
      violations: violations.length,
      source: "internal",
      details: violations,
    },
    ...(installHint ? { installHint } : {}),
  };
}

function tryDependencyCruiser(
  projectDir: string,
): ProbeResult<LayerData> | null {
  const hasConfig =
    existsSync(join(projectDir, ".dependency-cruiser.js")) ||
    existsSync(join(projectDir, ".dependency-cruiser.cjs"));
  if (!hasConfig) return null;

  const binPath = join(projectDir, "node_modules", ".bin", "depcruise");
  const winBin = binPath + ".cmd";
  const bin =
    process.platform === "win32" && existsSync(winBin)
      ? winBin
      : existsSync(binPath)
        ? binPath
        : null;
  if (!bin) return null;

  const r = spawnSync(bin, ["--output-type", "json", "src"], {
    cwd: projectDir,
    maxBuffer: 5 * 1024 * 1024,
  });
  try {
    const out = JSON.parse(r.stdout.toString()) as {
      summary: {
        violations: Array<{ rule: { name: string }; from: string; to: string }>;
      };
    };
    const viols = out.summary.violations;
    return {
      available: true,
      data: {
        violations: viols.length,
        source: "depcruise",
        details: viols.map((v) => `${v.from} → ${v.to} (${v.rule.name})`),
      },
    };
  } catch {
    return null;
  }
}

function scanForLayerViolations(
  projectDir: string,
  patterns: readonly RegExp[],
): string[] {
  const violations: string[] = [];
  const countableExts = new Set(ALL_EXTENSIONS);

  function walk(dir: string, inRouteLayer: boolean): void {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const name of entries) {
      if (LOC_SKIP_DIRS.has(name)) continue;
      const fullPath = join(dir, name);
      let st;
      try {
        st = statSync(fullPath);
      } catch {
        continue;
      }
      if (st.isDirectory()) {
        const isRoute = ROUTE_DIR_PATTERNS.some((p) => p.test(name));
        walk(fullPath, inRouteLayer || isRoute);
        continue;
      }
      if (!inRouteLayer) continue;
      if (!countableExts.has(extname(name))) continue;
      let content: string;
      try {
        content = readFileSync(fullPath, "utf8");
      } catch {
        continue;
      }
      content.split("\n").forEach((line, i) => {
        if (patterns.some((p) => p.test(line))) {
          violations.push(`${fullPath}:${i + 1} — ${line.trim()}`);
        }
      });
    }
  }

  walk(projectDir, false);
  return violations;
}
