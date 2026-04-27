/**
 * Tests for the setup_monitoring tool — scaffoldEyeConfig and setupMonitoringHandler.
 *
 * Tests cover: eye-config.yaml generation, idempotency, spec file creation,
 * stale URL removed, and correct install instructions in output.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  scaffoldEyeConfig,
  setupMonitoringHandler,
} from "../../src/tools/setup-monitoring.js";

function makeTempDir(): string {
  const dir = join(tmpdir(), `forgecraft-monitoring-test-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

describe("scaffoldEyeConfig", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = makeTempDir();
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("creates .forgecraft/eye-config.yaml when absent", () => {
    const created = scaffoldEyeConfig(tempDir, "MyProject");
    expect(created).toBe(true);
    expect(existsSync(join(tempDir, ".forgecraft", "eye-config.yaml"))).toBe(
      true,
    );
  });

  it("returns false without writing when config already exists", () => {
    scaffoldEyeConfig(tempDir, "MyProject");
    const secondCall = scaffoldEyeConfig(tempDir, "MyProject");
    expect(secondCall).toBe(false);
  });

  it("config contains required fields", () => {
    scaffoldEyeConfig(tempDir, "MyApp");
    const raw = readFileSync(
      join(tempDir, ".forgecraft", "eye-config.yaml"),
      "utf-8",
    );
    expect(raw).toContain("project_name:");
    expect(raw).toContain("monitoring_spec_path:");
    expect(raw).toContain("signal_queue_path:");
    expect(raw).toContain("log_adapter:");
    expect(raw).toContain("environment:");
  });

  it("config uses stdin as default log adapter", () => {
    scaffoldEyeConfig(tempDir, "MyApp");
    const raw = readFileSync(
      join(tempDir, ".forgecraft", "eye-config.yaml"),
      "utf-8",
    );
    expect(raw).toMatch(/log_adapter:\s*stdin/);
  });

  it("config includes forgecraft-eye GitHub URL", () => {
    scaffoldEyeConfig(tempDir, "MyApp");
    const raw = readFileSync(
      join(tempDir, ".forgecraft", "eye-config.yaml"),
      "utf-8",
    );
    expect(raw).toContain("https://github.com/jghiringhelli/forgecraft-eye");
  });

  it("config slugifies project name in CloudWatch log group comment", () => {
    scaffoldEyeConfig(tempDir, "My Cool App");
    const raw = readFileSync(
      join(tempDir, ".forgecraft", "eye-config.yaml"),
      "utf-8",
    );
    expect(raw).toContain("/aws/lambda/my-cool-app");
  });
});

describe("setupMonitoringHandler", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = makeTempDir();
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("generates monitoring-spec.md", async () => {
    await setupMonitoringHandler({ project_dir: tempDir });
    expect(existsSync(join(tempDir, "docs", "monitoring-spec.md"))).toBe(true);
  });

  it("generates eye-config.yaml alongside the spec", async () => {
    await setupMonitoringHandler({ project_dir: tempDir });
    expect(existsSync(join(tempDir, ".forgecraft", "eye-config.yaml"))).toBe(
      true,
    );
  });

  it("reports eye-config.yaml creation in output", async () => {
    const result = await setupMonitoringHandler({ project_dir: tempDir });
    const text = result.content[0]!.text;
    expect(text).toContain("eye-config.yaml");
  });

  it("does not mention the stale forgeworkshop.dev URL", async () => {
    const result = await setupMonitoringHandler({ project_dir: tempDir });
    const text = result.content[0]!.text;
    expect(text).not.toContain("forgeworkshop.dev");
  });

  it("output includes npm install forgecraft-eye", async () => {
    const result = await setupMonitoringHandler({ project_dir: tempDir });
    const text = result.content[0]!.text;
    expect(text).toContain("npm install forgecraft-eye");
  });

  it("output includes npmjs.com package link", async () => {
    const result = await setupMonitoringHandler({ project_dir: tempDir });
    const text = result.content[0]!.text;
    expect(text).toContain("npmjs.com/package/forgecraft-eye");
  });

  it("output includes GitHub source link", async () => {
    const result = await setupMonitoringHandler({ project_dir: tempDir });
    const text = result.content[0]!.text;
    expect(text).toContain("https://github.com/jghiringhelli/forgecraft-eye");
  });

  it("returns early message when spec already exists and force is false", async () => {
    await setupMonitoringHandler({ project_dir: tempDir });
    const result = await setupMonitoringHandler({ project_dir: tempDir });
    const text = result.content[0]!.text;
    expect(text).toContain("Already Exists");
  });

  it("overwrites when force is true", async () => {
    await setupMonitoringHandler({ project_dir: tempDir });
    const result = await setupMonitoringHandler({
      project_dir: tempDir,
      force: true,
    });
    const text = result.content[0]!.text;
    expect(text).toContain("Monitoring Spec Generated");
  });
});
