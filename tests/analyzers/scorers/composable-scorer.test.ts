import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { scoreComposable } from "../../../src/analyzers/scorers/composable-scorer.js";

let dir: string;

beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "fc-comp-")); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

function mkDir(...parts: string[]) {
  mkdirSync(join(dir, ...parts), { recursive: true });
}

function mkFile(relPath: string, content = "") {
  const full = join(dir, relPath);
  mkdirSync(join(full, ".."), { recursive: true });
  writeFileSync(full, content);
}

const withInterface = ["src/shared/types/index.ts"];
const withoutInterface: string[] = [];

describe("score 0 — no layers", () => {
  it("returns score 0 when src is empty", () => {
    mkDir("src");
    const result = scoreComposable(dir, withoutInterface);
    expect(result.score).toBe(0);
    expect(result.property).toBe("composable");
  });
});

describe("score 1 — service layer only", () => {
  it("returns score 1 with src/services/", () => {
    mkDir("src", "services");
    const result = scoreComposable(dir, withoutInterface);
    expect(result.score).toBe(1);
    expect(result.evidence[0]).toMatch(/Service layer found/);
  });

  it("returns score 1 with src/tools/ (CLI pattern)", () => {
    mkDir("src", "tools");
    const result = scoreComposable(dir, withoutInterface);
    expect(result.score).toBe(1);
  });

  it("returns score 1 with src/handlers/", () => {
    mkDir("src", "handlers");
    const result = scoreComposable(dir, withoutInterface);
    expect(result.score).toBe(1);
  });
});

describe("score 2 — service + repository layers", () => {
  it("returns score 2 with src/services/ + src/repositories/", () => {
    mkDir("src", "services");
    mkDir("src", "repositories");
    const result = scoreComposable(dir, withoutInterface);
    expect(result.score).toBe(2);
    expect(result.evidence[0]).toMatch(/Service layer/);
    expect(result.evidence[1]).toMatch(/Repository layer/);
  });

  it("returns score 2 with src/tools/ + src/registry/ (MCP pattern)", () => {
    mkDir("src", "tools");
    mkDir("src", "registry");
    const result = scoreComposable(dir, withoutInterface);
    expect(result.score).toBe(2);
  });

  it("reports interface files in evidence when present", () => {
    mkDir("src", "services");
    mkDir("src", "repositories");
    const result = scoreComposable(dir, withInterface);
    expect(result.evidence[2]).toMatch(/Interface\/contract files detected/);
  });

  it("notes partial credit when no interface files", () => {
    mkDir("src", "services");
    mkDir("src", "repositories");
    const result = scoreComposable(dir, withoutInterface);
    expect(result.evidence[2]).toMatch(/partial credit/);
  });

  it("works without src/ — root-level services/", () => {
    mkDir("services");
    mkDir("repositories");
    const result = scoreComposable(dir, withoutInterface);
    expect(result.score).toBe(2);
  });
});

describe("interface detection — singular directory names", () => {
  it("detects interface/ (singular) as interface layer", () => {
    // Kills Regex: interfaces? → interfaces (singular 'interface/' would stop matching)
    mkDir("src", "services");
    mkDir("src", "repositories");
    const result = scoreComposable(dir, ["src/interface/IUserRepo.ts"]);
    expect(result.evidence[2]).toMatch(/Interface\/contract files detected/);
  });

  it("detects contract/ (singular) as interface layer", () => {
    // Kills Regex: contracts? → contracts
    mkDir("src", "services");
    mkDir("src", "repositories");
    const result = scoreComposable(dir, ["src/contract/UserContract.ts"]);
    expect(result.evidence[2]).toMatch(/Interface\/contract files detected/);
  });

  it("detects port/ (singular) as interface layer", () => {
    // Kills Regex: ports? → ports
    mkDir("src", "services");
    mkDir("src", "repositories");
    const result = scoreComposable(dir, ["src/port/UserPort.ts"]);
    expect(result.evidence[2]).toMatch(/Interface\/contract files detected/);
  });

  it("detects type/ (singular) as interface layer", () => {
    // Kills Regex: types? → types
    mkDir("src", "services");
    mkDir("src", "repositories");
    const result = scoreComposable(dir, ["src/type/UserType.ts"]);
    expect(result.evidence[2]).toMatch(/Interface\/contract files detected/);
  });

  it("non-source file matching interface dir does not count", () => {
    // Kills LogicalOperator L37: && → || (regex match alone would qualify)
    mkDir("src", "services");
    mkDir("src", "repositories");
    const result = scoreComposable(dir, ["src/interfaces/schema.json"]);
    expect(result.evidence[2]).toMatch(/partial credit/);
  });
});

describe("score 0 — evidence content", () => {
  it("evidence describes missing layers", () => {
    // Kills ArrayDeclaration L58: [] would produce empty evidence
    mkDir("src");
    const result = scoreComposable(dir, withoutInterface);
    expect(result.score).toBe(0);
    expect(result.evidence[0]).toMatch(/No service layer/);
    expect(result.evidence[1]).toMatch(/No repository layer/);
  });
});

describe("GitHub Action detection", () => {
  it("returns score 2 when action.yml is present", () => {
    mkFile("action.yml", "name: My Action\ninputs:\n  token:\n    required: true");
    const result = scoreComposable(dir, withoutInterface);
    expect(result.score).toBe(2);
    expect(result.evidence[0]).toMatch(/GitHub Action detected/);
  });

  it("returns score 2 when action.yaml is present", () => {
    mkFile("action.yaml", "name: My Action");
    const result = scoreComposable(dir, withoutInterface);
    expect(result.score).toBe(2);
    expect(result.evidence[0]).toMatch(/GitHub Action detected/);
  });

  it("GitHub Action evidence mentions action.yml interface contract", () => {
    mkFile("action.yml", "name: My Action");
    const result = scoreComposable(dir, withoutInterface);
    expect(result.evidence[0]).toMatch(/action\.yml/);
  });
});

describe("Library / CLI detection", () => {
  it("returns score 2 for library with shared/ directory and interface files", () => {
    mkDir("src", "shared");
    // types/ directory in path — matches hasInterfaces pattern
    const result = scoreComposable(dir, ["src/shared/types/index.ts"]);
    expect(result.score).toBe(2);
    expect(result.evidence[0]).toMatch(/Library\/CLI project/);
  });

  it("returns score 1 for library with src/index.ts but no interface files", () => {
    mkFile("src/index.ts", "export { foo } from './foo';");
    const result = scoreComposable(dir, withoutInterface);
    expect(result.score).toBe(1);
    expect(result.evidence[0]).toMatch(/Library\/CLI project/);
  });

  it("returns score 0 for web service with route files but no layers", () => {
    mkDir("src");
    const result = scoreComposable(dir, ["src/routes/users.ts"]);
    expect(result.score).toBe(0);
    expect(result.evidence[0]).toMatch(/No service layer/);
  });
});
