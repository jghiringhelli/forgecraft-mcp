/**
 * scaffold-spec-stubs: Spec stub writers for scaffold_project.
 *
 * Manages UNFILLED stub documents that are detectable by check_cascade.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

export const USE_CASES_STUB = `<!-- UNFILLED: Use Cases -->
# Use Cases

## UC-01: [Name]
**Actor**: <!-- FILL: who? -->
**Precondition**: <!-- FILL: what must be true before? -->
**Steps**: <!-- FILL: numbered steps -->
**Success**: <!-- FILL: what changed? -->

## UC-02: [Name]
<!-- FILL -->

## UC-03: [Name]
<!-- FILL -->
`;

/**
 * Build the UNFILLED stub content for docs/diagrams/c4-context.md.
 *
 * @param projectName - Human-readable project name for the diagram title
 * @returns Stub content with UNFILLED markers
 */
export function buildC4ContextStub(projectName: string): string {
  return `<!-- UNFILLED: C4 Context Diagram -->
<!-- Run \`forgecraft generate_diagram\` to auto-generate from your spec -->
# System Context Diagram
\`\`\`mermaid
C4Context
  title System Context: ${projectName}
  Person(user, "User", "<!-- FILL: Who uses the system? -->")
  System(system, "${projectName}", "<!-- FILL: What does the system do in one sentence? -->")
  Rel(user, system, "<!-- FILL: Primary interaction -->")
\`\`\`
`;
}

/**
 * Write a spec stub file. Only creates when the file does not exist, or when
 * force=true AND the existing file still contains the UNFILLED marker.
 *
 * @param relativePath - Relative path for tracking output
 * @param fullPath - Absolute path to write
 * @param content - Stub content to write
 * @param force - Whether to overwrite existing stubs
 * @param filesCreated - Mutable array to append created paths to
 * @param filesSkipped - Mutable array to append skipped paths to
 */
export function writeSpecStub(
  relativePath: string,
  fullPath: string,
  content: string,
  force: boolean,
  filesCreated: string[],
  filesSkipped: string[],
): void {
  mkdirSync(dirname(fullPath), { recursive: true });

  if (!existsSync(fullPath)) {
    writeFileSync(fullPath, content, "utf-8");
    filesCreated.push(relativePath);
    return;
  }

  const existing = readFileSync(fullPath, "utf-8");
  if (force && existing.includes("<!-- UNFILLED")) {
    writeFileSync(fullPath, content, "utf-8");
    filesCreated.push(relativePath);
  } else {
    filesSkipped.push(relativePath);
  }
}
