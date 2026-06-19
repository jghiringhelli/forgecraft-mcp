/**
 * Tests for environment-class gate activation logic.
 */
import { describe, it, expect } from "vitest";
import { getEnvironmentActivatedGateIds } from "../../src/shared/project-gates-helpers.js";
import type { DeploymentEnvironmentConfig } from "../../src/shared/types/project.js";

describe("getEnvironmentActivatedGateIds", () => {
  it("returns empty array when no environments declared", () => {
    const result = getEnvironmentActivatedGateIds({});
    expect(result).toHaveLength(0);
  });

  it("activates lte gates for class: lte environment", () => {
    const envs: Record<string, DeploymentEnvironmentConfig> = {
      lte: { provider: "railway", class: "lte" },
    };
    const result = getEnvironmentActivatedGateIds(envs);
    expect(result).toContain("lte-ephemeral-infra");
    expect(result).toContain("lte-anonymized-data");
  });

  it("activates lte gates for ephemeral: true even without class", () => {
    const envs: Record<string, DeploymentEnvironmentConfig> = {
      perf: { provider: "fly", ephemeral: true },
    };
    const result = getEnvironmentActivatedGateIds(envs);
    expect(result).toContain("lte-ephemeral-infra");
    expect(result).toContain("lte-anonymized-data");
  });

  it("activates no-cross-tier-urls for cae environment", () => {
    const envs: Record<string, DeploymentEnvironmentConfig> = {
      cae: {
        provider: "railway",
        class: "cae",
        url: "https://app-cae.example.com",
      },
    };
    const result = getEnvironmentActivatedGateIds(envs);
    expect(result).toContain("no-cross-tier-urls");
  });

  it("activates no-cross-tier-urls for prd environment", () => {
    const envs: Record<string, DeploymentEnvironmentConfig> = {
      prd: {
        provider: "railway",
        class: "prd",
        url: "https://app.example.com",
      },
    };
    const result = getEnvironmentActivatedGateIds(envs);
    expect(result).toContain("no-cross-tier-urls");
  });

  it("activates cae-version-parity only for cae environment", () => {
    const envs: Record<string, DeploymentEnvironmentConfig> = {
      cae: { provider: "railway", class: "cae" },
      prd: { provider: "railway", class: "prd" },
    };
    const result = getEnvironmentActivatedGateIds(envs);
    expect(result).toContain("cae-version-parity");
  });

  it("does not activate cae-version-parity for prd without cae", () => {
    const envs: Record<string, DeploymentEnvironmentConfig> = {
      prd: { provider: "railway", class: "prd" },
    };
    const result = getEnvironmentActivatedGateIds(envs);
    expect(result).not.toContain("cae-version-parity");
  });

  it("activates prd-change-control for underChangeControl: true", () => {
    const envs: Record<string, DeploymentEnvironmentConfig> = {
      staging: { provider: "railway", underChangeControl: true },
    };
    const result = getEnvironmentActivatedGateIds(envs);
    expect(result).toContain("prd-change-control");
  });

  it("activates prd-change-control for class: prd", () => {
    const envs: Record<string, DeploymentEnvironmentConfig> = {
      prd: { provider: "railway", class: "prd" },
    };
    const result = getEnvironmentActivatedGateIds(envs);
    expect(result).toContain("prd-change-control");
  });

  it("activates no-cross-tier-urls for containsPii: true environment", () => {
    const envs: Record<string, DeploymentEnvironmentConfig> = {
      cae: { provider: "railway", containsPii: true },
    };
    const result = getEnvironmentActivatedGateIds(envs);
    expect(result).toContain("no-cross-tier-urls");
  });

  it("activates PII gates for containsPii: true environment", () => {
    const envs: Record<string, DeploymentEnvironmentConfig> = {
      cae: { provider: "railway", containsPii: true },
    };
    const result = getEnvironmentActivatedGateIds(envs);
    expect(result).toContain("pii-masking-in-logs");
    expect(result).toContain("audit-log-on-pii-access");
  });

  it("activates security-header gates for externallyAccessible: true", () => {
    const envs: Record<string, DeploymentEnvironmentConfig> = {
      prd: { provider: "fly", class: "prd", externallyAccessible: true },
    };
    const result = getEnvironmentActivatedGateIds(envs);
    expect(result).toContain("security-headers-present");
    expect(result).toContain("content-security-policy-set");
  });

  it("does not activate security/PII gates when properties are absent", () => {
    const envs: Record<string, DeploymentEnvironmentConfig> = {
      dev: { provider: "local", class: "dev" },
    };
    const result = getEnvironmentActivatedGateIds(envs);
    expect(result).not.toContain("security-headers-present");
    expect(result).not.toContain("content-security-policy-set");
    expect(result).not.toContain("pii-masking-in-logs");
    expect(result).not.toContain("audit-log-on-pii-access");
  });

  it("returns deduplicated gate ids with no duplicates", () => {
    const envs: Record<string, DeploymentEnvironmentConfig> = {
      cae: { provider: "railway", class: "cae", containsPii: true },
      prd: { provider: "railway", class: "prd", underChangeControl: true },
    };
    const result = getEnvironmentActivatedGateIds(envs);
    const unique = new Set(result);
    expect(result.length).toBe(unique.size);
  });

  it("activates full set for a typical 5-tier configuration", () => {
    const envs: Record<string, DeploymentEnvironmentConfig> = {
      dev: { provider: "local", class: "dev" },
      qae: { provider: "railway", class: "qae" },
      lte: { provider: "railway", class: "lte", ephemeral: true },
      cae: {
        provider: "railway",
        class: "cae",
        containsPii: true,
        externallyAccessible: true,
        smtpRelay: "prod",
      },
      prd: {
        provider: "railway",
        class: "prd",
        containsPii: true,
        externallyAccessible: true,
        underChangeControl: true,
        smtpRelay: "prod",
      },
    };
    const result = getEnvironmentActivatedGateIds(envs);
    expect(result).toContain("lte-ephemeral-infra");
    expect(result).toContain("lte-anonymized-data");
    expect(result).toContain("no-cross-tier-urls");
    expect(result).toContain("cae-version-parity");
    expect(result).toContain("prd-change-control");
  });
});
