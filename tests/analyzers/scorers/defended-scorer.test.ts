import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { scoreDefended } from "../../../src/analyzers/scorers/defended-scorer.js";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "fc-def-"));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function mkGitHook() {
  const hooksDir = join(dir, ".git", "hooks");
  mkdirSync(hooksDir, { recursive: true });
  writeFileSync(join(hooksDir, "pre-commit"), "#!/bin/sh\nexit 0", "utf-8");
}

function mkHuskyHook() {
  const huskyDir = join(dir, ".husky");
  mkdirSync(huskyDir, { recursive: true });
  writeFileSync(
    join(huskyDir, "pre-commit"),
    "#!/bin/sh\nnpx lint-staged",
    "utf-8",
  );
}

function mkLintConfig(name = "eslint.config.js") {
  writeFileSync(join(dir, name), "export default []", "utf-8");
}

describe("score 0 — no hooks, no lint", () => {
  it("returns score 0 when directory is empty", () => {
    const result = scoreDefended(dir);
    expect(result.score).toBe(0);
    expect(result.property).toBe("defended");
    expect(result.evidence[0]).toMatch(/No pre-commit hook/);
  });
});

describe("score 1 — lint only", () => {
  it("returns score 1 with eslint.config.js", () => {
    mkLintConfig("eslint.config.js");
    const result = scoreDefended(dir);
    expect(result.score).toBe(1);
    expect(result.evidence[0]).toMatch(/Lint configuration present/);
    expect(result.evidence[1]).toMatch(/pre-commit hook/);
  });

  it.each([
    ".eslintrc.js",
    ".eslintrc.json",
    ".pylintrc",
    "pyproject.toml",
    "biome.json",
  ])("returns score 1 for lint config %s", (cfg) => {
    mkLintConfig(cfg);
    expect(scoreDefended(dir).score).toBe(1);
  });
});

describe("score 2 — pre-commit hook present", () => {
  it("returns score 2 with .git/hooks/pre-commit", () => {
    mkGitHook();
    const result = scoreDefended(dir);
    expect(result.score).toBe(2);
    expect(result.evidence[0]).toMatch(/pre-commit/);
  });

  it("returns score 2 with .husky/pre-commit", () => {
    mkHuskyHook();
    const result = scoreDefended(dir);
    expect(result.score).toBe(2);
    expect(result.evidence[0]).toMatch(/\.husky\/pre-commit/);
  });

  it("includes lint note when lint config also present", () => {
    mkGitHook();
    mkLintConfig();
    const result = scoreDefended(dir);
    expect(result.score).toBe(2);
    expect(result.evidence[1]).toMatch(/Lint configuration present/);
  });

  it("notes missing lint when no lint config", () => {
    mkGitHook();
    const result = scoreDefended(dir);
    expect(result.score).toBe(2);
    expect(result.evidence[1]).toMatch(/No lint config/);
  });
});
