/**
 * L1 gate violation detection for layer_status.
 *
 * Reads .forgecraft/gates/active/*.yaml, filters for gates with layers
 * containing L1, evaluates file_system conditions, and returns violations
 * to surface in the layer_status L1 section.
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

// ── Types ─────────────────────────────────────────────────────────────

export interface L1GateViolation {
  /** Gate id */
  readonly gateId: string;
  /** Human-readable message describing the violation */
  readonly message: string;
  /** One-line fix hint from the gate */
  readonly fixHint?: string;
}

// ── YAML minimal parser ───────────────────────────────────────────────

/**
 * Extract a scalar string field from YAML text (top-level key only).
 * Non-throwing — returns undefined on parse failure.
 */
function extractField(yaml: string, field: string): string | undefined {
  const re = new RegExp(`^${field}:\\s*(.+)$`, "m");
  const m = re.exec(yaml);
  return m ? m[1]!.trim() : undefined;
}

/**
 * Check whether the YAML text contains a layers block with the given layer tag.
 */
function hasLayer(yaml: string, layer: string): boolean {
  // Look for "- layer: L1" (or L2, L3, L4) anywhere in the file
  const re = new RegExp(`^\\s+-\\s+layer:\\s+${layer}\\s*$`, "m");
  return re.test(yaml);
}

/**
 * Extract the paths list from a check.paths block in YAML.
 * Returns entries that look like file/directory path strings.
 */
function extractCheckPaths(yaml: string): string[] {
  // Find the `paths:` block under `check:` — capture indented list items
  const match = /^check:[\s\S]*?paths:\s*\n((?:\s+-\s+.+\n?)*)/m.exec(yaml);
  if (!match) return [];
  const block = match[1]!;
  const paths: string[] = [];
  for (const line of block.split("\n")) {
    const m = /^\s+-\s+(.+)$/.exec(line.trim() ? line : "");
    if (m) paths.push(m[1]!.trim());
  }
  return paths;
}

/**
 * Extract the check type from a gate YAML.
 */
function extractCheckType(yaml: string): string | undefined {
  // Look for `type:` under the check block
  const checkBlock = /^check:\s*\n([\s\S]*?)(?=^\w|\z)/m.exec(yaml);
  if (!checkBlock) return undefined;
  const m = /^\s+type:\s+(\S+)/m.exec(checkBlock[1]!);
  return m ? m[1]!.trim() : undefined;
}

/**
 * Extract the check condition from a gate YAML.
 */
function extractCheckCondition(yaml: string): string | undefined {
  const checkBlock = /^check:\s*\n([\s\S]*?)(?=^\w|\z)/m.exec(yaml);
  if (!checkBlock) return undefined;
  const m = /^\s+condition:\s+(\S+)/m.exec(checkBlock[1]!);
  return m ? m[1]!.trim() : undefined;
}

// ── Gate violation evaluator ──────────────────────────────────────────

/**
 * Evaluate a single file_system gate against a project directory.
 * Returns a violation record if the gate is firing, or undefined if it passes.
 */
function evaluateFilesystemGate(
  projectDir: string,
  gateId: string,
  yaml: string,
): L1GateViolation | undefined {
  const condition = extractCheckCondition(yaml);
  const paths = extractCheckPaths(yaml);

  if (paths.length === 0) return undefined;

  let firing = false;

  if (condition === "file_missing") {
    // Gate fires if ALL listed paths are missing (none exist)
    firing = paths.every((p) => !existsSync(join(projectDir, p)));
  } else if (condition === "none_of_these_exist") {
    // Gate fires if none of the listed paths exist
    firing = paths.every((p) => !existsSync(join(projectDir, p)));
  }

  if (!firing) return undefined;

  // Build message from fixHint or failureMessage
  const rawFixHint = extractField(yaml, "fixHint");
  const fixHint = rawFixHint
    ? rawFixHint.replace(/\s+/g, " ").trim()
    : undefined;

  const rawFailure = extractField(yaml, "failureMessage");
  const summary = rawFailure
    ? rawFailure.replace(/\s+/g, " ").trim().slice(0, 120)
    : `${paths.slice(0, 2).join(", ")} missing`;

  return { gateId, message: summary, fixHint };
}

// ── Main export ───────────────────────────────────────────────────────

/**
 * Scan .forgecraft/gates/active/*.yaml for gates with an L1 layer entry.
 * Evaluate file_system conditions; report logic/mcp gates as "requires audit".
 *
 * @param projectDir - Absolute path to project root
 * @returns Array of active L1 gate violations
 */
export function detectL1GateViolations(projectDir: string): L1GateViolation[] {
  const gatesDir = join(projectDir, ".forgecraft", "gates", "active");
  if (!existsSync(gatesDir)) return [];

  let files: string[];
  try {
    files = readdirSync(gatesDir).filter((f) => f.endsWith(".yaml"));
  } catch {
    return [];
  }

  const violations: L1GateViolation[] = [];

  for (const file of files) {
    const filePath = join(gatesDir, file);
    let yaml: string;
    try {
      yaml = readFileSync(filePath, "utf-8");
    } catch {
      continue;
    }

    // Only process gates that declare an L1 layer
    if (!hasLayer(yaml, "L1")) continue;

    const gateId = extractField(yaml, "id") ?? file.replace(".yaml", "");
    const checkType = extractCheckType(yaml);

    if (checkType === "file_system") {
      const violation = evaluateFilesystemGate(projectDir, gateId, yaml);
      if (violation) violations.push(violation);
    } else if (checkType === "logic" || checkType === "mcp") {
      // Logic and MCP gates cannot be evaluated without running tooling —
      // surface them as "requires audit to evaluate" so they are visible.
      violations.push({
        gateId,
        message: "requires audit to evaluate (logic/mcp check)",
        fixHint: extractField(yaml, "fixHint"),
      });
    }
    // Other check types (process, tooled, cli) are skipped — cannot evaluate statically
  }

  return violations;
}
