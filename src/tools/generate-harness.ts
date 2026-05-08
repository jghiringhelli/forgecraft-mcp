/**
 * generate_harness tool handler.
 *
 * Reads UC specs from docs/use-cases.md and probe blueprints from
 * .forgecraft/harness/uc-NNN.yaml, then scaffolds executable probe files
 * in tests/harness/. Idempotent: skips existing files unless force=true.
 */

import { z } from "zod";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import yaml from "js-yaml";
import { parseUseCases } from "./layer-status.js";
import { generateProbeContent } from "./probe-templates.js";
import type { ToolResult } from "../shared/types.js";

// ── Schema ───────────────────────────────────────────────────────────

export const generateHarnessSchema = z.object({
  project_dir: z.string().describe("Absolute path to the project root."),
  uc_ids: z
    .array(z.string())
    .optional()
    .describe(
      "Specific UC ids to generate probes for (e.g. ['UC-001', 'UC-003']). " +
        "If omitted, generates for all UCs with harness specs.",
    ),
  force: z
    .boolean()
    .optional()
    .describe(
      "Overwrite existing probe files. Default: false — skip UCs that already have probe files.",
    ),
});

export type GenerateHarnessInput = z.infer<typeof generateHarnessSchema>;

// ── Types ─────────────────────────────────────────────────────────────

export interface ProbeSpec {
  uc: string;
  title: string;
  action?: string;
  probes?: Array<{
    id: string;
    type: string;
    scenario?: string;
    description?: string;
  }>;
}

export type ProbeType =
  | "playwright"
  | "api_call"
  | "hurl"
  | "graphql"
  | "file_system"
  | "mcp_call"
  | "headless_sim"
  | "db_query"
  | "message_queue"
  | "performance"
  | "websocket"
  | "log_assertion"
  | "a11y"
  | "contract_consumer"
  | "contract_provider"
  | "grpc"
  | "security_scan";

export interface GenerateResult {
  ucId: string;
  title: string;
  status: "generated" | "skipped" | "no_spec";
  probeFile?: string;
  probeType?: string;
  reason?: string;
}

export interface ErrorCase {
  name: string;
  slug: string;
  description: string;
}

// ── Tag → probe type mapping ──────────────────────────────────────────

const TAG_PROBE_MAP: Record<string, ProbeType> = {
  "WEB-REACT": "playwright",
  "WEB-STATIC": "playwright",
  API: "api_call",
  GAME: "headless_sim",
  CLI: "file_system",
  DATABASE: "db_query",
  "DATA-PIPELINE": "db_query",
  REALTIME: "websocket",
  SOCIAL: "websocket",
  FINTECH: "performance",
  HEALTHCARE: "a11y",
  HIPAA: "a11y",
};

function defaultProbeTypeForTags(tags: string[]): ProbeType {
  for (const tag of tags) {
    const mapped = TAG_PROBE_MAP[tag];
    if (mapped) return mapped;
  }
  return "file_system";
}

// ── Probe file extension mapping ──────────────────────────────────────

export function extensionForType(probeType: ProbeType): string {
  switch (probeType) {
    case "playwright":
      return ".spec.ts";
    case "api_call":
    case "hurl":
      return ".hurl";
    case "graphql":
      return ".graphql.hurl";
    case "headless_sim":
      return ".sim.ts";
    case "db_query":
      return ".db.sh";
    case "message_queue":
      return ".mq.sh";
    case "performance":
      return ".k6.js";
    case "websocket":
      return ".ws.sh";
    case "log_assertion":
      return ".log.sh";
    case "a11y":
      return ".a11y.spec.ts";
    case "contract_consumer":
      return ".consumer.test.ts";
    case "contract_provider":
      return ".provider.test.ts";
    case "grpc":
      return ".grpc.sh";
    case "security_scan":
      return ".zap.sh";
    case "mcp_call":
    case "file_system":
    default:
      return ".sh";
  }
}

// ── Error case parsing ────────────────────────────────────────────────

export function parseErrorCases(ucSection: string): ErrorCase[] {
  const errorCasesMatch =
    /\*\*Error Cases\*\*:([\s\S]*?)(?=\n\*\*|\n##|$)/i.exec(ucSection);
  if (!errorCasesMatch) return [];

  const errorBlock = errorCasesMatch[1]!;
  const cases: ErrorCase[] = [];
  const linePattern = /^\s+-\s+(.+?):\s*(.+)$/gm;
  let m: RegExpExecArray | null;

  while ((m = linePattern.exec(errorBlock)) !== null) {
    const name = m[1]!.trim();
    const description = m[2]!.trim();
    const slug = name
      .toLowerCase()
      .replace(/`/g, "")
      .replace(/_/g, "-")
      .replace(/[^a-z0-9\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-");
    cases.push({ name, slug, description });
  }

  return cases;
}

// ── UC detail reader ──────────────────────────────────────────────────

interface UcDetails {
  precondition: string;
  postcondition: string;
  steps: string[];
  errorCases: ErrorCase[];
}

function readUcDetails(projectDir: string, ucId: string): UcDetails {
  const useCasesPath = join(projectDir, "docs", "use-cases.md");
  const fallback: UcDetails = {
    precondition: "(see use case)",
    postcondition: "(see use case)",
    steps: [],
    errorCases: [],
  };
  if (!existsSync(useCasesPath)) return fallback;
  try {
    const content = readFileSync(useCasesPath, "utf-8");
    const ucPattern = new RegExp(
      `##\\s+${ucId}:[\\s\\S]*?(?=\\n##\\s+UC-|$)`,
      "i",
    );
    const match = ucPattern.exec(content);
    if (!match) return fallback;
    const section = match[0];
    const preMatch = /\*\*Precondition\*\*:\s*(.+)/i.exec(section);
    const postMatch = /\*\*Postcondition\*\*:\s*(.+)/i.exec(section);
    const steps: string[] = [];
    const stepPattern = /^\s+\d+\.\s+(.+)$/gm;
    let m: RegExpExecArray | null;
    while ((m = stepPattern.exec(section)) !== null) {
      steps.push(m[1]!.trim());
    }
    return {
      precondition: preMatch ? preMatch[1]!.trim() : "(see use case)",
      postcondition: postMatch ? postMatch[1]!.trim() : "(see use case)",
      steps,
      errorCases: parseErrorCases(section),
    };
  } catch {
    return fallback;
  }
}

// ── Probe spec reader ─────────────────────────────────────────────────

function readProbeSpec(projectDir: string, ucId: string): ProbeSpec | null {
  const specPath = join(
    projectDir,
    ".forgecraft",
    "harness",
    `${ucId.toLowerCase()}.yaml`,
  );
  if (!existsSync(specPath)) return null;
  try {
    const raw = readFileSync(specPath, "utf-8");
    return yaml.load(raw) as ProbeSpec;
  } catch {
    return null;
  }
}

const PROBE_TYPE_PRIORITY: ProbeType[] = [
  "playwright",
  "a11y",
  "api_call",
  "hurl",
  "graphql",
  "headless_sim",
  "db_query",
  "message_queue",
  "performance",
  "websocket",
  "log_assertion",
  "contract_consumer",
  "contract_provider",
  "grpc",
  "security_scan",
  "mcp_call",
  "file_system",
];

function detectProbeType(spec: ProbeSpec, tags: string[]): ProbeType {
  const types = (spec.probes ?? []).map((p) => p.type as ProbeType);
  if (types.length > 0) {
    for (const pt of PROBE_TYPE_PRIORITY) {
      if (types.includes(pt)) return pt;
    }
    return types[0]!;
  }
  return defaultProbeTypeForTags(tags);
}

// ── Tags reader ───────────────────────────────────────────────────────

function readProjectTags(projectDir: string): string[] {
  const yamlPath = join(projectDir, "forgecraft.yaml");
  if (!existsSync(yamlPath)) return [];
  try {
    const raw = readFileSync(yamlPath, "utf-8");
    const parsed = yaml.load(raw) as { tags?: string[] };
    return parsed?.tags ?? [];
  } catch {
    return [];
  }
}

// ── Probe file writer ─────────────────────────────────────────────────

function writeProbeFile(
  harnessDir: string,
  fileName: string,
  content: string,
  force: boolean,
  ucId: string,
  title: string,
  probeType: ProbeType,
  results: GenerateResult[],
): void {
  const filePath = join(harnessDir, fileName);
  if (existsSync(filePath) && !force) {
    results.push({
      ucId,
      title,
      status: "skipped",
      probeFile: `tests/harness/${fileName}`,
      probeType,
      reason: "already exists",
    });
    return;
  }
  try {
    writeFileSync(filePath, content, "utf-8");
    results.push({
      ucId,
      title,
      status: "generated",
      probeFile: `tests/harness/${fileName}`,
      probeType,
    });
  } catch (err) {
    results.push({
      ucId,
      title,
      status: "no_spec",
      reason: `write failed: ${String(err)}`,
    });
  }
}

// ── Handler ───────────────────────────────────────────────────────────

export async function generateHarnessHandler(
  args: GenerateHarnessInput,
): Promise<ToolResult> {
  const projectDir = resolve(args.project_dir);
  const force = args.force ?? false;

  const useCasesPath = join(projectDir, "docs", "use-cases.md");
  let ucs: Array<{ id: string; title: string }> = [];
  if (existsSync(useCasesPath)) {
    try {
      ucs = parseUseCases(readFileSync(useCasesPath, "utf-8"));
    } catch {
      /* leave empty */
    }
  }

  const targetUcIds = args.uc_ids
    ? new Set(args.uc_ids.map((id) => id.toUpperCase()))
    : null;
  const filteredUcs = targetUcIds
    ? ucs.filter((uc) => targetUcIds.has(uc.id.toUpperCase()))
    : ucs;

  const tags = readProjectTags(projectDir);

  const harnessDir = join(projectDir, "tests", "harness");
  try {
    mkdirSync(harnessDir, { recursive: true });
  } catch {
    /* ignore */
  }

  const results: GenerateResult[] = [];

  for (const uc of filteredUcs) {
    const spec = readProbeSpec(projectDir, uc.id);
    if (!spec) {
      results.push({ ucId: uc.id, title: uc.title, status: "no_spec" });
      continue;
    }

    const probeType = detectProbeType(spec, tags);
    const ext = extensionForType(probeType);
    const legacyFileName = `${uc.id.toLowerCase()}${ext}`;
    const happyFileName = `${uc.id.toLowerCase()}-happy${ext}`;
    const targetHappyFile = existsSync(join(harnessDir, legacyFileName))
      ? legacyFileName
      : happyFileName;

    const details = readUcDetails(projectDir, uc.id);
    const happyContent = generateProbeContent(
      uc.id,
      uc.title,
      probeType,
      details,
      "happy",
    );
    writeProbeFile(
      harnessDir,
      targetHappyFile,
      happyContent,
      force,
      uc.id,
      uc.title,
      probeType,
      results,
    );

    // Generate error probes from UC error cases
    for (const errorCase of details.errorCases) {
      const errorFileName = `${uc.id.toLowerCase()}-error-${errorCase.slug}${ext}`;
      const errorDetails = { ...details, postcondition: errorCase.description };
      const errorContent = generateProbeContent(
        uc.id,
        uc.title,
        probeType,
        errorDetails,
        "error",
      );
      writeProbeFile(
        harnessDir,
        errorFileName,
        errorContent,
        force,
        uc.id,
        uc.title,
        probeType,
        results,
      );
    }
  }

  const ucsWithoutSpec = ucs.filter(
    (uc) =>
      !existsSync(
        join(
          projectDir,
          ".forgecraft",
          "harness",
          `${uc.id.toLowerCase()}.yaml`,
        ),
      ),
  );

  const generated = results.filter((r) => r.status === "generated");
  const skipped = results.filter((r) => r.status === "skipped");
  const noSpec = results.filter((r) => r.status === "no_spec");

  return {
    content: [
      {
        type: "text",
        text: formatReport(generated, skipped, noSpec, ucsWithoutSpec.length),
      },
    ],
  };
}

function formatReport(
  generated: GenerateResult[],
  skipped: GenerateResult[],
  noSpec: GenerateResult[],
  totalNoSpec: number,
): string {
  const lines: string[] = [
    "## Harness Generation Report",
    "",
    `Generated: ${generated.length} probe files`,
    `Skipped:   ${skipped.length} (already exist, use force=true to overwrite)`,
    `No spec:   ${totalNoSpec} (no .forgecraft/harness/uc-NNN.yaml — run layer_status to see gaps)`,
  ];

  if (generated.length > 0) {
    lines.push("", "### Generated");
    for (const r of generated) {
      lines.push(
        `- ✅ ${r.probeFile}  (${r.probeType}, ${r.ucId}: ${r.title})`,
      );
    }
  }
  if (skipped.length > 0) {
    lines.push("", "### Skipped (exist)");
    for (const r of skipped) {
      lines.push(`- ⏭ ${r.probeFile}  (${r.ucId}: ${r.title})`);
    }
  }
  if (noSpec.length > 0) {
    lines.push("", "### No Harness Spec");
    for (const r of noSpec) {
      lines.push(
        `- ❌ ${r.ucId}: ${r.title} — create .forgecraft/harness/${r.ucId.toLowerCase()}.yaml first`,
      );
    }
  }

  lines.push(
    "",
    "Next: implement the TODO sections in each generated file.",
    "Run: npx forgecraft run_harness --project_dir .",
  );
  return lines.join("\n");
}
