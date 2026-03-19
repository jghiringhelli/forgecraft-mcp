/**
 * classify_project tool handler.
 *
 * Analyzes a project directory and/or description to suggest tags.
 */
// @ts-nocheck


import { z } from "zod";
import { ALL_TAGS } from "../shared/types.js";
import type { ClassifyResult, Tag } from "../shared/types.js";
import { analyzeProject, analyzeDescription } from "../analyzers/package-json.js";

// ── Schema ───────────────────────────────────────────────────────────

export const classifyProjectSchema = z.object({
  project_dir: z
    .string()
    .optional()
    .describe("Absolute path to the project directory to analyze."),
  description: z
    .string()
    .optional()
    .describe("Natural language description of the project for tag inference."),
});

// ── Handler ──────────────────────────────────────────────────────────

export async function classifyProjectHandler(
  args: z.infer<typeof classifyProjectSchema>,
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  const codeDetections: Record<string, { confidence: number; evidence: string[] }> = {};
  const descDetections: Record<string, { confidence: number; evidence: string[] }> = {};
  const suggestedTags: Tag[] = ["UNIVERSAL"];

  // Analyze code if project_dir provided
  if (args.project_dir) {
    const detections = analyzeProject(args.project_dir);
    for (const d of detections) {
      codeDetections[d.tag] = { confidence: d.confidence, evidence: d.evidence };
      if (d.confidence >= 0.6 && !suggestedTags.includes(d.tag)) {
        suggestedTags.push(d.tag);
      }
    }
  }

  // Analyze description if provided
  if (args.description) {
    const detections = analyzeDescription(args.description);
    for (const d of detections) {
      descDetections[d.tag] = { confidence: d.confidence, evidence: d.evidence };
      if (d.confidence >= 0.6 && !suggestedTags.includes(d.tag)) {
        suggestedTags.push(d.tag);
      }
    }
  }

  const result: ClassifyResult = {
    suggestedTags,
    detectedFromCode: codeDetections,
    detectedFromDescription: descDetections,
    availableTags: ALL_TAGS,
    requiresConfirmation: true,
  };

  // Format output
  const tagsList = result.suggestedTags.map((t) => `[${t}]`).join(" ");
  const codeEvidence = Object.entries(result.detectedFromCode)
    .map(([tag, d]) => `  - **${tag}** (${Math.round(d.confidence * 100)}%): ${d.evidence.join(", ")}`)
    .join("\n");
  const descEvidence = Object.entries(result.detectedFromDescription)
    .map(([tag, d]) => `  - **${tag}** (${Math.round(d.confidence * 100)}%): ${d.evidence.join(", ")}`)
    .join("\n");

  let text = `# Project Classification\n\n`;
  text += `**Suggested Tags:** ${tagsList}\n\n`;

  if (codeEvidence) {
    text += `## Evidence from Code Analysis\n${codeEvidence}\n\n`;
  }
  if (descEvidence) {
    text += `## Evidence from Description\n${descEvidence}\n\n`;
  }

  text += `## All Available Tags\n`;
  text += ALL_TAGS.map((t) => `\`${t}\``).join(", ");
  text += `\n\n_Confirm or adjust these tags before scaffolding._`;

  return { content: [{ type: "text", text }] };
}
