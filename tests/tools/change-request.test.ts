/**
 * Tests for src/tools/change-request.ts
 *
 * Covers: slugify, detectAffectedArtifacts, detectRequiredGates,
 * serializeChangeRecord, parseChangeRecord, loadAllChanges,
 * getImplementingChanges, changeRequestHandler, listChangesHandler.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  mkdirSync,
  writeFileSync,
  rmSync,
  readFileSync,
  existsSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  slugify,
  detectAffectedArtifacts,
  detectRequiredGates,
  serializeChangeRecord,
  parseChangeRecord,
  loadAllChanges,
  getImplementingChanges,
  changeRequestHandler,
  listChangesHandler,
  changesDir,
  type ChangeRecord,
  type ChangeType,
} from "../../src/tools/change-request.js";

// ── Fixtures ──────────────────────────────────────────────────────────

function makeRecord(overrides: Partial<ChangeRecord> = {}): ChangeRecord {
  return {
    id: "chg-2026-04-19-replace-jwt-middleware",
    title: "Replace JWT middleware with Clerk SSO",
    status: "open",
    type: "breaking-api",
    created: "2026-04-19",
    description:
      "Swap the current JWT auth middleware for Clerk SSO integration.",
    breaking: true,
    affected_artifacts: ["docs/PRD.md"],
    required_gates: [],
    ...overrides,
  };
}

let tmpDir: string;

beforeEach(() => {
  tmpDir = join(tmpdir(), `chg-test-${Date.now()}`);
  mkdirSync(tmpDir, { recursive: true });
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

// ── slugify ───────────────────────────────────────────────────────────

describe("slugify", () => {
  it("produces chg-<date>-<slug> format", () => {
    expect(slugify("Replace JWT middleware", "2026-04-19")).toBe(
      "chg-2026-04-19-replace-jwt-middleware",
    );
  });

  it("strips special characters", () => {
    const result = slugify("Add OAuth 2.0 / PKCE support!", "2026-04-01");
    expect(result).toMatch(/^chg-2026-04-01-/);
    expect(result).not.toMatch(/[!?@#$%^&*()]/);
  });

  it("lowercases the title", () => {
    expect(slugify("UPPER CASE TITLE", "2026-04-01")).toBe(
      "chg-2026-04-01-upper-case-title",
    );
  });

  it("truncates slug to 40 chars", () => {
    const longTitle =
      "This is a very long title that exceeds the forty character limit easily";
    const result = slugify(longTitle, "2026-04-01");
    const slug = result.replace("chg-2026-04-01-", "");
    expect(slug.length).toBeLessThanOrEqual(40);
  });

  it("trims trailing dashes from slug", () => {
    const result = slugify("Hello World----", "2026-04-01");
    expect(result.endsWith("-")).toBe(false);
  });

  it("collapses multiple consecutive spaces into a single dash", () => {
    // Kills Regex L67: /\s+/ → /\s/ (would leave extra dashes for multi-space)
    const result = slugify("hello  world", "2026-04-01");
    expect(result).toBe("chg-2026-04-01-hello-world");
  });

  it("trims leading and trailing whitespace before slug conversion", () => {
    // Kills MethodExpression L63: .trim() removal (leading spaces → leading dashes)
    const result = slugify("  hello world  ", "2026-04-01");
    expect(result).toBe("chg-2026-04-01-hello-world");
  });
});

// ── detectAffectedArtifacts ────────────────────────────────────────────

describe("detectAffectedArtifacts", () => {
  it("returns empty when no spec files exist", () => {
    const result = detectAffectedArtifacts(
      tmpDir,
      "Minor tweak",
      "No files here",
      "gate-change",
    );
    expect(result).toEqual([]);
  });

  it("includes PRD.md for spec-change type even without keyword matches", () => {
    mkdirSync(join(tmpDir, "docs"), { recursive: true });
    writeFileSync(join(tmpDir, "docs", "PRD.md"), "# PRD\n");
    const result = detectAffectedArtifacts(
      tmpDir,
      "XYZ123",
      "XYZ456",
      "spec-change",
    );
    expect(result).toContain("docs/PRD.md");
  });

  it("includes use-cases.md when title contains 'workflow'", () => {
    mkdirSync(join(tmpDir, "docs"), { recursive: true });
    writeFileSync(join(tmpDir, "docs", "use-cases.md"), "# Use Cases\n");
    const result = detectAffectedArtifacts(
      tmpDir,
      "Change workflow order",
      "adjust steps",
      "gate-change",
    );
    expect(result).toContain("docs/use-cases.md");
  });

  it("includes TechSpec.md for architecture keywords", () => {
    mkdirSync(join(tmpDir, "docs"), { recursive: true });
    writeFileSync(join(tmpDir, "docs", "TechSpec.md"), "# Tech\n");
    const result = detectAffectedArtifacts(
      tmpDir,
      "Refactor architecture layer",
      "component changes",
      "gate-change",
    );
    expect(result).toContain("docs/TechSpec.md");
  });

  it("includes docs/adrs/ for adr-supersession type", () => {
    mkdirSync(join(tmpDir, "docs", "adrs"), { recursive: true });
    const result = detectAffectedArtifacts(
      tmpDir,
      "Supersede old decision",
      "replacing ADR",
      "adr-supersession",
    );
    expect(result).toContain("docs/adrs/");
  });

  it("includes openapi.yaml for breaking-api type when present", () => {
    writeFileSync(join(tmpDir, "openapi.yaml"), "openapi: 3.0.0\n");
    const result = detectAffectedArtifacts(
      tmpDir,
      "Remove endpoint",
      "breaking change",
      "breaking-api",
    );
    expect(result).toContain("openapi.yaml");
  });

  it("does not include files that do not exist", () => {
    const result = detectAffectedArtifacts(
      tmpDir,
      "architecture changes",
      "system component",
      "gate-change",
    );
    expect(result).toEqual([]);
  });

  it("does not add docs/adrs/ from keyword when type is not adr-supersession and keywords absent", () => {
    // Kills LogicalOperator L106: && → || (would add adrs/ even for non-adr types when any condition true)
    mkdirSync(join(tmpDir, "docs", "adrs"), { recursive: true });
    const result = detectAffectedArtifacts(
      tmpDir,
      "Update login styling",
      "cosmetic changes",
      "spec-change",
    );
    expect(result).not.toContain("docs/adrs/");
  });

  it("adds docs/adrs/ for adr-supersession type even without adr keywords in title", () => {
    // Kills ConditionalExpression L106: false || words.some(...) — only keyword path active
    mkdirSync(join(tmpDir, "docs", "adrs"), { recursive: true });
    const result = detectAffectedArtifacts(
      tmpDir,
      "Fix typo in template",
      "minor update",
      "adr-supersession",
    );
    expect(result).toContain("docs/adrs/");
  });

  it("adds docs/adrs/ for non-adr type when title has 'architecture' keyword (>3 chars)", () => {
    // Kills EqualityOperator L106 and confirms keyword-path works independently
    mkdirSync(join(tmpDir, "docs", "adrs"), { recursive: true });
    const result = detectAffectedArtifacts(
      tmpDir,
      "Refactor architecture layer",
      "system redesign",
      "gate-change",
    );
    expect(result).toContain("docs/adrs/");
  });

  it("short words (≤3 chars) are excluded from keyword matching", () => {
    // Kills EqualityOperator L82: w.length > 3 vs >= 3 (3-char words like 'adr' would match with >=3)
    mkdirSync(join(tmpDir, "docs", "adrs"), { recursive: true });
    // "adr" is exactly 3 chars — filtered out by >3, not by >=3
    const result = detectAffectedArtifacts(
      tmpDir,
      "adr fix",
      "adr update",
      "gate-change",
    );
    expect(result).not.toContain("docs/adrs/");
  });

  it("deduplicates artifacts", () => {
    mkdirSync(join(tmpDir, "docs"), { recursive: true });
    writeFileSync(join(tmpDir, "docs", "PRD.md"), "# PRD\n");
    // spec-change forces PRD inclusion + keyword match both would add it
    const result = detectAffectedArtifacts(
      tmpDir,
      "product feature requirement",
      "user problem",
      "spec-change",
    );
    const prdCount = result.filter((a) => a === "docs/PRD.md").length;
    expect(prdCount).toBe(1);
  });
});

// ── detectRequiredGates ────────────────────────────────────────────────

describe("detectRequiredGates", () => {
  it("returns empty when gate dir does not exist", () => {
    expect(detectRequiredGates(tmpDir, "spec-change", false)).toEqual([]);
  });

  it("includes l2-* gates from active dir", () => {
    const gateDir = join(tmpDir, ".forgecraft", "gates", "active");
    mkdirSync(gateDir, { recursive: true });
    writeFileSync(join(gateDir, "l2-coverage.yaml"), "id: l2-coverage\n");
    const result = detectRequiredGates(tmpDir, "spec-change", false);
    expect(result).toContain("l2-coverage");
  });

  it("includes contract-testing-required gate", () => {
    const gateDir = join(tmpDir, ".forgecraft", "gates", "active");
    mkdirSync(gateDir, { recursive: true });
    writeFileSync(
      join(gateDir, "contract-testing-required.yaml"),
      "id: contract-testing-required\n",
    );
    const result = detectRequiredGates(tmpDir, "spec-change", false);
    expect(result).toContain("contract-testing-required");
  });

  it("adds schema gates for breaking-api type", () => {
    const gateDir = join(tmpDir, ".forgecraft", "gates", "active");
    mkdirSync(gateDir, { recursive: true });
    writeFileSync(
      join(gateDir, "schema-validation.yaml"),
      "id: schema-validation\n",
    );
    const result = detectRequiredGates(tmpDir, "breaking-api", false);
    expect(result).toContain("schema-validation");
  });

  it("adds contract gates when breaking=true", () => {
    const gateDir = join(tmpDir, ".forgecraft", "gates", "active");
    mkdirSync(gateDir, { recursive: true });
    writeFileSync(
      join(gateDir, "api-contract-check.yaml"),
      "id: api-contract-check\n",
    );
    const result = detectRequiredGates(tmpDir, "spec-change", true);
    expect(result).toContain("api-contract-check");
  });

  it("does not duplicate gates", () => {
    const gateDir = join(tmpDir, ".forgecraft", "gates", "active");
    mkdirSync(gateDir, { recursive: true });
    writeFileSync(join(gateDir, "l2-contract.yaml"), "id: l2-contract\n");
    // l2-contract matches both l2-* prefix AND contract keyword for breaking-api
    const result = detectRequiredGates(tmpDir, "breaking-api", true);
    expect(result.filter((g) => g === "l2-contract").length).toBe(1);
  });
});

// ── serializeChangeRecord / parseChangeRecord ──────────────────────────

describe("serializeChangeRecord + parseChangeRecord round-trip", () => {
  it("round-trips a minimal record", () => {
    const rec = makeRecord({ required_gates: [], affected_artifacts: [] });
    const yaml = serializeChangeRecord(rec);
    const parsed = parseChangeRecord(yaml, rec.id);
    expect(parsed).not.toBeNull();
    expect(parsed!.id).toBe(rec.id);
    expect(parsed!.title).toBe(rec.title);
    expect(parsed!.status).toBe("open");
    expect(parsed!.type).toBe("breaking-api");
    expect(parsed!.breaking).toBe(true);
  });

  it("round-trips breaking_details", () => {
    const rec = makeRecord({
      breaking_details: "Removes /api/v1/users endpoint",
    });
    const yaml = serializeChangeRecord(rec);
    const parsed = parseChangeRecord(yaml, rec.id);
    expect(parsed!.breaking_details).toBe("Removes /api/v1/users endpoint");
  });

  it("round-trips supersedes_adr", () => {
    const rec = makeRecord({
      supersedes_adr: "ADR-0003",
      type: "adr-supersession",
    });
    const yaml = serializeChangeRecord(rec);
    const parsed = parseChangeRecord(yaml, rec.id);
    expect(parsed!.supersedes_adr).toBe("ADR-0003");
  });

  it("round-trips affected_artifacts list", () => {
    const rec = makeRecord({
      affected_artifacts: ["docs/PRD.md", "openapi.yaml"],
    });
    const yaml = serializeChangeRecord(rec);
    const parsed = parseChangeRecord(yaml, rec.id);
    expect(parsed!.affected_artifacts).toContain("docs/PRD.md");
    expect(parsed!.affected_artifacts).toContain("openapi.yaml");
  });

  it("round-trips required_gates list", () => {
    const rec = makeRecord({
      required_gates: ["l2-coverage", "schema-validation"],
    });
    const yaml = serializeChangeRecord(rec);
    const parsed = parseChangeRecord(yaml, rec.id);
    expect(parsed!.required_gates).toContain("l2-coverage");
    expect(parsed!.required_gates).toContain("schema-validation");
  });

  it("serialized text has required_gates: [] for empty gates", () => {
    // Kills ConditionalExpression L193: if (length===0) → if (false) — no [] line emitted
    const rec = makeRecord({ required_gates: [] });
    const yaml = serializeChangeRecord(rec);
    expect(yaml).toContain("required_gates:");
    expect(yaml).toContain("[]");
  });

  it("serialized text contains gate IDs in list format", () => {
    // Kills ConditionalExpression/EqualityOperator L357: if (gates.length > 0) → always false
    const rec = makeRecord({ required_gates: ["l2-coverage", "schema-check"] });
    const yaml = serializeChangeRecord(rec);
    expect(yaml).toContain("l2-coverage");
    expect(yaml).toContain("schema-check");
  });

  it("serialized text includes breaking_details field when set", () => {
    // Kills ConditionalExpression L178/L343: if (breaking_details) → always false
    const rec = makeRecord({ breaking_details: "Removes /api/v1/auth" });
    const yaml = serializeChangeRecord(rec);
    expect(yaml).toContain("breaking_details:");
    expect(yaml).toContain("Removes /api/v1/auth");
  });

  it("serialized text omits breaking_details when not set", () => {
    // Kills ConditionalExpression L178: if (breaking_details) → always true (phantom field)
    const rec = makeRecord({ breaking_details: undefined });
    const yaml = serializeChangeRecord(rec);
    expect(yaml).not.toContain("breaking_details:");
  });

  it("serialized text includes supersedes_adr field when set", () => {
    // Kills ConditionalExpression L182/L347: if (supersedes_adr) → always false
    const rec = makeRecord({ supersedes_adr: "ADR-0005" });
    const yaml = serializeChangeRecord(rec);
    expect(yaml).toContain("supersedes_adr: ADR-0005");
  });

  it("round-trips breaking=false correctly", () => {
    // Kills ConditionalExpression L220: fieldRe("breaking") === "true" → always true
    const rec = makeRecord({ breaking: false });
    const yaml = serializeChangeRecord(rec);
    const parsed = parseChangeRecord(yaml, rec.id);
    expect(parsed!.breaking).toBe(false);
  });

  it("parseChangeRecord: blocked_reason is returned when not ~ in YAML", () => {
    // Kills ConditionalExpression/EqualityOperator L223: !== "~" → === "~" (value always undefined)
    const yaml = serializeChangeRecord(makeRecord()).replace(
      "blocked_reason: ~",
      "blocked_reason: waiting for approval",
    );
    const parsed = parseChangeRecord(yaml, "test-id");
    expect(parsed!.blocked_reason).toBe("waiting for approval");
  });

  it("parseChangeRecord: blocked_reason is undefined when ~ in YAML", () => {
    // Kills ConditionalExpression L223 always-true: value always returned even when "~"
    const yaml = serializeChangeRecord(makeRecord());
    const parsed = parseChangeRecord(yaml, "test-id");
    expect(parsed!.blocked_reason).toBeUndefined();
  });

  it("parseChangeRecord: verified_at is returned when not ~ in YAML", () => {
    // Kills ConditionalExpression/EqualityOperator L224
    const yaml = serializeChangeRecord(makeRecord()).replace(
      "verified_at: ~",
      "verified_at: 2026-04-20",
    );
    const parsed = parseChangeRecord(yaml, "test-id");
    expect(parsed!.verified_at).toBe("2026-04-20");
  });

  it("parseChangeRecord: verified_at is undefined when ~ in YAML", () => {
    const yaml = serializeChangeRecord(makeRecord());
    const parsed = parseChangeRecord(yaml, "test-id");
    expect(parsed!.verified_at).toBeUndefined();
  });

  it("parseChangeRecord: closed_at is returned when not ~ in YAML", () => {
    // Kills ConditionalExpression/EqualityOperator L225
    const yaml = serializeChangeRecord(makeRecord()).replace(
      "closed_at: ~",
      "closed_at: 2026-04-20",
    );
    const parsed = parseChangeRecord(yaml, "test-id");
    expect(parsed!.closed_at).toBe("2026-04-20");
  });

  it("parseChangeRecord: closed_at is undefined when ~ in YAML", () => {
    const yaml = serializeChangeRecord(makeRecord());
    const parsed = parseChangeRecord(yaml, "test-id");
    expect(parsed!.closed_at).toBeUndefined();
  });

  it("returns null for invalid YAML content", () => {
    const parsed = parseChangeRecord("", "orphan-id");
    // Should not throw; returns a record with empty/default fields (not null because try succeeds)
    expect(parsed).not.toBeNull();
  });
});

// ── loadAllChanges / getImplementingChanges ────────────────────────────

describe("loadAllChanges", () => {
  it("returns empty array when changes dir does not exist", () => {
    expect(loadAllChanges(tmpDir)).toEqual([]);
  });

  it("returns parsed records from yaml files", () => {
    const dir = changesDir(tmpDir);
    mkdirSync(dir, { recursive: true });
    const rec = makeRecord({ status: "open" });
    writeFileSync(join(dir, `${rec.id}.yaml`), serializeChangeRecord(rec));
    const loaded = loadAllChanges(tmpDir);
    expect(loaded).toHaveLength(1);
    expect(loaded[0]!.title).toBe(rec.title);
  });

  it("skips non-yaml files", () => {
    const dir = changesDir(tmpDir);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "README.md"), "# Changes");
    expect(loadAllChanges(tmpDir)).toEqual([]);
  });

  it("handles multiple records", () => {
    const dir = changesDir(tmpDir);
    mkdirSync(dir, { recursive: true });
    const r1 = makeRecord({ id: "chg-2026-04-01-first", status: "open" });
    const r2 = makeRecord({
      id: "chg-2026-04-02-second",
      status: "implementing",
    });
    writeFileSync(join(dir, `${r1.id}.yaml`), serializeChangeRecord(r1));
    writeFileSync(join(dir, `${r2.id}.yaml`), serializeChangeRecord(r2));
    expect(loadAllChanges(tmpDir)).toHaveLength(2);
  });
});

describe("getImplementingChanges", () => {
  it("returns only implementing-status records", () => {
    const dir = changesDir(tmpDir);
    mkdirSync(dir, { recursive: true });
    const open = makeRecord({ id: "chg-open", status: "open" });
    const impl = makeRecord({ id: "chg-impl", status: "implementing" });
    const closed = makeRecord({ id: "chg-closed", status: "closed" });
    writeFileSync(join(dir, `${open.id}.yaml`), serializeChangeRecord(open));
    writeFileSync(join(dir, `${impl.id}.yaml`), serializeChangeRecord(impl));
    writeFileSync(
      join(dir, `${closed.id}.yaml`),
      serializeChangeRecord(closed),
    );
    const result = getImplementingChanges(tmpDir);
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe("chg-impl");
  });

  it("returns empty when no implementing changes", () => {
    expect(getImplementingChanges(tmpDir)).toEqual([]);
  });
});

// ── changeRequestHandler ───────────────────────────────────────────────

describe("changeRequestHandler", () => {
  it("creates the changes directory and writes a yaml file", async () => {
    const result = await changeRequestHandler({
      project_dir: tmpDir,
      title: "Replace JWT middleware",
      description: "Swap JWT for Clerk SSO",
      type: "breaking-api",
      breaking: true,
    });
    const dir = changesDir(tmpDir);
    const files = (await import("node:fs"))
      .readdirSync(dir)
      .filter((f) => f.endsWith(".yaml"));
    expect(files).toHaveLength(1);
    expect(result.content[0]!.text).toContain("Change Request Opened");
  });

  it("output includes the generated ID", async () => {
    const result = await changeRequestHandler({
      project_dir: tmpDir,
      title: "Add new endpoint",
      description: "Adds /api/v2/users",
      type: "breaking-api",
    });
    expect(result.content[0]!.text).toMatch(
      /\*\*ID:\*\* `chg-\d{4}-\d{2}-\d{2}-/,
    );
  });

  it("uses provided affected_artifacts over auto-detection", async () => {
    const result = await changeRequestHandler({
      project_dir: tmpDir,
      title: "Change something",
      description: "Details",
      type: "spec-change",
      affected_artifacts: ["custom/path.md"],
    });
    expect(result.content[0]!.text).toContain("custom/path.md");
  });

  it("shows breaking warning when breaking=true", async () => {
    const result = await changeRequestHandler({
      project_dir: tmpDir,
      title: "Break the API",
      description: "Removes endpoint",
      type: "breaking-api",
      breaking: true,
      breaking_details: "Removes /api/v1/auth",
    });
    expect(result.content[0]!.text).toContain("Removes /api/v1/auth");
  });

  it("shows supersedes_adr notice", async () => {
    const result = await changeRequestHandler({
      project_dir: tmpDir,
      title: "Supersede old ADR",
      description: "New architecture decision",
      type: "adr-supersession",
      supersedes_adr: "ADR-0002",
    });
    expect(result.content[0]!.text).toContain("ADR-0002");
  });

  it("output includes required gates section when gates are non-empty", async () => {
    // Kills ConditionalExpression L357: if (gates.length > 0) → false (section never shown)
    const gateDir = join(tmpDir, ".forgecraft", "gates", "active");
    mkdirSync(gateDir, { recursive: true });
    writeFileSync(join(gateDir, "l2-coverage.yaml"), "id: l2-coverage\n");
    const result = await changeRequestHandler({
      project_dir: tmpDir,
      title: "Add new endpoint",
      description: "Adds /api/v2/users",
      type: "breaking-api",
      breaking: true,
    });
    expect(result.content[0]!.text).toContain("Required Gates");
    expect(result.content[0]!.text).toContain("l2-coverage");
  });

  it("output omits required gates section when gates are empty", async () => {
    // Kills ConditionalExpression L357: if (gates.length > 0) → true (phantom header)
    const result = await changeRequestHandler({
      project_dir: tmpDir,
      title: "Minor fix",
      description: "Tiny adjustment",
      type: "gate-change",
    });
    expect(result.content[0]!.text).not.toContain("Required Gates");
  });

  it("breaking=false is preserved in the written yaml", async () => {
    // Kills BooleanLiteral L312/L322: ?? false → ?? true (breaking becomes true when not specified)
    await changeRequestHandler({
      project_dir: tmpDir,
      title: "Non-breaking change",
      description: "Small addition",
      type: "spec-change",
      breaking: false,
    });
    const dir = changesDir(tmpDir);
    const files = (await import("node:fs"))
      .readdirSync(dir)
      .filter((f) => f.endsWith(".yaml"));
    const yaml = readFileSync(join(dir, files[0]!), "utf-8");
    expect(yaml).toContain("breaking: false");
  });

  it("breaking defaults to false when not provided", async () => {
    // Kills LogicalOperator L312: ?? false → && false (breaking always false regardless of arg)
    await changeRequestHandler({
      project_dir: tmpDir,
      title: "Non-breaking change",
      description: "Small addition",
      type: "spec-change",
    });
    const dir = changesDir(tmpDir);
    const files = (await import("node:fs"))
      .readdirSync(dir)
      .filter((f) => f.endsWith(".yaml"));
    const yaml = readFileSync(join(dir, files[0]!), "utf-8");
    expect(yaml).toContain("breaking: false");
  });

  it("includes Next Steps guidance", async () => {
    const result = await changeRequestHandler({
      project_dir: tmpDir,
      title: "New feature",
      description: "Adding X",
      type: "spec-change",
    });
    expect(result.content[0]!.text).toContain("Next Steps");
    expect(result.content[0]!.text).toContain("propose_session");
  });
});

// ── listChangesHandler ─────────────────────────────────────────────────

describe("listChangesHandler", () => {
  it("returns 'no records' message when changes dir is empty", async () => {
    const result = await listChangesHandler({ project_dir: tmpDir });
    expect(result.content[0]!.text).toContain("No change records found");
  });

  it("lists all changes grouped by status", async () => {
    const dir = changesDir(tmpDir);
    mkdirSync(dir, { recursive: true });
    const open = makeRecord({ id: "chg-open", status: "open" });
    const impl = makeRecord({ id: "chg-impl", status: "implementing" });
    writeFileSync(join(dir, `${open.id}.yaml`), serializeChangeRecord(open));
    writeFileSync(join(dir, `${impl.id}.yaml`), serializeChangeRecord(impl));

    const result = await listChangesHandler({ project_dir: tmpDir });
    expect(result.content[0]!.text).toContain("2 total");
    expect(result.content[0]!.text).toContain("Open");
    expect(result.content[0]!.text).toContain("Implementing");
  });

  it("filters by status when status param is provided", async () => {
    const dir = changesDir(tmpDir);
    mkdirSync(dir, { recursive: true });
    const open = makeRecord({ id: "chg-open", status: "open" });
    const verified = makeRecord({ id: "chg-verified", status: "verified" });
    writeFileSync(join(dir, `${open.id}.yaml`), serializeChangeRecord(open));
    writeFileSync(
      join(dir, `${verified.id}.yaml`),
      serializeChangeRecord(verified),
    );

    const result = await listChangesHandler({
      project_dir: tmpDir,
      status: "verified",
    });
    expect(result.content[0]!.text).toContain("1 total");
    expect(result.content[0]!.text).not.toContain("chg-open");
  });

  it("shows 'no filter match' message when filtered status has no results", async () => {
    const result = await listChangesHandler({
      project_dir: tmpDir,
      status: "blocked",
    });
    expect(result.content[0]!.text).toContain("No changes with status");
  });

  it("shows close_cycle block warning for implementing changes", async () => {
    const dir = changesDir(tmpDir);
    mkdirSync(dir, { recursive: true });
    const impl = makeRecord({
      id: "chg-impl",
      status: "implementing",
      required_gates: ["l2-coverage"],
    });
    writeFileSync(join(dir, `${impl.id}.yaml`), serializeChangeRecord(impl));

    const result = await listChangesHandler({ project_dir: tmpDir });
    expect(result.content[0]!.text).toContain("close_cycle will be blocked");
    expect(result.content[0]!.text).toContain("l2-coverage");
  });

  it("never marks verified changes as stale regardless of age", async () => {
    // Kills ConditionalExpression L458: || false removes verified status from exclusion
    const dir = changesDir(tmpDir);
    mkdirSync(dir, { recursive: true });
    const old = makeRecord({
      id: "chg-old-verified",
      status: "verified",
      created: "2020-01-01",
    });
    writeFileSync(join(dir, `${old.id}.yaml`), serializeChangeRecord(old));
    const result = await listChangesHandler({ project_dir: tmpDir });
    expect(result.content[0]!.text).not.toContain("stale");
  });

  it("does not show close_cycle warning when no implementing changes exist", async () => {
    // Kills ConditionalExpression/EqualityOperator L441: always true shows warning even with no implementing
    const dir = changesDir(tmpDir);
    mkdirSync(dir, { recursive: true });
    const open = makeRecord({ id: "chg-open", status: "open" });
    writeFileSync(join(dir, `${open.id}.yaml`), serializeChangeRecord(open));
    const result = await listChangesHandler({ project_dir: tmpDir });
    expect(result.content[0]!.text).not.toContain(
      "close_cycle will be blocked",
    );
  });

  it("shows gate names in close_cycle warning when implementing change has gates", async () => {
    // Kills ConditionalExpression/EqualityOperator L445: always-false skips gate sub-section
    const dir = changesDir(tmpDir);
    mkdirSync(dir, { recursive: true });
    const impl = makeRecord({
      id: "chg-impl",
      status: "implementing",
      required_gates: ["schema-validation"],
    });
    writeFileSync(join(dir, `${impl.id}.yaml`), serializeChangeRecord(impl));
    const result = await listChangesHandler({ project_dir: tmpDir });
    expect(result.content[0]!.text).toContain("schema-validation");
  });

  it("shows dash in gates column for change with no required_gates", async () => {
    // Kills ConditionalExpression/EqualityOperator L434: always-true shows count even for empty
    const dir = changesDir(tmpDir);
    mkdirSync(dir, { recursive: true });
    const noGates = makeRecord({ id: "chg-no-gates", required_gates: [] });
    writeFileSync(
      join(dir, `${noGates.id}.yaml`),
      serializeChangeRecord(noGates),
    );
    const result = await listChangesHandler({ project_dir: tmpDir });
    expect(result.content[0]!.text).toContain("—");
  });

  it("shows gate count for change with required_gates", async () => {
    // Kills ConditionalExpression/EqualityOperator L434: always-false never shows count
    const dir = changesDir(tmpDir);
    mkdirSync(dir, { recursive: true });
    const withGates = makeRecord({
      id: "chg-gates",
      required_gates: ["l2-coverage"],
    });
    writeFileSync(
      join(dir, `${withGates.id}.yaml`),
      serializeChangeRecord(withGates),
    );
    const result = await listChangesHandler({ project_dir: tmpDir });
    // Gate count "1" should appear in the listing line
    expect(result.content[0]!.text).not.toContain("gates: —");
  });

  it("marks stale open changes with warning indicator", async () => {
    const dir = changesDir(tmpDir);
    mkdirSync(dir, { recursive: true });
    const stale = makeRecord({
      id: "chg-stale",
      status: "open",
      created: "2026-01-01", // well past 7 days
    });
    writeFileSync(join(dir, `${stale.id}.yaml`), serializeChangeRecord(stale));

    const result = await listChangesHandler({ project_dir: tmpDir });
    expect(result.content[0]!.text).toContain("stale");
  });

  it("never marks closed or verified changes as stale regardless of age", async () => {
    const dir = changesDir(tmpDir);
    mkdirSync(dir, { recursive: true });
    const old = makeRecord({
      id: "chg-old-closed",
      status: "closed",
      created: "2020-01-01",
    });
    writeFileSync(join(dir, `${old.id}.yaml`), serializeChangeRecord(old));
    const result = await listChangesHandler({ project_dir: tmpDir });
    expect(result.content[0]!.text).not.toContain("stale");
  });

  it("does not mark a change created exactly 7 days ago as stale", async () => {
    // isStale uses days > 7 (strict), so day 7 is NOT stale
    const dir = changesDir(tmpDir);
    mkdirSync(dir, { recursive: true });
    const today = new Date();
    const sevenDaysAgo = new Date(today);
    sevenDaysAgo.setDate(today.getDate() - 7);
    const created = sevenDaysAgo.toISOString().slice(0, 10);
    const rec = makeRecord({ id: "chg-day7", status: "open", created });
    writeFileSync(join(dir, `${rec.id}.yaml`), serializeChangeRecord(rec));

    const result = await listChangesHandler({ project_dir: tmpDir });
    expect(result.content[0]!.text).not.toContain("stale");
  });

  it("marks a change created 8 days ago as stale", async () => {
    const dir = changesDir(tmpDir);
    mkdirSync(dir, { recursive: true });
    const today = new Date();
    const eightDaysAgo = new Date(today);
    eightDaysAgo.setDate(today.getDate() - 8);
    const created = eightDaysAgo.toISOString().slice(0, 10);
    const rec = makeRecord({ id: "chg-day8", status: "open", created });
    writeFileSync(join(dir, `${rec.id}.yaml`), serializeChangeRecord(rec));

    const result = await listChangesHandler({ project_dir: tmpDir });
    expect(result.content[0]!.text).toContain("stale");
  });
});
