/**
 * spec-parser-markdown: Markdown heading extraction and structured content helpers.
 */

// ── Heading extraction ────────────────────────────────────────────────

export const HEADING_PATTERNS: ReadonlyArray<{
  key: string;
  patterns: readonly string[];
}> = [
  {
    key: "problem",
    patterns: [
      "## problem",
      "## preamble",
      "## purpose",
      "## vision",
      "## what is",
      "## overview",
      "## background",
      "## context",
      "## about",
    ],
  },
  {
    key: "users",
    patterns: [
      "## users",
      "## user",
      "## actors",
      "## primary user",
      "## who",
      "## target",
      "## audience",
      "## personas",
    ],
  },
  {
    key: "success",
    patterns: [
      "## success",
      "## goals",
      "## goal",
      "## objectives",
      "## objective",
      "## metrics",
    ],
  },
  {
    key: "components",
    patterns: [
      "## components",
      "## component",
      "## architecture",
      "## modules",
      "## module",
      "## services",
      "## service",
    ],
  },
  {
    key: "external",
    patterns: [
      "## external",
      "## integrations",
      "## integration",
      "## dependencies",
      "## apis",
    ],
  },
];

/**
 * Extract content after a markdown heading until the next heading of the same or higher level.
 *
 * @param text - Full markdown text
 * @param heading - The heading to search for (e.g., "## Problem")
 * @returns Trimmed content after the heading, or null if not found
 */
export function extractHeadingContent(text: string, heading: string): string | null {
  const escapedHeading = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const lineStartRegex = new RegExp(
    `(?:^|\n)${escapedHeading}\\s*(?:\n|$)`,
    "i",
  );
  const match = lineStartRegex.exec(text);
  if (!match) return null;

  const afterHeading = text.slice(match.index + match[0].length);
  const nextHeading = afterHeading.match(/\n#{1,3} /);
  const content = nextHeading
    ? afterHeading.slice(0, nextHeading.index)
    : afterHeading;
  return content.trim() || null;
}

/**
 * Extract structured content from a markdown spec using known heading patterns.
 *
 * @param text - Spec text
 * @returns Partial record of extracted sections
 */
export function extractStructuredSections(text: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const { key, patterns } of HEADING_PATTERNS) {
    for (const pattern of patterns) {
      const content = extractHeadingContent(text, pattern);
      if (content) {
        result[key] = content;
        break;
      }
    }
  }
  return result;
}

// ── Name extraction ───────────────────────────────────────────────────

/**
 * Extract project name from spec text (first heading or title pattern).
 *
 * @param text - Spec text
 * @param hintName - Fallback name if not derivable
 * @returns Project name
 */
export function extractName(text: string, hintName?: string): string {
  const h1 = text.match(/^#\s+(.+)/m);
  if (h1?.[1]) return h1[1].trim();

  const titlePattern = text.match(/(?:project|title|name):\s*(.+)/i);
  if (titlePattern?.[1]) return titlePattern[1].trim();

  return hintName ?? "[Project Name]";
}

// ── Keyword fallback extraction ───────────────────────────────────────

const SENTENCE_SPLIT = /(?<=[.!?])\s+/;

/**
 * Extract sentences containing any of the given keywords.
 *
 * @param text - Text to search
 * @param keywords - Words that signal relevance
 * @returns Array of matching sentences (deduplicated)
 */
export function extractSentencesByKeyword(
  text: string,
  keywords: readonly string[],
): string[] {
  const sentences = text
    .split(SENTENCE_SPLIT)
    .map((s) => s.trim())
    .filter(Boolean);
  const seen = new Set<string>();
  const results: string[] = [];
  const lower = keywords.map((k) => k.toLowerCase());
  for (const sentence of sentences) {
    const lc = sentence.toLowerCase();
    if (lower.some((k) => lc.includes(k)) && !seen.has(sentence)) {
      seen.add(sentence);
      results.push(sentence);
    }
  }
  return results;
}

/**
 * Extract bullet items from a content block (lines starting with -, *, or numbers).
 *
 * @param content - Markdown block content
 * @returns Array of extracted items
 */
export function extractBulletItems(content: string): string[] {
  return content
    .split("\n")
    .map((l) => l.replace(/^[-*\d+.]\s*/, "").trim())
    .filter((l) => l.length > 0 && !l.startsWith("#") && !l.startsWith("<!--"));
}
