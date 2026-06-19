/**
 * Tests for per-environment test-suite scaffolding and the audit
 * environment-activated-gates section.
 */
import { describe, it, expect, afterEach } from "vitest";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  renderEnvSmokeTest,
  renderEnvLoadTest,
} from "../../src/tools/scaffold-templates.js";
import { formatEnvironmentGatesSection } from "../../src/tools/audit.js";
import type {
  DeploymentEnvironmentConfig,
  ProjectDeploymentConfig,
} from "../../src/shared/types/project.js";

describe("renderEnvSmokeTest", () => {
  const deployment: ProjectDeploymentConfig = {
    testing: { smokeTool: "hurl" },
  };
  const env: DeploymentEnvironmentConfig = {
    provider: "fly",
    class: "cae",
    url: "https://staging.example.com",
    health: "/healthz",
  };

  it("targets the env URL via an env var with the declared default", () => {
    const out = renderEnvSmokeTest("staging", env, deployment);
    expect(out).toContain("SMOKE_URL_STAGING");
    expect(out).toContain("https://staging.example.com");
    expect(out).toContain("/healthz");
  });

  it("references the configured smokeTool", () => {
    const out = renderEnvSmokeTest("staging", env, deployment);
    expect(out).toContain("hurl");
  });

  it("fails closed when no URL is available", () => {
    const out = renderEnvSmokeTest(
      "staging",
      { provider: "fly", class: "cae" },
      {},
    );
    // No declared url → default is empty → script must exit 1 when var unset
    expect(out).toContain("is not set and no url declared");
    expect(out).toContain("exit 1");
  });

  it("defaults the health path to /health when unspecified", () => {
    const out = renderEnvSmokeTest(
      "dev",
      { provider: "local", class: "dev", url: "http://localhost:3000" },
      {},
    );
    expect(out).toContain("/health");
  });
});

describe("renderEnvLoadTest", () => {
  const deployment: ProjectDeploymentConfig = {
    testing: {
      load: {
        tool: "k6",
        concurrentUsers: 50,
        targetRps: 200,
        p99CeilingMs: 300,
        durationSeconds: 120,
      },
    },
  };
  const env: DeploymentEnvironmentConfig = {
    provider: "fly",
    class: "lte",
    url: "https://lte.example.com",
  };

  it("bakes the declared thresholds into the k6 options", () => {
    const out = renderEnvLoadTest("lte", env, deployment);
    expect(out).toContain("vus: 50");
    expect(out).toContain("duration: '120s'");
    expect(out).toContain("p(99)<300");
    expect(out).toContain("LOAD_URL_LTE");
    expect(out).toContain("https://lte.example.com");
  });

  it("states the target RPS as a stated-before-run parameter", () => {
    const out = renderEnvLoadTest("lte", env, deployment);
    expect(out).toContain("Target RPS");
    expect(out).toContain("200");
  });

  it("leaves TODO markers when thresholds are not declared", () => {
    const out = renderEnvLoadTest("lte", env, { testing: {} });
    expect(out).toContain("__TODO_concurrentUsers__");
    expect(out).toContain("__TODO_p99CeilingMs__");
  });
});

describe("formatEnvironmentGatesSection (audit)", () => {
  let tempDir: string;

  afterEach(() => {
    if (tempDir) rmSync(tempDir, { recursive: true, force: true });
  });

  function writeConfig(deployment: unknown): void {
    tempDir = join(tmpdir(), `fc-env-audit-${Date.now()}`);
    mkdirSync(tempDir, { recursive: true });
    // Minimal forgecraft.yaml with a deployment block.
    const yamlLines = JSON.stringify({ deployment });
    writeFileSync(join(tempDir, "forgecraft.yaml"), yamlLines, "utf-8");
  }

  it("returns null when no environments are declared", () => {
    writeConfig({});
    expect(formatEnvironmentGatesSection(tempDir)).toBeNull();
  });

  it("lists the gates a PII + externally-accessible prod environment activates", () => {
    writeConfig({
      environments: {
        prd: {
          provider: "fly",
          class: "prd",
          containsPii: true,
          externallyAccessible: true,
        },
      },
    });
    const section = formatEnvironmentGatesSection(tempDir);
    expect(section).toBeTruthy();
    expect(section).toContain("Environment-Activated Gates");
    expect(section).toContain("security-headers-present");
    expect(section).toContain("content-security-policy-set");
    expect(section).toContain("pii-masking-in-logs");
    expect(section).toContain("audit-log-on-pii-access");
    expect(section).toContain("prd-change-control");
  });

  it("returns null when there is no config file at all", () => {
    tempDir = join(tmpdir(), `fc-env-audit-empty-${Date.now()}`);
    mkdirSync(tempDir, { recursive: true });
    expect(formatEnvironmentGatesSection(tempDir)).toBeNull();
  });
});
