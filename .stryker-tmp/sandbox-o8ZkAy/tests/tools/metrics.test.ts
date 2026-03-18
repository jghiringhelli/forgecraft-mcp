// @ts-nocheck
import { describe, it, expect } from "vitest";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { metricsHandler, buildMetricsReport } from "../../src/tools/metrics.js";
import {
  probeLoc,
  probeCoverage,
  probeLayerViolations,
  probeDeadCode,
  probeComplexity,
  probeMutation,
} from "../../src/analyzers/code-probes.js";

const FIXTURES = resolve(
  fileURLToPath(new URL(".", import.meta.url)),
  "../fixtures",
);

const METRICS_FIXTURE = resolve(FIXTURES, "metrics-project");

// ── probeLoc ──────────────────────────────────────────────────────────

describe("probeLoc", () => {
  it("counts TypeScript files in fixture", () => {
    const result = probeLoc(METRICS_FIXTURE);
    expect(result.available).toBe(true);
    expect(result.data!.files).toBeGreaterThanOrEqual(2);
  });

  it("reports lines greater than zero", () => {
    const result = probeLoc(METRICS_FIXTURE);
    expect(result.data!.lines).toBeGreaterThan(0);
  });

  it("groups results by extension", () => {
    const result = probeLoc(METRICS_FIXTURE);
    expect(result.data!.byExtension[".ts"]).toBeDefined();
    expect(result.data!.byExtension[".ts"].files).toBeGreaterThanOrEqual(2);
  });

  it("returns available=false for non-existent directory", () => {
    const result = probeLoc("/no/such/path/xyz");
    expect(result.available).toBe(false);
  });

  it("skips node_modules directory", () => {
    const clean = probeLoc(METRICS_FIXTURE);
    // node_modules not present in fixture so count stays low
    expect(clean.data!.files).toBeLessThan(100);
  });
});

// ── probeCoverage ─────────────────────────────────────────────────────

describe("probeCoverage", () => {
  it("reads coverage-summary.json from fixture", () => {
    const result = probeCoverage(METRICS_FIXTURE);
    expect(result.available).toBe(true);
    expect(result.data!.lines).toBe(85);
    expect(result.data!.functions).toBe(90);
    expect(result.data!.branches).toBe(75);
  });

  it("returns not-available with installHint when no report exists", () => {
    const result = probeCoverage(resolve(FIXTURES, "verify-clean-project"));
    expect(result.available).toBe(false);
    expect(result.installHint).toContain("c8");
  });

  it("accepts explicit coverageDir override", () => {
    const result = probeCoverage(METRICS_FIXTURE, resolve(METRICS_FIXTURE, "coverage"));
    expect(result.available).toBe(true);
    expect(result.data!.statements).toBe(80);
  });
});

// ── probeLayerViolations ──────────────────────────────────────────────

describe("probeLayerViolations", () => {
  it("detects prisma direct call in routes fixture", () => {
    const result = probeLayerViolations(METRICS_FIXTURE);
    expect(result.available).toBe(true);
    expect(result.data!.violations).toBeGreaterThanOrEqual(1);
  });

  it("uses internal source when depcruise not installed", () => {
    const result = probeLayerViolations(METRICS_FIXTURE);
    // In test environment depcruise is not in metrics-project/node_modules
    expect(result.data!.source).toBe("internal");
  });

  it("reports zero violations on clean project", () => {
    const result = probeLayerViolations(resolve(FIXTURES, "verify-clean-project"));
    expect(result.available).toBe(true);
    expect(result.data!.violations).toBe(0);
  });

  it("returns installHint when depcruise not installed", () => {
    const result = probeLayerViolations(METRICS_FIXTURE);
    expect(result.installHint).toBeDefined();
    expect(result.installHint).toContain("depcruise");
  });
});

// ── probeDeadCode ─────────────────────────────────────────────────────

describe("probeDeadCode", () => {
  it("returns not-available with installHint when knip not installed", () => {
    const result = probeDeadCode(METRICS_FIXTURE);
    expect(result.available).toBe(false);
    expect(result.installHint).toContain("knip");
  });
});

// ── probeComplexity ───────────────────────────────────────────────────

describe("probeComplexity", () => {
  it("returns not-available with installHint when eslint not installed", () => {
    const result = probeComplexity(METRICS_FIXTURE);
    expect(result.available).toBe(false);
    expect(result.installHint).toContain("eslint");
  });
});

// ── probeMutation ─────────────────────────────────────────────────────

describe("probeMutation", () => {
  it("returns not-available with installHint when stryker not installed", () => {
    const result = probeMutation(METRICS_FIXTURE);
    expect(result.available).toBe(false);
    expect(result.installHint).toContain("stryker");
  });
});

// ── metricsHandler ────────────────────────────────────────────────────

describe("metricsHandler", () => {
  it("returns MCP content array", async () => {
    const result = await metricsHandler({ project_dir: METRICS_FIXTURE, include_mutation: false });
    expect(result.content).toHaveLength(1);
    expect(result.content[0]!.type).toBe("text");
  });

  it("report contains Summary section", async () => {
    const result = await metricsHandler({ project_dir: METRICS_FIXTURE, include_mutation: false });
    expect(result.content[0]!.text).toContain("## Summary");
  });

  it("report contains coverage data from fixture", async () => {
    const result = await metricsHandler({ project_dir: METRICS_FIXTURE, include_mutation: false });
    expect(result.content[0]!.text).toContain("85%");
  });

  it("report shows LOC count", async () => {
    const result = await metricsHandler({ project_dir: METRICS_FIXTURE, include_mutation: false });
    expect(result.content[0]!.text).toMatch(/\d+ lines/);
  });

  it("report contains layer violation when present", async () => {
    const result = await metricsHandler({ project_dir: METRICS_FIXTURE, include_mutation: false });
    expect(result.content[0]!.text).toMatch(/[1-9]\d* \(source: internal\)/);
  });

  it("skips mutation section when include_mutation=false", async () => {
    const result = await metricsHandler({ project_dir: METRICS_FIXTURE, include_mutation: false });
    expect(result.content[0]!.text).toContain("Not run (pass --mutation to enable)");
  });

  it("shows install hints for missing tools", async () => {
    const result = await metricsHandler({ project_dir: METRICS_FIXTURE, include_mutation: false });
    expect(result.content[0]!.text).toContain("Install to Unlock Additional Metrics");
  });

  it("accepts explicit coverage_dir", async () => {
    const result = await metricsHandler({
      project_dir: METRICS_FIXTURE,
      coverage_dir: resolve(METRICS_FIXTURE, "coverage"),
      include_mutation: false,
    });
    expect(result.content[0]!.text).toContain("85%");
  });
});

// ── buildMetricsReport ────────────────────────────────────────────────

describe("buildMetricsReport", () => {
  it("includes project dir in heading", () => {
    const report = buildMetricsReport("/my/project", {
      loc: { available: false },
      coverage: { available: false },
      layers: { available: false },
      deadCode: { available: false },
      complexity: { available: false },
      mutation: { available: false },
    });
    expect(report).toContain("/my/project");
  });

  it("shows N/A badge for unavailable probes", () => {
    const report = buildMetricsReport("/my/project", {
      loc: { available: false },
      coverage: { available: false },
      layers: { available: false },
      deadCode: { available: false },
      complexity: { available: false },
      mutation: { available: false },
    });
    expect(report).toContain("⚪ N/A");
  });

  it("shows green badge for zero layer violations", () => {
    const report = buildMetricsReport("/my/project", {
      loc: { available: false },
      coverage: { available: false },
      layers: { available: true, data: { violations: 0, source: "internal", details: [] } },
      deadCode: { available: false },
      complexity: { available: false },
      mutation: { available: false },
    });
    expect(report).toContain("🟢");
  });

  it("shows red badge for layer violations > 0", () => {
    const report = buildMetricsReport("/my/project", {
      loc: { available: false },
      coverage: { available: false },
      layers: { available: true, data: { violations: 3, source: "internal", details: ["a", "b", "c"] } },
      deadCode: { available: false },
      complexity: { available: false },
      mutation: { available: false },
    });
    expect(report).toContain("🔴");
  });

  it("shows red badge for coverage below 75%", () => {
    const report = buildMetricsReport("/my/project", {
      loc: { available: false },
      coverage: { available: true, data: { lines: 60, statements: 60, functions: 60, branches: 60, reportPath: "" } },
      layers: { available: false },
      deadCode: { available: false },
      complexity: { available: false },
      mutation: { available: false },
    });
    expect(report).toContain("🔴");
  });
});
