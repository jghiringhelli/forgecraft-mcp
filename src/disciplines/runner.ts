/**
 * Disciplines runner — apply the catalog to a concrete repo path.
 *
 * Two entry points:
 *   - detectApplicableDisciplines: which disciplines match this codebase?
 *   - scoreApplicableDisciplines: of those that match, how well are they
 *     followed? Score bodies are skeletons today (see `catalog.ts`); the
 *     runner shape is the contract callers can rely on.
 *
 * Detection and scoring are deliberately split so callers can render a
 * "this repo speaks N disciplines" summary without paying for scoring.
 */
import { DISCIPLINES } from "./catalog.js";

export interface DetectedDiscipline {
  name: string;
  applies: boolean;
  evidence: string[];
}

export interface ScoredDiscipline {
  name: string;
  score: 0 | 1 | 2;
  evidence: string[];
}

export function detectApplicableDisciplines(
  repoPath: string,
): DetectedDiscipline[] {
  return DISCIPLINES.map((d) => {
    const r = d.detect(repoPath);
    return { name: d.name, applies: r.applies, evidence: r.evidence };
  });
}

export function scoreApplicableDisciplines(
  repoPath: string,
): ScoredDiscipline[] {
  const out: ScoredDiscipline[] = [];
  for (const d of DISCIPLINES) {
    const det = d.detect(repoPath);
    if (!det.applies) continue;
    const sc = d.score(repoPath);
    out.push({
      name: d.name,
      score: sc.score,
      evidence: [...det.evidence, ...sc.evidence],
    });
  }
  return out;
}
