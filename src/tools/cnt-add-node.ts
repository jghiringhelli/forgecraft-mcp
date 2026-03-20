/**
 * cnt_add_node action handler.
 *
 * Adds a new leaf node to the CNT (.claude/standards/<domain>-<concern>.md)
 * and updates the domain table in .claude/index.md.
 *
 * Use this for incremental CNT growth as new architectural concerns emerge,
 * without regenerating the full tree (which would overwrite user edits).
 */

import { z } from "zod";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

export const cntAddNodeSchema = z.object({
  project_dir: z.string().describe("Absolute path to the project root."),
  domain: z
    .string()
    .min(2)
    .max(30)
    .regex(/^[a-z][a-z0-9-]*$/)
    .describe(
      "Domain prefix for this node. Must be lowercase kebab-case. " +
        "E.g. 'tools', 'shared', 'security'. Used as filename prefix.",
    ),
  concern: z
    .string()
    .min(2)
    .max(30)
    .regex(/^[a-z][a-z0-9-]*$/)
    .describe(
      "Concern name within the domain. Lowercase kebab-case. " +
        "E.g. 'routing', 'error-handling', 'auth'. Used as filename suffix.",
    ),
  content: z
    .string()
    .optional()
    .describe(
      "Markdown content for the leaf node (≤30 lines). If omitted, a " +
        "structured placeholder is generated. Content should focus on invariants, " +
        "patterns, and constraints relevant to this domain/concern — NOT general docs.",
    ),
});

export type CntAddNodeInput = z.infer<typeof cntAddNodeSchema>;

/** Maximum lines for a CNT leaf node. */
const MAX_LEAF_LINES = 30;

/**
 * Build placeholder content when none is provided.
 *
 * @param domain - Domain prefix
 * @param concern - Concern name
 * @returns Placeholder markdown content
 */
function buildPlaceholderContent(domain: string, concern: string): string {
  return [
    `# ${domain}/${concern}`,
    "",
    "## Invariants",
    "- TODO: document key invariants for this concern",
    "",
    "## Patterns",
    "- TODO: document patterns used here",
    "",
    "## Constraints",
    "- TODO: document what must NOT happen here",
  ].join("\n");
}

/**
 * Truncate content to the max leaf line limit and append a truncation notice.
 *
 * @param content - Full content to truncate
 * @returns Truncated content with notice
 */
function truncateContent(content: string): string {
  const lines = content.split("\n");
  return [
    ...lines.slice(0, MAX_LEAF_LINES),
    "# [truncated to 30-line CNT limit]",
  ].join("\n");
}

/**
 * Update .claude/index.md to add the new node to the domain routing table.
 * If the table already has an entry for this domain-concern, skip.
 *
 * @param projectDir - Absolute path to project root
 * @param domain - Domain prefix
 * @param concern - Concern name
 * @param nodeFile - Filename of the new leaf node (e.g. tools-routing.md)
 */
function updateIndexMd(
  projectDir: string,
  domain: string,
  concern: string,
  nodeFile: string,
): void {
  const indexPath = join(projectDir, ".claude", "index.md");
  const existing = readFileSync(indexPath, "utf-8");
  const link = `[${concern}](.claude/standards/${nodeFile})`;

  if (existing.includes(nodeFile)) return;

  const domainRowRegex = new RegExp(
    `(\\|\\s*${domain}\\s*\\|[^|\\n]*)\\|`,
    "m",
  );
  const match = existing.match(domainRowRegex);

  if (match) {
    const updated = existing.replace(
      domainRowRegex,
      `$1/ ${concern} → ${link} |`,
    );
    writeFileSync(indexPath, updated, "utf-8");
  } else {
    const newRow = `| ${domain} | ${link} |\n`;
    writeFileSync(indexPath, existing + newRow, "utf-8");
  }
}

/**
 * Add a CNT leaf node and update the routing index.
 *
 * @param args - Validated input
 * @returns MCP-style result
 */
export async function cntAddNodeHandler(
  args: CntAddNodeInput,
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  const { project_dir: projectDir, domain, concern } = args;

  const indexPath = join(projectDir, ".claude", "index.md");
  if (!existsSync(indexPath)) {
    return {
      content: [
        {
          type: "text",
          text: "Error: CNT not initialized. Run setup_project first.",
        },
      ],
    };
  }

  const nodeFile = `${domain}-${concern}.md`;
  const nodePath = join(projectDir, ".claude", "standards", nodeFile);

  if (existsSync(nodePath)) {
    return {
      content: [
        {
          type: "text",
          text:
            `Error: .claude/standards/${nodeFile} already exists. ` +
            `Edit it directly to update its content.`,
        },
      ],
    };
  }

  const rawContent = args.content ?? buildPlaceholderContent(domain, concern);
  const rawLines = rawContent.split("\n").length;
  const isTruncated = rawLines > MAX_LEAF_LINES;
  const finalContent = isTruncated ? truncateContent(rawContent) : rawContent;
  const finalLines = finalContent.split("\n").length;

  mkdirSync(join(projectDir, ".claude", "standards"), { recursive: true });
  writeFileSync(nodePath, finalContent, "utf-8");
  updateIndexMd(projectDir, domain, concern, nodeFile);

  const truncationNote = isTruncated
    ? `\n⚠️ Content was truncated from ${rawLines} to ${MAX_LEAF_LINES} lines (CNT limit).`
    : "";

  const text =
    `✅ CNT node added: .claude/standards/${nodeFile} (${finalLines} lines)${truncationNote}\n` +
    `.claude/index.md updated with ${domain}/${concern} routing entry.`;

  return { content: [{ type: "text", text }] };
}
