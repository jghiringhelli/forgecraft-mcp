/**
 * add_hook tool handler.
 *
 * Adds a specific hook script to the project.
 */
// @ts-nocheck


import { z } from "zod";
import { mkdirSync, writeFileSync, chmodSync, existsSync } from "node:fs";
import { join } from "node:path";
import { ALL_TAGS } from "../shared/types.js";
import type { Tag } from "../shared/types.js";
import { loadAllTemplates } from "../registry/loader.js";

// ── Schema ───────────────────────────────────────────────────────────

export const addHookSchema = z.object({
  hook: z
    .string()
    .describe("Name of the hook to add (e.g. 'i18n-enforcement', 'secrets-scanner')."),
  tag: z
    .enum(ALL_TAGS as unknown as [string, ...string[]])
    .optional()
    .describe("Tag the hook belongs to. If omitted, searches all tags."),
  project_dir: z
    .string()
    .describe("Absolute path to the project root directory."),
});

// ── Handler ──────────────────────────────────────────────────────────

export async function addHookHandler(
  args: z.infer<typeof addHookSchema>,
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  const templateSets = await loadAllTemplates();

  // Find the requested hook
  let foundHook = null;
  let foundTag: Tag | null = null;

  for (const [_tag, templateSet] of templateSets) {
    if (args.tag && templateSet.tag !== args.tag) continue;

    if (templateSet.hooks) {
      const match = templateSet.hooks.find((h) => h.name === args.hook);
      if (match) {
        foundHook = match;
        foundTag = templateSet.tag;
        break;
      }
    }
  }

  if (!foundHook || !foundTag) {
    const available = Array.from(templateSets.values())
      .flatMap((ts) => (ts.hooks ?? []).map((h) => `${h.name} [${ts.tag}]`))
      .join(", ");

    return {
      content: [
        {
          type: "text",
          text: `Hook "${args.hook}" not found.\n\nAvailable hooks: ${available}`,
        },
      ],
    };
  }

  // Write hook file
  const hooksDir = join(args.project_dir, ".claude", "hooks");
  mkdirSync(hooksDir, { recursive: true });

  const hookPath = join(hooksDir, foundHook.filename);
  const alreadyExists = existsSync(hookPath);

  writeFileSync(hookPath, foundHook.script, "utf-8");
  try {
    chmodSync(hookPath, 0o755);
  } catch {
    // chmod may fail on Windows
  }

  const action = alreadyExists ? "Updated" : "Created";

  return {
    content: [
      {
        type: "text",
        text: `${action} hook: \`${foundHook.filename}\`\n\n` +
          `**Name:** ${foundHook.name}\n` +
          `**Tag:** [${foundTag}]\n` +
          `**Trigger:** ${foundHook.trigger}\n` +
          `**Description:** ${foundHook.description}\n` +
          `**Path:** \`.claude/hooks/${foundHook.filename}\``,
      },
    ],
  };
}
