/**
 * check_spec_consistency tool handler.
 *
 * Scans all spec artifacts for structural gaps, semantic ambiguities,
 * and derivation chain breaks across the L1-L4 stack.
 *
 * Unlike gate evaluation (which checks file existence) and probe execution
 * (which checks runtime behavior), this checks whether the SPEC ITSELF is
 * internally consistent and complete enough to be acted upon.
 */

import { z } from "zod";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import type { ToolResult } from "../shared/types.js";
import { parseUseCases } from "./layer-status.js";
import {
  parsePostconditionCount,
  countProbeAssertions,
  splitUcBlocks,
} from "./postcondition-coverage.js";
import { detectClarificationMarkers } from "./session-prompt-builders.js";

// ── Schema ────────────────────────────────────────────────────────────

export const checkSpecConsistencySchema = z.object({
  project_dir: z.string().describe("Absolute path to the project root."),
  strict: z
    .boolean()
    .optional()
    .describe(
      "Fail on warnings as well as errors (advisory items become blocking). Default: false.",
    ),
});

export type CheckSpecConsistencyInput = z.infer<
  typeof checkSpecConsistencySchema
>;

// ── Types ─────────────────────────────────────────────────────────────

type FindingSeverity = "error" | "warning" | "info";

interface ConsistencyFinding {
  readonly severity: FindingSeverity;
  readonly category: string;
  readonly artifact: string;
  readonly message: string;
  readonly fix: string;
}

// ── Handler ──────────────────────────────────────────────────────────

export async function checkSpecConsistencyHandler(
  args: CheckSpecConsistencyInput,
): Promise<ToolResult> {
  const projectDir = resolve(args.project_dir);
  const strict = args.strict ?? false;

  const findings: ConsistencyFinding[] = [
    ...checkUseCases(projectDir),
    ...checkProbes(projectDir),
    ...checkAdrs(projectDir),
    ...checkGates(projectDir),
    ...checkClarificationMarkers(projectDir),
  ];

  const errors = findings.filter((f) => f.severity === "error");
  const warnings = findings.filter((f) => f.severity === "warning");
  const infos = findings.filter((f) => f.severity === "info");

  const blockerCount = strict ? errors.length + warnings.length : errors.length;

  const report = formatReport(
    findings,
    errors,
    warnings,
    infos,
    blockerCount,
    strict,
  );
  return { content: [{ type: "text", text: report }] };
}

// ── Use Case Checks ───────────────────────────────────────────────────

function checkUseCases(projectDir: string): ConsistencyFinding[] {
  const findings: ConsistencyFinding[] = [];
  const path = join(projectDir, "docs", "use-cases.md");

  if (!existsSync(path)) {
    findings.push({
      severity: "error",
      category: "L1 Spec",
      artifact: "docs/use-cases.md",
      message: "Use cases file does not exist",
      fix: "Run setup_project or create docs/use-cases.md with at least one UC-NNN entry",
    });
    return findings;
  }

  const content = readFileSync(path, "utf-8");
  const ucs = parseUseCases(content);
  const blocks = splitUcBlocks(content);

  if (ucs.length === 0) {
    findings.push({
      severity: "error",
      category: "L1 Spec",
      artifact: "docs/use-cases.md",
      message: "No use cases found (no ## UC-NNN: entries)",
      fix: "Add at least one use case with format: ## UC-001: Title",
    });
    return findings;
  }

  // Check for duplicate IDs
  const ids = ucs.map((uc) => uc.id);
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) {
      findings.push({
        severity: "error",
        category: "L1 Spec",
        artifact: "docs/use-cases.md",
        message: `Duplicate use case ID: ${id}`,
        fix: `Renumber one of the ${id} entries`,
      });
    }
    seen.add(id);
  }

  // Check each UC for required sections
  for (const uc of ucs) {
    const block = blocks.get(uc.id.toUpperCase()) ?? "";

    const postconditionCount = parsePostconditionCount(block);
    if (postconditionCount === 0) {
      findings.push({
        severity: "error",
        category: "L1 Spec",
        artifact: `docs/use-cases.md#${uc.id}`,
        message: `${uc.id} has no Postcondition or Acceptance Criteria — probes cannot verify what they should`,
        fix: "Add **Postcondition**: ... and/or **Acceptance Criteria** (machine-checkable) bullets",
      });
    }

    if (!block.includes("**Error Cases**")) {
      findings.push({
        severity: "warning",
        category: "L1 Spec",
        artifact: `docs/use-cases.md#${uc.id}`,
        message: `${uc.id} has no Error Cases section — unhappy path probes cannot be generated`,
        fix: "Add **Error Cases**: section with at least one failure scenario",
      });
    }

    if (block.includes("[NEEDS CLARIFICATION")) {
      const markers = (block.match(/\[NEEDS CLARIFICATION:[^\]]*\]/g) ?? [])
        .length;
      findings.push({
        severity: "error",
        category: "Ambiguity",
        artifact: `docs/use-cases.md#${uc.id}`,
        message: `${uc.id} has ${markers} unresolved [NEEDS CLARIFICATION] marker(s)`,
        fix: "Replace each [NEEDS CLARIFICATION] with the actual decision before proceeding",
      });
    }
  }

  return findings;
}

// ── Probe Checks ──────────────────────────────────────────────────────

function checkProbes(projectDir: string): ConsistencyFinding[] {
  const findings: ConsistencyFinding[] = [];
  const harnessDir = join(projectDir, "tests", "harness");

  if (!existsSync(harnessDir)) {
    findings.push({
      severity: "warning",
      category: "L2 Harness",
      artifact: "tests/harness/",
      message: "Harness probe directory does not exist",
      fix: "Run generate_harness to scaffold probe files from UC specs",
    });
    return findings;
  }

  const useCasesPath = join(projectDir, "docs", "use-cases.md");
  if (!existsSync(useCasesPath)) return findings;

  const ucs = parseUseCases(readFileSync(useCasesPath, "utf-8"));
  const probeFiles = readdirSync(harnessDir).filter(
    (f) =>
      f.endsWith(".sh") ||
      f.endsWith(".spec.ts") ||
      f.endsWith(".hurl") ||
      f.endsWith(".sim.ts"),
  );

  for (const uc of ucs) {
    const lower = uc.id.toLowerCase().replace(/_/g, "-");
    const ucProbes = probeFiles.filter(
      (f) =>
        f.toLowerCase().startsWith(lower + "-") ||
        f.toLowerCase().startsWith(lower + "."),
    );

    if (ucProbes.length === 0) {
      findings.push({
        severity: "warning",
        category: "L2 Harness",
        artifact: `tests/harness/${lower}-happy.*`,
        message: `${uc.id} has no probe files`,
        fix: `Run generate_harness --uc_ids ${uc.id}`,
      });
      continue;
    }

    // Check for happy path probe
    const hasHappy = ucProbes.some((f) => f.toLowerCase().includes("-happy"));
    if (!hasHappy) {
      findings.push({
        severity: "warning",
        category: "L2 Harness",
        artifact: `tests/harness/${lower}-happy.*`,
        message: `${uc.id} missing happy-path probe`,
        fix: `Create tests/harness/${lower}-happy.sh (or .spec.ts / .hurl)`,
      });
    }

    // Check for hollow probes
    for (const f of ucProbes) {
      const { count, isStub } = countProbeAssertions(join(harnessDir, f));
      if (count === 0 && !isStub) {
        findings.push({
          severity: "error",
          category: "L2 Harness",
          artifact: `tests/harness/${f}`,
          message: `Hollow probe — exits 0 but contains zero assertion signals. Produces false confidence.`,
          fix: "Add grep/expect/assert checks that verify actual postconditions, or remove the probe",
        });
      } else if (isStub) {
        findings.push({
          severity: "warning",
          category: "L2 Harness",
          artifact: `tests/harness/${f}`,
          message: `Stub probe — contains TODO markers. Not_implemented probes must be filled before close_cycle.`,
          fix: "Implement the TODO sections with real assertion logic",
        });
      }
    }
  }

  // Check for orphan probes (no matching UC)
  const ucLowers = new Set(
    ucs.map((uc) => uc.id.toLowerCase().replace(/_/g, "-")),
  );
  for (const f of probeFiles) {
    const m = /^(uc-\d{3})[\.-]/.exec(f.toLowerCase());
    if (m && !ucLowers.has(m[1]!)) {
      findings.push({
        severity: "info",
        category: "L2 Harness",
        artifact: `tests/harness/${f}`,
        message: `Orphan probe — no use case with ID ${m[1]!.toUpperCase()} found in docs/use-cases.md`,
        fix: "Add the corresponding use case or delete the orphan probe",
      });
    }
  }

  return findings;
}

// ── ADR Checks ────────────────────────────────────────────────────────

const ADR_STALE_PROPOSED_DAYS = 30;

function checkAdrs(projectDir: string): ConsistencyFinding[] {
  const findings: ConsistencyFinding[] = [];
  const adrsDir = join(projectDir, "docs", "adrs");
  if (!existsSync(adrsDir)) return findings;

  const adrFiles = readdirSync(adrsDir).filter(
    (f) => f.endsWith(".md") && f !== "README.md",
  );
  const now = Date.now();

  for (const f of adrFiles) {
    const filePath = join(adrsDir, f);
    const content = readFileSync(filePath, "utf-8");

    // Check stale Proposed status
    if (/\bProposed\b/.test(content)) {
      const stat = statSync(filePath);
      const ageMs = now - stat.mtimeMs;
      const ageDays = ageMs / (1000 * 60 * 60 * 24);
      if (ageDays > ADR_STALE_PROPOSED_DAYS) {
        findings.push({
          severity: "warning",
          category: "L1 Spec",
          artifact: `docs/adrs/${f}`,
          message: `ADR has been in Proposed status for ${Math.round(ageDays)} days — either Accept or Supersede`,
          fix: "Change Status to Accepted/Rejected or create a superseding ADR",
        });
      }
    }

    // Check for NEEDS CLARIFICATION in ADRs
    const markers = (content.match(/\[NEEDS CLARIFICATION:[^\]]*\]/g) ?? [])
      .length;
    if (markers > 0) {
      findings.push({
        severity: "error",
        category: "Ambiguity",
        artifact: `docs/adrs/${f}`,
        message: `ADR contains ${markers} unresolved [NEEDS CLARIFICATION] marker(s)`,
        fix: "Resolve each marker before accepting the ADR",
      });
    }
  }

  return findings;
}

// ── Gate Checks ───────────────────────────────────────────────────────

function checkGates(projectDir: string): ConsistencyFinding[] {
  const findings: ConsistencyFinding[] = [];
  const gateDirs = [
    join(projectDir, ".forgecraft", "gates", "active"),
    join(projectDir, ".forgecraft", "gates", "project", "active"),
  ];

  for (const dir of gateDirs) {
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir).filter((n) => n.endsWith(".yaml"))) {
      const content = readFileSync(join(dir, f), "utf-8");
      // Check gates referencing file_system paths that don't exist
      const fileRefMatches = content.matchAll(/path:\s*"?([^"\n]+)"?/g);
      for (const m of fileRefMatches) {
        const refPath = m[1]!.trim();
        if (
          refPath.startsWith("/") ||
          refPath.startsWith("./") ||
          refPath.startsWith("docs/")
        ) {
          const fullPath = refPath.startsWith("/")
            ? refPath
            : join(projectDir, refPath);
          if (!existsSync(fullPath)) {
            findings.push({
              severity: "info",
              category: "Gate",
              artifact: f,
              message: `Gate references path that does not exist: ${refPath}`,
              fix: "Create the referenced artifact or update the gate path",
            });
          }
        }
      }
    }
  }

  return findings;
}

// ── Clarification Checks ──────────────────────────────────────────────

function checkClarificationMarkers(projectDir: string): ConsistencyFinding[] {
  const markers = detectClarificationMarkers(projectDir);
  return markers.map((m) => ({
    severity: "error" as FindingSeverity,
    category: "Ambiguity",
    artifact: m.file,
    message: `Unresolved: ${m.marker}`,
    fix: "Replace the marker with the actual decision",
  }));
}

// ── Report Formatter ──────────────────────────────────────────────────

function formatReport(
  findings: ConsistencyFinding[],
  errors: ConsistencyFinding[],
  warnings: ConsistencyFinding[],
  infos: ConsistencyFinding[],
  blockerCount: number,
  strict: boolean,
): string {
  const lines: string[] = [];
  const verdict = blockerCount === 0 ? "✅ CONSISTENT" : "❌ INCONSISTENT";
  lines.push(`## Spec Consistency Report`, ``);
  lines.push(`**Verdict:** ${verdict}`);
  lines.push(
    `**Errors:** ${errors.length}  **Warnings:** ${warnings.length}  **Info:** ${infos.length}`,
  );
  if (strict) lines.push(`**Mode:** strict (warnings count as blockers)`);
  lines.push(``);

  const groups = new Map<string, ConsistencyFinding[]>();
  for (const f of findings) {
    if (!groups.has(f.category)) groups.set(f.category, []);
    groups.get(f.category)!.push(f);
  }

  for (const [category, items] of groups) {
    lines.push(`### ${category}`, ``);
    for (const item of items) {
      const icon =
        item.severity === "error"
          ? "❌"
          : item.severity === "warning"
            ? "⚠️"
            : "ℹ️";
      lines.push(`${icon} **${item.artifact}**`);
      lines.push(`   ${item.message}`);
      lines.push(`   → Fix: ${item.fix}`);
      lines.push(``);
    }
  }

  if (findings.length === 0) {
    lines.push(`All spec artifacts are structurally consistent.`, ``);
  }

  lines.push(`---`);
  if (blockerCount === 0) {
    lines.push(
      `Spec is consistent. Run \`generate_session_prompt\` when ready to implement.`,
    );
  } else {
    lines.push(
      `${blockerCount} blocking issue(s) must be resolved before \`generate_session_prompt\`.`,
      `Fix each issue and re-run \`check_spec_consistency\`.`,
    );
  }

  return lines.join("\n");
}
