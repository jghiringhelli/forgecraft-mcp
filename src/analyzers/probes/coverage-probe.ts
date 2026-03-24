/**
 * Coverage probe — format-first, not tool-first.
 * Tries LCOV (universal) → istanbul JSON → Cobertura XML.
 */

import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { detectLanguage } from "../language-detector.js";
import type { SupportedLanguage } from "../language-detector.js";
import type { ProbeResult } from "./tool-runner.js";

export interface CoverageData {
  readonly lines: number;
  readonly statements: number;
  readonly functions: number;
  readonly branches: number;
  readonly reportFormat: "lcov" | "istanbul" | "cobertura";
  readonly reportPath: string;
}

/** Parse an LCOV info file and return overall line/branch/function percentages. */
function parseLcov(
  lcovPath: string,
): Pick<CoverageData, "lines" | "branches" | "functions"> | null {
  try {
    const content = readFileSync(lcovPath, "utf8");
    let lh = 0,
      lf = 0,
      brh = 0,
      brf = 0,
      fnh = 0,
      fnf = 0;
    for (const line of content.split("\n")) {
      const colonIdx = line.indexOf(":");
      if (colonIdx === -1) continue;
      const key = line.slice(0, colonIdx).trim();
      const n = parseInt(line.slice(colonIdx + 1).trim(), 10);
      if (isNaN(n)) continue;
      if (key === "LH") lh += n;
      else if (key === "LF") lf += n;
      else if (key === "BRH") brh += n;
      else if (key === "BRF") brf += n;
      else if (key === "FNH") fnh += n;
      else if (key === "FNF") fnf += n;
    }
    if (lf === 0) return null;
    return {
      lines: Math.round((lh / lf) * 1000) / 10,
      branches: brf > 0 ? Math.round((brh / brf) * 1000) / 10 : 100,
      functions: fnf > 0 ? Math.round((fnh / fnf) * 1000) / 10 : 100,
    };
  } catch {
    return null;
  }
}

/** Parse an istanbul/c8 coverage-summary.json. */
function parseIstanbul(
  summaryPath: string,
): Pick<
  CoverageData,
  "lines" | "statements" | "functions" | "branches"
> | null {
  try {
    const raw = JSON.parse(readFileSync(summaryPath, "utf8")) as Record<
      string,
      unknown
    >;
    const total = raw["total"] as Record<string, { pct: number }> | undefined;
    if (!total) return null;
    return {
      lines: total["lines"]?.pct ?? 0,
      statements: total["statements"]?.pct ?? 0,
      functions: total["functions"]?.pct ?? 0,
      branches: total["branches"]?.pct ?? 0,
    };
  } catch {
    return null;
  }
}

/** Parse a Cobertura/Clover XML (Python, Java, PHP, C#). */
function parseCobertura(
  xmlPath: string,
): Pick<CoverageData, "lines" | "branches"> | null {
  try {
    const content = readFileSync(xmlPath, "utf8");
    const lrMatch = content.match(/line-rate="([0-9.]+)"/);
    const brMatch = content.match(/branch-rate="([0-9.]+)"/);
    if (!lrMatch) return null;
    return {
      lines: Math.round(parseFloat(lrMatch[1]!) * 1000) / 10,
      branches: brMatch ? Math.round(parseFloat(brMatch[1]!) * 1000) / 10 : 100,
    };
  } catch {
    return null;
  }
}

/**
 * Read an existing coverage report — no test re-run.
 * Tries LCOV (universal) → istanbul JSON → Cobertura XML, in that order.
 */
export function probeCoverage(
  projectDir: string,
  coverageDir?: string,
): ProbeResult<CoverageData> {
  const base = coverageDir
    ? resolve(coverageDir)
    : join(projectDir, "coverage");

  const lcovPath = join(base, "lcov.info");
  if (existsSync(lcovPath)) {
    const parsed = parseLcov(lcovPath);
    if (parsed) {
      return {
        available: true,
        data: {
          statements: parsed.lines,
          ...parsed,
          reportFormat: "lcov",
          reportPath: lcovPath,
        },
      };
    }
  }

  const istanbulPath = join(base, "coverage-summary.json");
  if (existsSync(istanbulPath)) {
    const parsed = parseIstanbul(istanbulPath);
    if (parsed) {
      return {
        available: true,
        data: { ...parsed, reportFormat: "istanbul", reportPath: istanbulPath },
      };
    }
  }

  for (const xmlName of ["cobertura.xml", "coverage.xml", "../coverage.xml"]) {
    const xmlPath = resolve(base, xmlName);
    if (existsSync(xmlPath)) {
      const parsed = parseCobertura(xmlPath);
      if (parsed) {
        return {
          available: true,
          data: {
            ...parsed,
            statements: parsed.lines,
            functions: 100,
            reportFormat: "cobertura",
            reportPath: xmlPath,
          },
        };
      }
    }
  }

  return {
    available: false,
    installHint: buildCoverageHint(detectLanguage(projectDir)),
  };
}

function buildCoverageHint(language: SupportedLanguage): string {
  const hints: Partial<Record<SupportedLanguage, string>> = {
    typescript:
      "`npx c8 npm test` — writes coverage/lcov.info + coverage/coverage-summary.json",
    python: "`pytest --cov=. --cov-report=lcov:coverage/lcov.info`",
    go: "`go test ./... -coverprofile=coverage/lcov.info`",
    rust: "`cargo llvm-cov --lcov --output-path coverage/lcov.info`  (cargo install cargo-llvm-cov)",
    java: "Add JaCoCo plugin: `mvn test` with `<format>lcov</format>` in jacoco-maven-plugin",
    ruby: "Add simplecov-lcov gem; configure SimpleCov::Formatter::LcovFormatter in spec_helper",
    csharp:
      '`dotnet test --collect:"XPlat Code Coverage"`  — generates coverage.cobertura.xml',
    unknown: "Run your test suite with coverage output to coverage/lcov.info",
  };
  return `No coverage report found. To generate: ${hints[language] ?? hints["unknown"]}`;
}
