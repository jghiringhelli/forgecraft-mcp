import { describe, it, expect } from "vitest";
import { CommitHistoryArtifact } from "../../src/artifacts/commit-history.js";

describe("CommitHistoryArtifact", () => {
  const artifact = new CommitHistoryArtifact("/tmp/project", "1.0.0");

  describe("validateMessage", () => {
    it("accepts_valid_feat_commit", () => {
      expect(artifact.validateMessage("feat(tools): add new MCP tool")).toBe(true);
    });

    it("accepts_valid_fix_commit", () => {
      expect(artifact.validateMessage("fix(shared): handle null return from parser")).toBe(true);
    });

    it("accepts_valid_chore_commit_no_scope", () => {
      expect(artifact.validateMessage("chore: update dependencies")).toBe(true);
    });

    it("accepts_breaking_change_marker", () => {
      expect(artifact.validateMessage("feat(api)!: remove deprecated endpoint")).toBe(true);
    });

    it("rejects_missing_type", () => {
      expect(artifact.validateMessage("add new feature")).toBe(false);
    });

    it("rejects_uppercase_type", () => {
      expect(artifact.validateMessage("Feat: something")).toBe(false);
    });

    it("rejects_message_too_long", () => {
      const longMsg = "feat: " + "x".repeat(80);
      expect(artifact.validateMessage(longMsg)).toBe(false);
    });

    it("rejects_empty_subject", () => {
      expect(artifact.validateMessage("feat: ")).toBe(false);
    });

    it("uses_only_first_line_for_validation", () => {
      const multiLine = "feat(core): add spec interface\n\nLonger body text here.";
      expect(artifact.validateMessage(multiLine)).toBe(true);
    });
  });

  describe("determineBump", () => {
    it("returns_major_for_breaking_change_footer", () => {
      expect(artifact.determineBump([
        "feat(api): add endpoint",
        "fix(core): patch bug\n\nBREAKING CHANGE: old API removed",
      ])).toBe("major");
    });

    it("returns_major_for_bang_type", () => {
      expect(artifact.determineBump(["feat(api)!: drop v1 support"])).toBe("major");
    });

    it("returns_minor_for_feat_no_breaking", () => {
      expect(artifact.determineBump(["feat(tools): new scaffold command", "fix(shared): null check"])).toBe("minor");
    });

    it("returns_patch_for_fix_only", () => {
      expect(artifact.determineBump(["fix(shared): correct path resolution"])).toBe("patch");
    });

    it("returns_patch_for_empty_list", () => {
      expect(artifact.determineBump([])).toBe("patch");
    });

    it("prefers_major_over_minor", () => {
      expect(artifact.determineBump(["feat: new thing", "fix!: break it"])).toBe("major");
    });
  });

  describe("isInScope", () => {
    it("matches_changelog", () => {
      expect(artifact.isInScope("CHANGELOG.md")).toBe(true);
    });

    it("matches_package_json", () => {
      expect(artifact.isInScope("package.json")).toBe(true);
    });

    it("rejects_source_files", () => {
      expect(artifact.isInScope("src/tools/classify.ts")).toBe(false);
    });
  });

  describe("GenerativeSpec contract", () => {
    it("has_required_identity_fields", () => {
      expect(artifact.specId).toBe("artifact:commit-history");
      expect(artifact.name).toBeTruthy();
      expect(artifact.version).toBe("1.0.0");
      expect(artifact.purpose).toBeTruthy();
    });

    it("covers_and_excludes_are_non_empty", () => {
      expect(artifact.covers.length).toBeGreaterThan(0);
      expect(artifact.excludes.length).toBeGreaterThan(0);
    });

    it("defend_resolves_without_throwing", async () => {
      const result = await artifact.defend();
      expect(typeof result.allPassed).toBe("boolean");
      expect(Array.isArray(result.results)).toBe(true);
    });

    it("verify_returns_array", async () => {
      const results = await artifact.verify("CHANGELOG.md");
      expect(Array.isArray(results)).toBe(true);
    });

    it("composeWith_returns_no_conflicts", () => {
      const conflicts = artifact.composeWith(artifact);
      expect(conflicts).toEqual([]);
    });
  });
});
