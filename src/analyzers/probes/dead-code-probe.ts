/**
 * Dead code probe — detects unused files, exports, and dependencies.
 */

import { detectLanguage } from "../language-detector.js";
import type { SupportedLanguage } from "../language-detector.js";
import { runTool } from "./tool-runner.js";
import type { ProbeResult, ToolSpec } from "./tool-runner.js";

export interface DeadCodeData {
  readonly unusedFiles: number;
  readonly unusedExports: number;
  readonly unusedDependencies: number;
  readonly details: string[];
}

const DEAD_CODE_TOOLS: Partial<
  Record<SupportedLanguage, ToolSpec & { installHint: string }>
> = {
  typescript: {
    nodeBin: "knip",
    args: ["--reporter", "json"],
    installHint: "`npm i -D knip`",
  },
  python: {
    pythonModule: "vulture",
    args: ["."],
    installHint: "`pip install vulture`",
  },
  go: {
    pathBin: "deadcode",
    args: ["./..."],
    installHint: "`go install golang.org/x/tools/cmd/deadcode@latest`",
  },
};

/**
 * Detect unused files, exports, and dependencies.
 * Language-keyed tool selection; output normalised to DeadCodeData.
 */
export function probeDeadCode(projectDir: string): ProbeResult<DeadCodeData> {
  const language = detectLanguage(projectDir);
  const toolConfig = DEAD_CODE_TOOLS[language];

  if (!toolConfig) {
    return {
      available: false,
      installHint: `No dead-code tool configured for ${language}.`,
    };
  }
  const run = runTool(projectDir, toolConfig);
  if (!run.found) {
    return {
      available: false,
      installHint: `Install dead-code tool: ${toolConfig.installHint}`,
    };
  }

  try {
    if (language === "typescript") return parseKnipOutput(run.stdout);
    if (language === "python") return parseVultureOutput(run.stdout);
    if (language === "go") return parseDeadcodeOutput(run.stdout + run.stderr);
    return {
      available: false,
      installHint: `No output parser for ${language} dead-code tool`,
    };
  } catch (err) {
    return { available: false, error: `Dead code parse error: ${String(err)}` };
  }
}

function parseKnipOutput(stdout: string): ProbeResult<DeadCodeData> {
  const output = JSON.parse(stdout) as {
    files?: string[];
    exports?: Record<string, string[]>;
    dependencies?: string[];
  };
  const details: string[] = [
    ...(output.files ?? []).map((f) => `unused file: ${f}`),
    ...Object.entries(output.exports ?? {}).flatMap(([file, names]) =>
      names.map((n) => `unused export: ${n} in ${file}`),
    ),
    ...(output.dependencies ?? []).map((d) => `unused dep: ${d}`),
  ];
  return {
    available: true,
    data: {
      unusedFiles: (output.files ?? []).length,
      unusedExports: Object.values(output.exports ?? {}).flat().length,
      unusedDependencies: (output.dependencies ?? []).length,
      details,
    },
  };
}

function parseVultureOutput(stdout: string): ProbeResult<DeadCodeData> {
  const lines = stdout.split("\n").filter(Boolean);
  return {
    available: true,
    data: {
      unusedFiles: 0,
      unusedExports: lines.length,
      unusedDependencies: 0,
      details: lines.map((l) => `unused: ${l}`),
    },
  };
}

function parseDeadcodeOutput(output: string): ProbeResult<DeadCodeData> {
  const lines = output.split("\n").filter((l) => l.includes("is unreachable"));
  return {
    available: true,
    data: {
      unusedFiles: 0,
      unusedExports: lines.length,
      unusedDependencies: 0,
      details: lines,
    },
  };
}
