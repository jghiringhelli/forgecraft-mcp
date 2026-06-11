/**
 * Registry-wide gate schema lint — the ratchet pawl.
 *
 * Two invariants, enforced over EVERY gate YAML shipped in
 * .forgecraft/gates/registry/:
 *
 *  1. Every gate file parses and passes validateGate (required fields present,
 *     evidence present when generalizable: true).
 *  2. Every gate ID that getEnvironmentActivatedGateIds can ever emit resolves
 *     to an installed registry gate. This is the invariant whose absence let
 *     the deployment schema advertise security/PII gates that did not exist —
 *     a silent false-assurance. With this test, activation logic can never
 *     again reference a gate that isn't shipped.
 */

import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import yaml from "js-yaml";
import { validateGate } from "../../src/shared/project-gates-helpers.js";
import { getRegistryGates } from "../../src/shared/project-gates-folder.js";
import { getEnvironmentActivatedGateIds } from "../../src/shared/project-gates-helpers.js";
import type { DeploymentEnvironmentConfig } from "../../src/shared/types/project.js";

const REPO_ROOT = join(import.meta.dirname, "..", "..");
const REGISTRY_DIR = join(REPO_ROOT, ".forgecraft", "gates", "registry");

/** Collect every gate YAML path under the registry, grouped by category. */
function allGateFiles(): Array<{ category: string; file: string; path: string }> {
  const out: Array<{ category: string; file: string; path: string }> = [];
  for (const entry of readdirSync(REGISTRY_DIR, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const catDir = join(REGISTRY_DIR, entry.name);
    for (const f of readdirSync(catDir)) {
      if (f.endsWith(".yaml") || f.endsWith(".yml")) {
        out.push({ category: entry.name, file: f, path: join(catDir, f) });
      }
    }
  }
  return out;
}

describe("registry gate schema", () => {
  const files = allGateFiles();

  it("finds gate files in the registry", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  for (const { category, file, path } of files) {
    it(`${category}/${file} parses and passes validateGate`, () => {
      const raw = readFileSync(path, "utf-8");
      const parsed = yaml.load(raw) as Record<string, unknown>;
      expect(parsed, `${file} did not parse to an object`).toBeTruthy();
      const errors = validateGate(parsed as never);
      expect(errors, `${file}: ${errors.join("; ")}`).toHaveLength(0);
    });

    it(`${category}/${file} declares an id matching its filename`, () => {
      const raw = readFileSync(path, "utf-8");
      const parsed = yaml.load(raw) as { id?: string };
      const expectedId = file.replace(/\.(yaml|yml)$/, "");
      expect(parsed.id).toBe(expectedId);
    });
  }

  it("has no duplicate gate ids across the whole registry", () => {
    const ids = files.map(({ path }) => {
      const parsed = yaml.load(readFileSync(path, "utf-8")) as { id?: string };
      return parsed.id;
    });
    const seen = new Set<string>();
    const dupes = new Set<string>();
    for (const id of ids) {
      if (id && seen.has(id)) dupes.add(id);
      if (id) seen.add(id);
    }
    expect([...dupes], `duplicate ids: ${[...dupes].join(", ")}`).toHaveLength(0);
  });
});

describe("environment-activated gates are all installed (no false assurance)", () => {
  // Exercise every property that getEnvironmentActivatedGateIds branches on, so
  // the union of all possible activated IDs is covered.
  const maximalEnvs: Record<string, DeploymentEnvironmentConfig> = {
    dev: { provider: "local", class: "dev" },
    lte: { provider: "fly", class: "lte", ephemeral: true },
    qae: { provider: "fly", class: "qae", smtpRelay: "prod" },
    cae: {
      provider: "fly",
      class: "cae",
      containsPii: true,
      externallyAccessible: true,
    },
    prd: {
      provider: "fly",
      class: "prd",
      containsPii: true,
      externallyAccessible: true,
      underChangeControl: true,
    },
  };

  it("every activated gate id resolves to a shipped registry gate", () => {
    const activated = getEnvironmentActivatedGateIds(maximalEnvs);
    expect(activated.length).toBeGreaterThan(0);

    const installed = new Set(
      getRegistryGates(REPO_ROOT).map((g) => g.id),
    );
    const missing = activated.filter((id) => !installed.has(id));
    expect(
      missing,
      `activation references gate(s) not installed in the registry: ${missing.join(", ")}`,
    ).toHaveLength(0);
  });

  it("activates the security + PII gates for the right properties", () => {
    const activated = getEnvironmentActivatedGateIds(maximalEnvs);
    // externallyAccessible
    expect(activated).toContain("security-headers-present");
    expect(activated).toContain("content-security-policy-set");
    // containsPii
    expect(activated).toContain("pii-masking-in-logs");
    expect(activated).toContain("audit-log-on-pii-access");
  });
});
