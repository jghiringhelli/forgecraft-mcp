#!/usr/bin/env node
/**
 * Export the full ForgeCraft gate taxonomy to JSON for the genspec.dev portal.
 * Usage: npx ts-node scripts/export-taxonomy.ts [output-path]
 * Output: taxonomy.json with all tags, blocks, verification phases, hooks.
 */
import { writeFileSync, readFileSync, existsSync, readdirSync } from "fs";
import { join, resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { load as yamlLoad } from "js-yaml";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const templatesDir = join(__dirname, "..", "templates");
const outputPath =
  process.argv[2] ?? join(__dirname, "..", "dist", "taxonomy.json");

interface GateStep {
  id: string;
  title?: string;
  instruction?: string;
  contract?: string;
  passCriterion?: string;
  tools?: string[];
  owasp_asvs_level?: number;
  requiresHumanReview?: boolean;
  release_phase_gate?: string;
}

interface VerificationPhase {
  id: string;
  title: string;
  rationale?: string;
  release_phase_gate?: string;
  steps: GateStep[];
}

interface TagTaxonomy {
  tag: string;
  instructionBlockCount: number;
  instructionBlocks: { id: string; tier: string; title: string }[];
  verificationPhases: VerificationPhase[];
  hookCount: number;
  hooks: { id: string; trigger: string; title?: string }[];
}

const tagDirs = readdirSync(templatesDir, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name);

const taxonomy: TagTaxonomy[] = [];

for (const tagDir of tagDirs) {
  const tag = tagDir.toUpperCase().replace(/-/g, "-");
  const dirPath = join(templatesDir, tagDir);

  // Load instructions
  const instructionsPath = join(dirPath, "instructions.yaml");
  let blocks: { id: string; tier: string; title: string }[] = [];
  if (existsSync(instructionsPath)) {
    const raw = yamlLoad(readFileSync(instructionsPath, "utf-8")) as Record<
      string,
      unknown
    >;
    blocks = ((raw?.blocks ?? []) as Record<string, unknown>[]).map((b) => ({
      id: String(b["id"] ?? ""),
      tier: String(b["tier"] ?? "core"),
      title: String(b["title"] ?? b["id"] ?? ""),
    }));
  }

  // Load verification
  const verificationPath = join(dirPath, "verification.yaml");
  let phases: VerificationPhase[] = [];
  if (existsSync(verificationPath)) {
    const raw = yamlLoad(readFileSync(verificationPath, "utf-8")) as Record<
      string,
      unknown
    >;
    phases = ((raw?.phases ?? []) as Record<string, unknown>[]).map((p) => ({
      id: String(p["id"] ?? ""),
      title: String(p["title"] ?? ""),
      rationale: p["rationale"] != null ? String(p["rationale"]) : undefined,
      release_phase_gate:
        p["release_phase_gate"] != null
          ? String(p["release_phase_gate"])
          : undefined,
      steps: ((p["steps"] ?? []) as Record<string, unknown>[]).map((s) => ({
        id: String(s["id"] ?? ""),
        instruction:
          s["instruction"] != null ? String(s["instruction"]) : undefined,
        contract: s["contract"] != null ? String(s["contract"]) : undefined,
        passCriterion:
          s["pass_criterion"] != null ? String(s["pass_criterion"]) : undefined,
        tools: s["tools"] as string[] | undefined,
        owasp_asvs_level:
          s["owasp_asvs_level"] != null
            ? Number(s["owasp_asvs_level"])
            : undefined,
        requiresHumanReview:
          s["requires_human_review"] != null
            ? Boolean(s["requires_human_review"])
            : undefined,
      })),
    }));
  }

  // Load hooks
  const hooksPath = join(dirPath, "hooks.yaml");
  let hooks: { id: string; trigger: string; title?: string }[] = [];
  if (existsSync(hooksPath)) {
    const raw = yamlLoad(readFileSync(hooksPath, "utf-8")) as Record<
      string,
      unknown
    >;
    hooks = ((raw?.hooks ?? []) as Record<string, unknown>[]).map((h) => ({
      id: String(h["id"] ?? h["filename"] ?? ""),
      trigger: String(h["trigger"] ?? "pre-commit"),
      title: h["title"] != null ? String(h["title"]) : undefined,
    }));
  }

  taxonomy.push({
    tag: tag.toUpperCase(),
    instructionBlockCount: blocks.length,
    instructionBlocks: blocks,
    verificationPhases: phases,
    hookCount: hooks.length,
    hooks,
  });
}

const output = {
  generatedAt: new Date().toISOString(),
  version: "1.0.0",
  tagCount: taxonomy.length,
  tags: taxonomy,
};

writeFileSync(outputPath, JSON.stringify(output, null, 2), "utf-8");
console.log(`✅ Taxonomy exported: ${taxonomy.length} tags → ${outputPath}`);
