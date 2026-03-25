/**
 * Mutation testing probe (opt-in, slow).
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { detectLanguage } from "../language-detector.js";
import type { SupportedLanguage } from "../language-detector.js";
import { runTool } from "./tool-runner.js";
import type { ProbeResult, ToolSpec } from "./tool-runner.js";

export interface MutationData {
  readonly score: number;
  readonly killed: number;
  readonly survived: number;
  readonly timeout: number;
  readonly total: number;
}

interface MutationToolSpec extends ToolSpec {
  readonly installHint: string;
  readonly reportPath?: string;
}

const MUTATION_TOOLS: Partial<Record<SupportedLanguage, MutationToolSpec>> = {
  typescript: {
    nodeBin: "stryker",
    args: ["run", "--reporters", "json"],
    reportPath: "reports/mutation/mutation.json",
    installHint:
      "`npm i -D @stryker-mutator/core @stryker-mutator/typescript-checker`",
  },
  python: {
    pythonModule: "mutmut",
    args: ["run", "--CI"],
    installHint: "`pip install mutmut`",
  },
  go: {
    pathBin: "go-mutesting",
    args: ["./..."],
    installHint:
      "`go install github.com/zimmski/go-mutesting/cmd/go-mutesting@latest`",
    timeoutMs: 600_000,
  },
  rust: {
    pathBin: "cargo",
    args: ["mutants"],
    installHint: "`cargo install cargo-mutants`",
    timeoutMs: 600_000,
  },
};

/**
 * Run mutation testing (opt-in, slow).
 * Language-keyed tool selection; output normalised to MutationData.
 */
export function probeMutation(projectDir: string): ProbeResult<MutationData> {
  const language = detectLanguage(projectDir);
  const toolConfig = MUTATION_TOOLS[language];

  if (!toolConfig) {
    return {
      available: false,
      installHint: `No mutation tool configured for ${language}.`,
    };
  }
  const run = runTool(projectDir, toolConfig);
  if (!run.found) {
    return {
      available: false,
      installHint: `Install mutation tool: ${toolConfig.installHint}`,
    };
  }

  try {
    if (language === "typescript")
      return parseStrykerOutput(projectDir, toolConfig.reportPath!);
    if (language === "python")
      return parseMutmutOutput(run.stdout + run.stderr);
    if (language === "go" || language === "rust")
      return parseCountingOutput(run.stdout + run.stderr);
    return {
      available: false,
      installHint: `No output parser for ${language} mutation tool`,
    };
  } catch (err) {
    return { available: false, error: `Mutation parse error: ${String(err)}` };
  }
}

function parseStrykerOutput(
  projectDir: string,
  relativeReportPath: string,
): ProbeResult<MutationData> {
  const reportPath = join(projectDir, relativeReportPath);
  if (!existsSync(reportPath))
    return { available: false, error: "mutation.json report not found" };
  const report = JSON.parse(readFileSync(reportPath, "utf8")) as {
    metrics?: {
      mutationScore: number;
      killed: number;
      survived: number;
      timeout: number;
      totalMutants: number;
    };
  };
  const m = report.metrics;
  if (!m) return { available: false, error: "Unexpected mutation.json shape" };
  return {
    available: true,
    data: {
      score: Math.round(m.mutationScore * 10) / 10,
      killed: m.killed,
      survived: m.survived,
      timeout: m.timeout,
      total: m.totalMutants,
    },
  };
}

function parseMutmutOutput(output: string): ProbeResult<MutationData> {
  const killed = parseInt(output.match(/(\d+) killed/)?.[1] ?? "0", 10);
  const survived = parseInt(output.match(/(\d+) survived/)?.[1] ?? "0", 10);
  const total = killed + survived;
  return {
    available: true,
    data: {
      score: total > 0 ? Math.round((killed / total) * 1000) / 10 : 0,
      killed,
      survived,
      timeout: 0,
      total,
    },
  };
}

function parseCountingOutput(output: string): ProbeResult<MutationData> {
  const killed = parseInt(output.match(/[Kk]illed[:\s]+(\d+)/)?.[1] ?? "0", 10);
  const survived = parseInt(
    output.match(/[Ss]urvived[:\s]+(\d+)/)?.[1] ?? "0",
    10,
  );
  const total = killed + survived;
  return {
    available: true,
    data: {
      score: total > 0 ? Math.round((killed / total) * 1000) / 10 : 0,
      killed,
      survived,
      timeout: 0,
      total,
    },
  };
}
