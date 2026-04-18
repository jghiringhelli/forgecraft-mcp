/**
 * Tests for src/tools/generate-env-probe.ts
 */

import { describe, it, expect, afterEach } from "vitest";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
  existsSync,
  readFileSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { generateEnvProbeHandler } from "../../src/tools/generate-env-probe.js";

// ── Helpers ───────────────────────────────────────────────────────────

function makeTempDir(): string {
  return mkdtempSync(join(tmpdir(), "fc-gen-env-probe-"));
}

function write(dir: string, relPath: string, content: string): void {
  const parts = relPath.split("/");
  if (parts.length > 1) {
    mkdirSync(join(dir, ...parts.slice(0, -1)), { recursive: true });
  }
  writeFileSync(join(dir, relPath), content, "utf-8");
}

// ── Spec fixtures ─────────────────────────────────────────────────────

const HEALTH_CHECK_SPEC = `service: api-server
title: API Server Environment
probes:
  - id: probe-health
    type: health_check
    description: HTTP health endpoint responds 200
    url: "http://localhost:8080/health"
`;

const ENV_VAR_SPEC = `service: api-server
title: API Server Environment
probes:
  - id: probe-env-vars
    type: env_var
    description: Required env vars are set
    vars: [DATABASE_URL, JWT_SECRET, PORT]
`;

const PORT_CHECK_SPEC = `service: api-server
title: API Server Environment
probes:
  - id: probe-db-port
    type: port_check
    description: Database port is reachable
    host: "localhost"
    port: 5432
`;

const MULTI_PROBE_SPEC = `service: api-server
title: API Server Environment
probes:
  - id: probe-health
    type: health_check
    description: HTTP health endpoint responds 200
    url: "http://localhost:8080/health"
  - id: probe-env-vars
    type: env_var
    description: Required env vars are set
    vars: [DATABASE_URL, JWT_SECRET]
  - id: probe-db-port
    type: port_check
    description: Database port is reachable
    host: "localhost"
    port: 5432
`;

let tempDir: string;

afterEach(() => {
  if (tempDir && existsSync(tempDir)) {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

// ── generateEnvProbeHandler ───────────────────────────────────────────

describe("generateEnvProbeHandler", () => {
  it("returns a ToolResult with text content when no .forgecraft/env/ dir exists", async () => {
    tempDir = makeTempDir();
    const result = await generateEnvProbeHandler({ project_dir: tempDir });
    expect(result.content).toHaveLength(1);
    expect(result.content[0]!.type).toBe("text");
    expect(typeof result.content[0]!.text).toBe("string");
  });

  it("reports 'no env probe specs' when .forgecraft/env/ is absent", async () => {
    tempDir = makeTempDir();
    const result = await generateEnvProbeHandler({ project_dir: tempDir });
    const text = result.content[0]!.text;
    expect(text).toContain("No env probe specs found");
  });

  it("generates a .health.sh probe file for a health_check spec", async () => {
    tempDir = makeTempDir();
    write(tempDir, ".forgecraft/env/api-server.yaml", HEALTH_CHECK_SPEC);

    const result = await generateEnvProbeHandler({ project_dir: tempDir });
    const text = result.content[0]!.text;

    expect(text).toContain("Generated: 1");
    const probePath = join(
      tempDir,
      "tests",
      "env",
      "api-server-probe-health.health.sh",
    );
    expect(existsSync(probePath)).toBe(true);
  });

  it("generates a .env.sh probe file for an env_var spec", async () => {
    tempDir = makeTempDir();
    write(tempDir, ".forgecraft/env/api-server.yaml", ENV_VAR_SPEC);

    const result = await generateEnvProbeHandler({ project_dir: tempDir });
    const text = result.content[0]!.text;

    expect(text).toContain("Generated: 1");
    const probePath = join(
      tempDir,
      "tests",
      "env",
      "api-server-probe-env-vars.env.sh",
    );
    expect(existsSync(probePath)).toBe(true);
  });

  it("generates a .port.sh probe file for a port_check spec", async () => {
    tempDir = makeTempDir();
    write(tempDir, ".forgecraft/env/api-server.yaml", PORT_CHECK_SPEC);

    const result = await generateEnvProbeHandler({ project_dir: tempDir });
    const text = result.content[0]!.text;

    expect(text).toContain("Generated: 1");
    const probePath = join(
      tempDir,
      "tests",
      "env",
      "api-server-probe-db-port.port.sh",
    );
    expect(existsSync(probePath)).toBe(true);
  });

  it("skips existing probe files when force=false (default)", async () => {
    tempDir = makeTempDir();
    write(tempDir, ".forgecraft/env/api-server.yaml", HEALTH_CHECK_SPEC);

    // First generation
    await generateEnvProbeHandler({ project_dir: tempDir });

    // Overwrite with sentinel
    const probePath = join(
      tempDir,
      "tests",
      "env",
      "api-server-probe-health.health.sh",
    );
    writeFileSync(probePath, "# EXISTING CONTENT", "utf-8");

    // Second run without force
    await generateEnvProbeHandler({ project_dir: tempDir });
    const content = readFileSync(probePath, "utf-8");
    expect(content).toBe("# EXISTING CONTENT");
  });

  it("overwrites existing probe files when force=true", async () => {
    tempDir = makeTempDir();
    write(tempDir, ".forgecraft/env/api-server.yaml", HEALTH_CHECK_SPEC);

    // Pre-create file with sentinel
    mkdirSync(join(tempDir, "tests", "env"), { recursive: true });
    const probePath = join(
      tempDir,
      "tests",
      "env",
      "api-server-probe-health.health.sh",
    );
    writeFileSync(probePath, "# OLD CONTENT", "utf-8");

    const result = await generateEnvProbeHandler({
      project_dir: tempDir,
      force: true,
    });
    const text = result.content[0]!.text;
    expect(text).toContain("Generated: 1");

    const content = readFileSync(probePath, "utf-8");
    expect(content).not.toBe("# OLD CONTENT");
    expect(content).toContain("probe-health");
  });

  it("creates tests/env/ directory when absent", async () => {
    tempDir = makeTempDir();
    write(tempDir, ".forgecraft/env/api-server.yaml", HEALTH_CHECK_SPEC);

    expect(existsSync(join(tempDir, "tests", "env"))).toBe(false);
    await generateEnvProbeHandler({ project_dir: tempDir });
    expect(existsSync(join(tempDir, "tests", "env"))).toBe(true);
  });

  it("report contains Generated count and file names", async () => {
    tempDir = makeTempDir();
    write(tempDir, ".forgecraft/env/api-server.yaml", HEALTH_CHECK_SPEC);

    const result = await generateEnvProbeHandler({ project_dir: tempDir });
    const text = result.content[0]!.text;

    expect(text).toContain("Generated: 1");
    expect(text).toContain("api-server-probe-health.health.sh");
  });

  it("generated .sh files have correct shebang and header comment", async () => {
    tempDir = makeTempDir();
    write(tempDir, ".forgecraft/env/api-server.yaml", HEALTH_CHECK_SPEC);

    await generateEnvProbeHandler({ project_dir: tempDir });

    const content = readFileSync(
      join(tempDir, "tests", "env", "api-server-probe-health.health.sh"),
      "utf-8",
    );
    expect(content).toContain("#!/usr/bin/env bash");
    expect(content).toContain("set -euo pipefail");
    expect(content).toContain("# Service: api-server");
    expect(content).toContain("# Probe: probe-health");
    expect(content).toContain("# Type: health_check");
  });

  it("handles spec with multiple probes (generates one file per probe)", async () => {
    tempDir = makeTempDir();
    write(tempDir, ".forgecraft/env/api-server.yaml", MULTI_PROBE_SPEC);

    const result = await generateEnvProbeHandler({ project_dir: tempDir });
    const text = result.content[0]!.text;

    expect(text).toContain("Generated: 3");
    expect(
      existsSync(
        join(tempDir, "tests", "env", "api-server-probe-health.health.sh"),
      ),
    ).toBe(true);
    expect(
      existsSync(
        join(tempDir, "tests", "env", "api-server-probe-env-vars.env.sh"),
      ),
    ).toBe(true);
    expect(
      existsSync(
        join(tempDir, "tests", "env", "api-server-probe-db-port.port.sh"),
      ),
    ).toBe(true);
  });

  it("report includes Skipped count for already-existing files", async () => {
    tempDir = makeTempDir();
    write(tempDir, ".forgecraft/env/api-server.yaml", HEALTH_CHECK_SPEC);

    // Generate first time
    await generateEnvProbeHandler({ project_dir: tempDir });

    // Second run without force
    const result = await generateEnvProbeHandler({ project_dir: tempDir });
    const text = result.content[0]!.text;
    expect(text).toContain("Skipped: 1");
  });

  it("generates env_var probe with env var names in content", async () => {
    tempDir = makeTempDir();
    write(tempDir, ".forgecraft/env/api-server.yaml", ENV_VAR_SPEC);

    await generateEnvProbeHandler({ project_dir: tempDir });

    const content = readFileSync(
      join(tempDir, "tests", "env", "api-server-probe-env-vars.env.sh"),
      "utf-8",
    );
    expect(content).toContain("DATABASE_URL");
    expect(content).toContain("JWT_SECRET");
    expect(content).toContain("PORT");
  });

  it("generates port_check probe with host and port", async () => {
    tempDir = makeTempDir();
    write(tempDir, ".forgecraft/env/api-server.yaml", PORT_CHECK_SPEC);

    await generateEnvProbeHandler({ project_dir: tempDir });

    const content = readFileSync(
      join(tempDir, "tests", "env", "api-server-probe-db-port.port.sh"),
      "utf-8",
    );
    expect(content).toContain("5432");
    expect(content).toContain("localhost");
  });

  it("report has To run: call run_env_probe footer", async () => {
    tempDir = makeTempDir();
    write(tempDir, ".forgecraft/env/api-server.yaml", HEALTH_CHECK_SPEC);

    const result = await generateEnvProbeHandler({ project_dir: tempDir });
    expect(result.content[0]!.text).toContain("run_env_probe");
  });
});
