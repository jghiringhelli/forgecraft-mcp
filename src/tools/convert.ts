/**
 * convert_existing tool handler.
 *
 * Analyzes an existing codebase and generates a phased migration plan
 * to adopt ForgeCraft's CC patterns.
 */

import { z } from "zod";
import { ALL_TAGS } from "../shared/types.js";
import type { Tag } from "../shared/types.js";
import { checkCompleteness } from "../analyzers/completeness.js";
import { scanAntiPatterns } from "../analyzers/anti-pattern.js";
import { scanFolderStructure, renderFolderTree } from "../analyzers/folder-structure.js";
import { analyzeProject } from "../analyzers/package-json.js";

// ── Schema ───────────────────────────────────────────────────────────

export const convertExistingSchema = z.object({
  tags: z
    .array(z.enum(ALL_TAGS as unknown as [string, ...string[]]))
    .min(1)
    .describe("Target tags for the converted project."),
  project_dir: z
    .string()
    .describe("Absolute path to the existing project root."),
  scan_depth: z
    .enum(["quick", "full"])
    .default("quick")
    .describe("Scan depth: 'quick' checks top-level, 'full' scans all source files."),
});

// ── Handler ──────────────────────────────────────────────────────────

export async function convertExistingHandler(
  args: z.infer<typeof convertExistingSchema>,
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  const tags: Tag[] = args.tags.includes("UNIVERSAL")
    ? (args.tags as Tag[])
    : (["UNIVERSAL", ...args.tags] as Tag[]);

  // Phase 1: Analyze current state
  const structure = scanFolderStructure(args.project_dir, args.scan_depth === "full" ? 6 : 3);
  const treeText = renderFolderTree(structure);
  const detections = analyzeProject(args.project_dir);
  const completeness = checkCompleteness(args.project_dir, tags);
  const antiPatterns = args.scan_depth === "full"
    ? scanAntiPatterns(args.project_dir)
    : { violations: [], warnings: [] };

  // Phase 2: Build migration plan
  const phases = buildMigrationPlan(completeness, antiPatterns, tags);

  // Format output
  let text = `# Conversion Plan\n\n`;
  text += `**Target Tags:** ${tags.map((t) => `[${t}]`).join(" ")}\n`;
  text += `**Scan Depth:** ${args.scan_depth}\n\n`;

  // Auto-detected tags
  if (detections.length > 0) {
    text += `## Auto-Detected Tags\n`;
    text += detections
      .map((d) => `- **[${d.tag}]** (${Math.round(d.confidence * 100)}%): ${d.evidence.join(", ")}`)
      .join("\n");
    text += "\n\n";
  }

  // Current structure
  text += `## Current Structure\n\`\`\`\n${treeText}\n\`\`\`\n\n`;

  // Current state
  text += `## Current Compliance\n`;
  text += `- Passing: ${completeness.passing.length}\n`;
  text += `- Failing: ${completeness.failing.length}\n`;
  if (antiPatterns.violations.length > 0) {
    text += `- Anti-pattern violations: ${antiPatterns.violations.length}\n`;
  }
  text += "\n";

  // Migration phases
  for (const phase of phases) {
    text += `## ${phase.title}\n`;
    text += `**Effort:** ${phase.effort} | **Risk:** ${phase.risk}\n\n`;
    text += phase.steps.map((s, i) => `${i + 1}. ${s}`).join("\n");
    text += "\n\n";
  }

  text += `---\n_Run \`forgecraft\` with action='scaffold' and dry_run=true to preview what would be generated._`;

  return { content: [{ type: "text", text }] };
}

// ── Migration Plan Builder ───────────────────────────────────────────

interface MigrationPhase {
  title: string;
  effort: string;
  risk: string;
  steps: string[];
}

function buildMigrationPlan(
  completeness: ReturnType<typeof checkCompleteness>,
  antiPatterns: ReturnType<typeof scanAntiPatterns>,
  _tags: Tag[],
): MigrationPhase[] {
  const phases: MigrationPhase[] = [];
  const missingChecks = new Set(completeness.failing.map((f) => f.check));

  // Phase 1: Foundation (always first)
  const foundationSteps: string[] = [];
  if (missingChecks.has("instruction_file_exists")) {
    foundationSteps.push("Generate instruction files with `forgecraft` action='generate'");
  }
  if (missingChecks.has("status_md_exists")) {
    foundationSteps.push("Create Status.md for session continuity");
  }
  if (missingChecks.has("env_example_exists")) {
    foundationSteps.push("Create .env.example documenting required env vars");
  }

  if (foundationSteps.length > 0) {
    phases.push({
      title: "Phase 1: Foundation",
      effort: "~30 minutes",
      risk: "Low",
      steps: foundationSteps,
    });
  }

  // Phase 2: Quality Gates
  const qualitySteps: string[] = [];
  if (missingChecks.has("hooks_installed")) {
    qualitySteps.push("Install quality gate hooks with `forgecraft` action='scaffold' or action='add_hook'");
  }
  qualitySteps.push("Configure .gitignore for build artifacts and secrets");
  qualitySteps.push("Set up CI pipeline if not present");

  phases.push({
    title: "Phase 2: Quality Gates",
    effort: "~1 hour",
    risk: "Low",
    steps: qualitySteps,
  });

  // Phase 3: Code Quality (if anti-patterns found)
  if (antiPatterns.violations.length > 0 || antiPatterns.warnings.length > 0) {
    const codeSteps: string[] = [];

    const hardcodedUrls = antiPatterns.violations.filter((v) => v.check === "hardcoded_url");
    if (hardcodedUrls.length > 0) {
      codeSteps.push(`Fix ${hardcodedUrls.length} hardcoded URL(s) — move to config/env vars`);
    }

    const mocks = antiPatterns.violations.filter((v) => v.check === "mock_in_source");
    if (mocks.length > 0) {
      codeSteps.push(`Remove ${mocks.length} mock/stub reference(s) from production code`);
    }

    const longFiles = antiPatterns.warnings.filter((w) => w.check === "file_length");
    if (longFiles.length > 0) {
      codeSteps.push(`Refactor ${longFiles.length} oversized file(s) (>300 lines)`);
    }

    if (codeSteps.length > 0) {
      phases.push({
        title: "Phase 3: Code Quality Fixes",
        effort: "~2-4 hours",
        risk: "Medium",
        steps: codeSteps,
      });
    }
  }

  // Phase 4: Documentation
  const docSteps: string[] = [];
  if (missingChecks.has("prd_exists")) {
    docSteps.push("Create docs/PRD.md documenting requirements");
  }
  if (missingChecks.has("tech_spec_exists")) {
    docSteps.push("Create docs/TechSpec.md with `forgecraft` action='get_reference' resource='nfr' for NFR sections");
  }
  if (missingChecks.has("shared_modules")) {
    docSteps.push("Create shared modules (config, errors, logging) in src/shared/");
  }

  if (docSteps.length > 0) {
    phases.push({
      title: "Phase 4: Documentation & Architecture",
      effort: "~2-3 hours",
      risk: "Low",
      steps: docSteps,
    });
  }

  return phases;
}
