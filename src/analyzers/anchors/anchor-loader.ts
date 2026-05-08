/**
 * Calibration anchor loader.
 *
 * Anchors are markdown files that ground each GS property score level (0/1/2)
 * in a concrete real-world example. Consumers (e.g. pragmaworks) ship their
 * own anchor library; this repo also includes a default set under `anchors/`
 * for self-calibration and tests.
 *
 * Layout:
 *   <anchorPath>/<property>/<level>.md
 *   e.g. anchors/bounded/2.md
 *
 * Anchor file format:
 *   # <title>
 *   - repo: <repo+commit-hash>
 *   - feature: <feature being anchored>
 *
 *   ## Why this score
 *   <reason it sits at the level>
 *
 *   ## What would move it up
 *   <delta to next level>
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type {
  AnchorReference,
  GsProperty,
  GsPropertyScore,
} from "../../shared/types.js";

/** Options accepted by the scoring engine to control anchor lookup. */
export interface AnchorOptions {
  /**
   * Absolute path to a directory of anchor files. When unset, anchors are
   * not consulted and scores remain non-provisional.
   */
  readonly anchorPath?: string;
}

/**
 * Load a calibration anchor for a property + level.
 *
 * @returns The parsed anchor reference, or null when no file exists.
 */
export function loadAnchor(
  anchorPath: string,
  property: GsProperty,
  level: 0 | 1 | 2,
): AnchorReference | null {
  const filePath = join(anchorPath, property, `${level}.md`);
  if (!existsSync(filePath)) {
    return null;
  }
  let raw = "";
  try {
    raw = readFileSync(filePath, "utf-8");
  } catch {
    return null;
  }
  return parseAnchorFile(raw, filePath, property, level);
}

/** Parse the markdown body of an anchor file into an AnchorReference. */
export function parseAnchorFile(
  raw: string,
  path: string,
  property: GsProperty,
  level: 0 | 1 | 2,
): AnchorReference {
  const titleMatch = raw.match(/^#\s+(.+)$/m);
  const repoMatch = raw.match(/^[-*]\s*repo\s*:\s*(.+)$/im);
  const featureMatch = raw.match(/^[-*]\s*feature\s*:\s*(.+)$/im);
  const rationale = extractSection(raw, /Why this score/i);
  const nextLevelDelta = extractSection(raw, /What would move it up/i);

  return {
    property,
    level,
    path,
    title: titleMatch?.[1]?.trim(),
    anchoredRepo: repoMatch?.[1]?.trim(),
    feature: featureMatch?.[1]?.trim(),
    rationale: rationale ?? undefined,
    nextLevelDelta: nextLevelDelta ?? undefined,
  };
}

/**
 * Apply a calibration anchor to a score. When the anchor exists, append a
 * reference line to evidence and attach the AnchorReference. When no anchor
 * is available, mark the score `provisional: true` and add an explanatory note.
 */
export function applyAnchor(
  score: GsPropertyScore,
  options: AnchorOptions,
): GsPropertyScore {
  if (!options.anchorPath) {
    return score;
  }
  const anchor = loadAnchor(options.anchorPath, score.property, score.score);
  if (anchor) {
    const ref = anchor.title
      ? `Anchor: ${anchor.title} (${anchor.path})`
      : `Anchor: ${anchor.path}`;
    return {
      ...score,
      anchor,
      evidence: [...score.evidence, ref],
    };
  }
  return {
    ...score,
    provisional: true,
    evidence: [
      ...score.evidence,
      `Provisional: no anchor at ${join(options.anchorPath, score.property, `${score.score}.md`)} — score is unanchored.`,
    ],
  };
}

function extractSection(raw: string, header: RegExp): string | null {
  const lines = raw.split("\n");
  let inSection = false;
  const collected: string[] = [];
  for (const line of lines) {
    if (/^#{1,6}\s+/.test(line)) {
      if (inSection) break;
      const heading = line.replace(/^#+\s+/, "").trim();
      if (header.test(heading)) {
        inSection = true;
        continue;
      }
    } else if (inSection) {
      collected.push(line);
    }
  }
  const body = collected.join("\n").trim();
  return body.length > 0 ? body : null;
}
