/**
 * Complexity probe — finds functions exceeding the cyclomatic complexity threshold.
 */

import { detectLanguage } from "../language-detector.js";
import type { SupportedLanguage } from "../language-detector.js";
import { runTool } from "./tool-runner.js";
import type { ProbeResult, ToolSpec } from "./tool-runner.js";

export interface ComplexityData {
  readonly highComplexityFunctions: number;
  readonly threshold: number;
  readonly details: string[];
}

const COMPLEXITY_THRESHOLD = 10;

const COMPLEXITY_TOOLS: Partial<
  Record<SupportedLanguage, ToolSpec & { installHint: string }>
> = {
  typescript: {
    nodeBin: "eslint",
    args: [
      "--format",
      "json",
      "--rule",
      `{"complexity": ["warn", ${COMPLEXITY_THRESHOLD}]}`,
      "src",
    ],
    installHint: "`npm i -D eslint`",
  },
  python: {
    pythonModule: "radon",
    args: ["cc", ".", "--min", "C", "--json"],
    installHint: "`pip install radon`",
  },
  go: {
    pathBin: "gocognit",
    args: ["-over", String(COMPLEXITY_THRESHOLD), "./..."],
    installHint: "`go install github.com/uudashr/gocognit/cmd/gocognit@latest`",
  },
};

/**
 * Find functions exceeding the cyclomatic complexity threshold.
 * Language-keyed tool selection; output normalised to ComplexityData.
 */
export function probeComplexity(
  projectDir: string,
): ProbeResult<ComplexityData> {
  const language = detectLanguage(projectDir);
  const toolConfig = COMPLEXITY_TOOLS[language];

  if (!toolConfig) {
    return {
      available: false,
      installHint: `No complexity tool configured for ${language}.`,
    };
  }
  const run = runTool(projectDir, toolConfig);
  if (!run.found) {
    return {
      available: false,
      installHint: `Install complexity tool: ${toolConfig.installHint}`,
    };
  }

  try {
    if (language === "typescript") return parseEslintComplexity(run.stdout);
    if (language === "python") return parseRadonOutput(run.stdout);
    if (language === "go") return parseGocognitOutput(run.stdout);
    return {
      available: false,
      installHint: `No output parser for ${language} complexity tool`,
    };
  } catch (err) {
    return {
      available: false,
      error: `Complexity parse error: ${String(err)}`,
    };
  }
}

function parseEslintComplexity(stdout: string): ProbeResult<ComplexityData> {
  const files = JSON.parse(stdout) as Array<{
    filePath: string;
    messages: Array<{ ruleId: string; message: string; line: number }>;
  }>;
  const msgs = files.flatMap((f) =>
    f.messages
      .filter((m) => m.ruleId === "complexity")
      .map((m) => `${f.filePath}:${m.line} — ${m.message}`),
  );
  return {
    available: true,
    data: {
      highComplexityFunctions: msgs.length,
      threshold: COMPLEXITY_THRESHOLD,
      details: msgs,
    },
  };
}

function parseRadonOutput(stdout: string): ProbeResult<ComplexityData> {
  const files = JSON.parse(stdout) as Record<
    string,
    Array<{ name: string; complexity: number; lineno: number }>
  >;
  const msgs: string[] = [];
  for (const [file, fns] of Object.entries(files)) {
    for (const fn of fns) {
      if (fn.complexity >= COMPLEXITY_THRESHOLD) {
        msgs.push(
          `${file}:${fn.lineno} — ${fn.name} (complexity ${fn.complexity})`,
        );
      }
    }
  }
  return {
    available: true,
    data: {
      highComplexityFunctions: msgs.length,
      threshold: COMPLEXITY_THRESHOLD,
      details: msgs,
    },
  };
}

function parseGocognitOutput(stdout: string): ProbeResult<ComplexityData> {
  const lines = stdout.split("\n").filter(Boolean);
  return {
    available: true,
    data: {
      highComplexityFunctions: lines.length,
      threshold: COMPLEXITY_THRESHOLD,
      details: lines,
    },
  };
}
