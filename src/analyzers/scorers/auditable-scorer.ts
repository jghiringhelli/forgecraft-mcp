/**
 * Auditable scorer: ADRs, Status.md, and conventional commit infrastructure present.
 */

import { existsSync } from "node:fs";
import { join } from "node:path";
import type { GsPropertyScore } from "../../shared/types.js";
import { gs } from "./scorer-utils.js";

/**
 * Score the Auditable GS property.
 * 2 = ADRs + Status.md + commit config, 1 = some subset, 0 = none.
 */
export function scoreAuditable(projectDir: string, allFiles: string[]): GsPropertyScore {
  const adrFiles = allFiles.filter(
    (f) =>
      /docs\/(adrs?|decisions?|rfcs?)\//i.test(f.replace(/\\/g, "/")) &&
      f.endsWith(".md"),
  );
  const hasAdrs = adrFiles.length > 0;

  const statusPaths = ["Status.md", "status.md", "STATUS.md", "CHANGELOG.md"];
  const hasStatus = statusPaths.some((p) => existsSync(join(projectDir, p)));

  const commitConfigs = [
    "commitlint.config.js", "commitlint.config.cjs", "commitlint.config.mjs",
    ".commitlintrc.js", ".commitlintrc.json", ".commitlintrc.yaml",
    ".husky/commit-msg",
  ];
  const hasCommitConfig = commitConfigs.some((p) => existsSync(join(projectDir, p)));

  const signals = [hasAdrs, hasStatus, hasCommitConfig].filter(Boolean).length;

  if (signals === 3) {
    return gs("auditable", 2, [
      `${adrFiles.length} ADR file(s) found in docs/adrs/`,
      "Status.md / CHANGELOG.md present",
      "Conventional commit configuration present",
    ]);
  }

  if (signals >= 1) {
    const present: string[] = [];
    const absent: string[] = [];
    if (hasAdrs) present.push(`${adrFiles.length} ADR(s)`);
    else absent.push("ADRs in docs/adrs/");
    if (hasStatus) present.push("Status.md");
    else absent.push("Status.md / CHANGELOG.md");
    if (hasCommitConfig) present.push("commit config");
    else absent.push("commitlint config");

    return gs("auditable", 1, [
      `Present: ${present.join(", ")}`,
      `Missing: ${absent.join(", ")}`,
    ]);
  }

  return gs("auditable", 0, [
    "No ADRs found (expected in docs/adrs/)",
    "No Status.md or CHANGELOG.md found",
    "No conventional commit configuration found",
  ]);
}
