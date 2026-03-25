/**
 * Bounded scorer: no direct DB calls in route/controller files.
 */

import type { GsPropertyScore, LayerViolation } from "../../shared/types.js";
import { gs } from "./scorer-utils.js";

/**
 * Score the Bounded GS property.
 * 2 = zero violations, 1 = 1–2, 0 = 3+.
 */
export function scoreBounded(violations: LayerViolation[]): GsPropertyScore {
  const count = violations.length;

  if (count === 0) {
    return gs("bounded", 2, [
      "No direct DB/ORM calls detected in route or controller files",
    ]);
  }

  if (count <= 2) {
    return gs("bounded", 1, [
      `${count} direct DB call(s) found in route/controller files`,
      ...violations.map((v) => `  ${v.file}:${v.line} — ${v.snippet.trim()}`),
    ]);
  }

  return gs("bounded", 0, [
    `${count} direct DB calls found — route layer is calling the DB directly`,
    ...violations.slice(0, 5).map((v) => `  ${v.file}:${v.line} — ${v.snippet.trim()}`),
    ...(count > 5 ? [`  … and ${count - 5} more`] : []),
  ]);
}
