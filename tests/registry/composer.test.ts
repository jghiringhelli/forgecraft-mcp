import { describe, it, expect } from "vitest";
import type { Tag, TagTemplateSet, ClaudeMdBlock, StructureEntry, NfrBlock, HookTemplate, SkillTemplate, ReviewBlock, ReferenceBlock, ContentTier } from "../../src/shared/types.js";
import { composeTemplates, type ComposedTemplates } from "../../src/registry/composer.js";

function makeTemplateSet(
  tag: Tag,
  overrides: Partial<Omit<TagTemplateSet, "tag">> = {},
): TagTemplateSet {
  return { tag, ...overrides };
}

function makeBlock(id: string, title: string = id, tier?: ContentTier): ClaudeMdBlock {
  return { id, title, content: `## ${title}\nContent for ${id}`, ...(tier ? { tier } : {}) };
}

function makeEntry(path: string, type: "directory" | "file" = "directory"): StructureEntry {
  return { path, type };
}

function makeNfr(id: string, title: string = id, tier?: ContentTier): NfrBlock {
  return { id, title, content: `NFR: ${id}`, ...(tier ? { tier } : {}) };
}

function makeHook(name: string): HookTemplate {
  return { name, trigger: "pre-commit", description: `Hook ${name}`, filename: `${name}.sh`, script: `#!/bin/bash\necho ${name}` };
}

function makeSkill(id: string, tier?: ContentTier): SkillTemplate {
  return { id, name: `Skill ${id}`, filename: `${id}.md`, description: `Description for ${id}`, content: `# ${id}\nSkill content`, ...(tier ? { tier } : {}) };
}

function makeReferenceBlock(id: string, title: string = id): ReferenceBlock {
  return { id, title, content: `## ${title}\nReference content for ${id}` };
}

function makeReviewBlock(id: string, dimension: ReviewBlock["dimension"] = "architecture"): ReviewBlock {
  return {
    id,
    dimension,
    title: `Review ${id}`,
    description: `Check ${id}`,
    checklist: [{ id: `${id}-check`, description: `Check for ${id}`, severity: "critical" }],
  };
}

describe("composer", () => {
  describe("composeTemplates", () => {
    it("should return empty arrays when no templates match", () => {
      const allTemplates = new Map<Tag, TagTemplateSet>();
      const result = composeTemplates(["API"], allTemplates);

      expect(result.claudeMdBlocks).toEqual([]);
      expect(result.structureEntries).toEqual([]);
      expect(result.nfrBlocks).toEqual([]);
      expect(result.hooks).toEqual([]);
      expect(result.reviewBlocks).toEqual([]);
    });

    it("should always prepend UNIVERSAL even if not in tags", () => {
      const allTemplates = new Map<Tag, TagTemplateSet>();
      allTemplates.set("UNIVERSAL", makeTemplateSet("UNIVERSAL", {
        claudeMd: { tag: "UNIVERSAL", section: "claude-md", blocks: [makeBlock("universal-block")] },
      }));
      allTemplates.set("API", makeTemplateSet("API", {
        claudeMd: { tag: "API", section: "claude-md", blocks: [makeBlock("api-block")] },
      }));

      // Pass only API — UNIVERSAL should be added automatically
      const result = composeTemplates(["API"], allTemplates);

      expect(result.claudeMdBlocks).toHaveLength(2);
      expect(result.claudeMdBlocks[0]!.id).toBe("universal-block");
      expect(result.claudeMdBlocks[1]!.id).toBe("api-block");
    });

    it("should deduplicate claude-md blocks by id", () => {
      const allTemplates = new Map<Tag, TagTemplateSet>();
      allTemplates.set("UNIVERSAL", makeTemplateSet("UNIVERSAL", {
        claudeMd: { tag: "UNIVERSAL", section: "claude-md", blocks: [makeBlock("shared-block")] },
      }));
      allTemplates.set("API", makeTemplateSet("API", {
        claudeMd: { tag: "API", section: "claude-md", blocks: [makeBlock("shared-block"), makeBlock("api-only")] },
      }));

      const result = composeTemplates(["UNIVERSAL", "API"], allTemplates);

      expect(result.claudeMdBlocks).toHaveLength(2);
      expect(result.claudeMdBlocks.map((b) => b.id)).toEqual(["shared-block", "api-only"]);
    });

    it("should deduplicate structure entries by path", () => {
      const allTemplates = new Map<Tag, TagTemplateSet>();
      allTemplates.set("UNIVERSAL", makeTemplateSet("UNIVERSAL", {
        structure: { tag: "UNIVERSAL", section: "structure", entries: [makeEntry("src/")] },
      }));
      allTemplates.set("API", makeTemplateSet("API", {
        structure: { tag: "API", section: "structure", entries: [makeEntry("src/"), makeEntry("src/routes/")] },
      }));

      const result = composeTemplates(["UNIVERSAL", "API"], allTemplates);

      expect(result.structureEntries).toHaveLength(2);
      expect(result.structureEntries.map((e) => e.path)).toEqual(["src/", "src/routes/"]);
    });

    it("should deduplicate hooks by name", () => {
      const allTemplates = new Map<Tag, TagTemplateSet>();
      allTemplates.set("UNIVERSAL", makeTemplateSet("UNIVERSAL", {
        hooks: [makeHook("lint"), makeHook("test")],
      }));
      allTemplates.set("API", makeTemplateSet("API", {
        hooks: [makeHook("lint"), makeHook("api-check")],
      }));

      const result = composeTemplates(["UNIVERSAL", "API"], allTemplates);

      expect(result.hooks).toHaveLength(3);
      expect(result.hooks.map((h) => h.name)).toEqual(["lint", "test", "api-check"]);
    });

    it("should deduplicate NFR blocks by id", () => {
      const allTemplates = new Map<Tag, TagTemplateSet>();
      allTemplates.set("UNIVERSAL", makeTemplateSet("UNIVERSAL", {
        nfr: { tag: "UNIVERSAL", section: "nfr", blocks: [makeNfr("security")] },
      }));
      allTemplates.set("API", makeTemplateSet("API", {
        nfr: { tag: "API", section: "nfr", blocks: [makeNfr("security"), makeNfr("api-perf")] },
      }));

      const result = composeTemplates(["UNIVERSAL", "API"], allTemplates);

      expect(result.nfrBlocks).toHaveLength(2);
      expect(result.nfrBlocks.map((n) => n.id)).toEqual(["security", "api-perf"]);
    });

    it("should not duplicate UNIVERSAL if explicitly included", () => {
      const allTemplates = new Map<Tag, TagTemplateSet>();
      allTemplates.set("UNIVERSAL", makeTemplateSet("UNIVERSAL", {
        claudeMd: { tag: "UNIVERSAL", section: "claude-md", blocks: [makeBlock("u-block")] },
      }));

      const result = composeTemplates(["UNIVERSAL", "UNIVERSAL"], allTemplates);
      expect(result.claudeMdBlocks).toHaveLength(1);
    });

    it("should handle tags with no template data gracefully", () => {
      const allTemplates = new Map<Tag, TagTemplateSet>();
      allTemplates.set("UNIVERSAL", makeTemplateSet("UNIVERSAL"));
      allTemplates.set("API", makeTemplateSet("API"));

      const result = composeTemplates(["UNIVERSAL", "API"], allTemplates);

      expect(result.claudeMdBlocks).toEqual([]);
      expect(result.structureEntries).toEqual([]);
      expect(result.nfrBlocks).toEqual([]);
      expect(result.hooks).toEqual([]);
      expect(result.reviewBlocks).toEqual([]);
    });

    it("should deduplicate review blocks by id", () => {
      const allTemplates = new Map<Tag, TagTemplateSet>();
      allTemplates.set("UNIVERSAL", makeTemplateSet("UNIVERSAL", {
        review: { tag: "UNIVERSAL", section: "review", blocks: [makeReviewBlock("arch-review")] },
      }));
      allTemplates.set("API", makeTemplateSet("API", {
        review: { tag: "API", section: "review", blocks: [makeReviewBlock("arch-review"), makeReviewBlock("api-review", "code-quality")] },
      }));

      const result = composeTemplates(["UNIVERSAL", "API"], allTemplates);

      expect(result.reviewBlocks).toHaveLength(2);
      expect(result.reviewBlocks.map((r) => r.id)).toEqual(["arch-review", "api-review"]);
    });

    it("should compose review blocks from multiple tags preserving dimension", () => {
      const allTemplates = new Map<Tag, TagTemplateSet>();
      allTemplates.set("UNIVERSAL", makeTemplateSet("UNIVERSAL", {
        review: { tag: "UNIVERSAL", section: "review", blocks: [makeReviewBlock("arch", "architecture")] },
      }));
      allTemplates.set("API", makeTemplateSet("API", {
        review: { tag: "API", section: "review", blocks: [makeReviewBlock("api-perf", "performance")] },
      }));

      const result = composeTemplates(["UNIVERSAL", "API"], allTemplates);

      expect(result.reviewBlocks).toHaveLength(2);
      expect(result.reviewBlocks[0]!.dimension).toBe("architecture");
      expect(result.reviewBlocks[1]!.dimension).toBe("performance");
    });
  });

  describe("tier filtering", () => {
    function buildTieredTemplates(): Map<Tag, TagTemplateSet> {
      const allTemplates = new Map<Tag, TagTemplateSet>();
      allTemplates.set("UNIVERSAL", makeTemplateSet("UNIVERSAL", {
        claudeMd: {
          tag: "UNIVERSAL",
          section: "claude-md",
          blocks: [
            makeBlock("core-block", "Core Block", "core"),
            makeBlock("rec-block", "Recommended Block", "recommended"),
            makeBlock("opt-block", "Optional Block", "optional"),
            makeBlock("no-tier-block", "No Tier Block"), // undefined tier = core
          ],
        },
        nfr: {
          tag: "UNIVERSAL",
          section: "nfr",
          blocks: [
            makeNfr("core-nfr", "Core NFR", "core"),
            makeNfr("opt-nfr", "Optional NFR", "optional"),
          ],
        },
      }));
      return allTemplates;
    }

    it("should include all blocks when tier is optional", () => {
      const result = composeTemplates(["UNIVERSAL"], buildTieredTemplates(), {
        config: { tier: "optional" },
      });
      expect(result.claudeMdBlocks).toHaveLength(4);
      expect(result.nfrBlocks).toHaveLength(2);
    });

    it("should filter optional blocks when tier is recommended", () => {
      const result = composeTemplates(["UNIVERSAL"], buildTieredTemplates(), {
        config: { tier: "recommended" },
      });
      expect(result.claudeMdBlocks).toHaveLength(3);
      expect(result.claudeMdBlocks.map((b) => b.id)).toEqual(["core-block", "rec-block", "no-tier-block"]);
      expect(result.nfrBlocks).toHaveLength(1);
      expect(result.nfrBlocks[0]!.id).toBe("core-nfr");
    });

    it("should only include core blocks when tier is core", () => {
      const result = composeTemplates(["UNIVERSAL"], buildTieredTemplates(), {
        config: { tier: "core" },
      });
      expect(result.claudeMdBlocks).toHaveLength(2);
      expect(result.claudeMdBlocks.map((b) => b.id)).toEqual(["core-block", "no-tier-block"]);
      expect(result.nfrBlocks).toHaveLength(1);
    });

    it("should treat blocks without tier as core", () => {
      const result = composeTemplates(["UNIVERSAL"], buildTieredTemplates(), {
        config: { tier: "core" },
      });
      const ids = result.claudeMdBlocks.map((b) => b.id);
      expect(ids).toContain("no-tier-block");
    });

    it("should default to recommended tier when no config provided", () => {
      const result = composeTemplates(["UNIVERSAL"], buildTieredTemplates());
      // Default tier is "recommended", which includes core + recommended
      expect(result.claudeMdBlocks).toHaveLength(3);
    });
  });

  describe("include/exclude filtering", () => {
    it("should exclude specified block IDs", () => {
      const allTemplates = new Map<Tag, TagTemplateSet>();
      allTemplates.set("UNIVERSAL", makeTemplateSet("UNIVERSAL", {
        claudeMd: {
          tag: "UNIVERSAL",
          section: "claude-md",
          blocks: [
            makeBlock("keep-me", "Keep", "core"),
            makeBlock("drop-me", "Drop", "core"),
          ],
        },
      }));

      const result = composeTemplates(["UNIVERSAL"], allTemplates, {
        config: { tier: "optional", exclude: ["drop-me"] },
      });
      expect(result.claudeMdBlocks).toHaveLength(1);
      expect(result.claudeMdBlocks[0]!.id).toBe("keep-me");
    });

    it("should only include specified block IDs when include list given", () => {
      const allTemplates = new Map<Tag, TagTemplateSet>();
      allTemplates.set("UNIVERSAL", makeTemplateSet("UNIVERSAL", {
        claudeMd: {
          tag: "UNIVERSAL",
          section: "claude-md",
          blocks: [
            makeBlock("a", "A", "core"),
            makeBlock("b", "B", "core"),
            makeBlock("c", "C", "core"),
          ],
        },
      }));

      const result = composeTemplates(["UNIVERSAL"], allTemplates, {
        config: { tier: "optional", include: ["a", "c"] },
      });
      expect(result.claudeMdBlocks).toHaveLength(2);
      expect(result.claudeMdBlocks.map((b) => b.id)).toEqual(["a", "c"]);
    });

    it("should apply exclude on top of include", () => {
      const allTemplates = new Map<Tag, TagTemplateSet>();
      allTemplates.set("UNIVERSAL", makeTemplateSet("UNIVERSAL", {
        claudeMd: {
          tag: "UNIVERSAL",
          section: "claude-md",
          blocks: [
            makeBlock("a", "A", "core"),
            makeBlock("b", "B", "core"),
          ],
        },
      }));

      const result = composeTemplates(["UNIVERSAL"], allTemplates, {
        config: { tier: "optional", include: ["a", "b"], exclude: ["b"] },
      });
      expect(result.claudeMdBlocks).toHaveLength(1);
      expect(result.claudeMdBlocks[0]!.id).toBe("a");
    });
  });

  describe("reference block composition", () => {
    it("should compose reference blocks from templates", () => {
      const allTemplates = new Map<Tag, TagTemplateSet>();
      allTemplates.set("UNIVERSAL", makeTemplateSet("UNIVERSAL", {
        reference: {
          tag: "UNIVERSAL",
          section: "reference",
          blocks: [makeReferenceBlock("ddd"), makeReferenceBlock("cqrs")],
        },
      }));

      const result = composeTemplates(["UNIVERSAL"], allTemplates);
      expect(result.referenceBlocks).toHaveLength(2);
      expect(result.referenceBlocks.map((b) => b.id)).toEqual(["ddd", "cqrs"]);
    });

    it("should deduplicate reference blocks by id", () => {
      const allTemplates = new Map<Tag, TagTemplateSet>();
      allTemplates.set("UNIVERSAL", makeTemplateSet("UNIVERSAL", {
        reference: {
          tag: "UNIVERSAL",
          section: "reference",
          blocks: [makeReferenceBlock("shared")],
        },
      }));
      allTemplates.set("API", makeTemplateSet("API", {
        reference: {
          tag: "API",
          section: "reference",
          blocks: [makeReferenceBlock("shared"), makeReferenceBlock("api-only")],
        },
      }));

      const result = composeTemplates(["UNIVERSAL", "API"], allTemplates);
      expect(result.referenceBlocks).toHaveLength(2);
      expect(result.referenceBlocks.map((b) => b.id)).toEqual(["shared", "api-only"]);
    });

    it("should return empty reference blocks when none exist", () => {
      const allTemplates = new Map<Tag, TagTemplateSet>();
      allTemplates.set("UNIVERSAL", makeTemplateSet("UNIVERSAL"));

      const result = composeTemplates(["UNIVERSAL"], allTemplates);
      expect(result.referenceBlocks).toEqual([]);
    });

    it("should not tier-filter reference blocks", () => {
      const allTemplates = new Map<Tag, TagTemplateSet>();
      allTemplates.set("UNIVERSAL", makeTemplateSet("UNIVERSAL", {
        reference: {
          tag: "UNIVERSAL",
          section: "reference",
          blocks: [makeReferenceBlock("ddd")],
        },
      }));

      // Even with core tier, reference blocks are always available on demand
      const result = composeTemplates(["UNIVERSAL"], allTemplates, {
        config: { tier: "core" },
      });
      expect(result.referenceBlocks).toHaveLength(1);
    });
  });

  describe("skill composition", () => {
    it("should compose skills from a single tag", () => {
      const allTemplates = new Map<Tag, TagTemplateSet>();
      allTemplates.set("UNIVERSAL", makeTemplateSet("UNIVERSAL", {
        skills: [makeSkill("review-code"), makeSkill("run-tests")],
      }));

      const result = composeTemplates(["UNIVERSAL"], allTemplates);
      expect(result.skills).toHaveLength(2);
      expect(result.skills.map((s) => s.id)).toEqual(["review-code", "run-tests"]);
    });

    it("should deduplicate skills by id across tags", () => {
      const allTemplates = new Map<Tag, TagTemplateSet>();
      allTemplates.set("UNIVERSAL", makeTemplateSet("UNIVERSAL", {
        skills: [makeSkill("review-code"), makeSkill("run-tests")],
      }));
      allTemplates.set("API", makeTemplateSet("API", {
        skills: [makeSkill("review-code"), makeSkill("api-test")],
      }));

      const result = composeTemplates(["UNIVERSAL", "API"], allTemplates);
      expect(result.skills).toHaveLength(3);
      expect(result.skills.map((s) => s.id)).toEqual(["review-code", "run-tests", "api-test"]);
    });

    it("should tier-filter skills", () => {
      const allTemplates = new Map<Tag, TagTemplateSet>();
      allTemplates.set("UNIVERSAL", makeTemplateSet("UNIVERSAL", {
        skills: [
          makeSkill("core-skill", "core"),
          makeSkill("rec-skill", "recommended"),
          makeSkill("opt-skill", "optional"),
        ],
      }));

      const coreResult = composeTemplates(["UNIVERSAL"], allTemplates, {
        config: { tier: "core" },
      });
      expect(coreResult.skills).toHaveLength(1);
      expect(coreResult.skills[0]!.id).toBe("core-skill");

      const recResult = composeTemplates(["UNIVERSAL"], allTemplates, {
        config: { tier: "recommended" },
      });
      expect(recResult.skills).toHaveLength(2);
      expect(recResult.skills.map((s) => s.id)).toEqual(["core-skill", "rec-skill"]);

      const optResult = composeTemplates(["UNIVERSAL"], allTemplates, {
        config: { tier: "optional" },
      });
      expect(optResult.skills).toHaveLength(3);
    });

    it("should treat skills without tier as core", () => {
      const allTemplates = new Map<Tag, TagTemplateSet>();
      allTemplates.set("UNIVERSAL", makeTemplateSet("UNIVERSAL", {
        skills: [makeSkill("no-tier-skill")],
      }));

      const result = composeTemplates(["UNIVERSAL"], allTemplates, {
        config: { tier: "core" },
      });
      expect(result.skills).toHaveLength(1);
      expect(result.skills[0]!.id).toBe("no-tier-skill");
    });

    it("should respect include/exclude for skills", () => {
      const allTemplates = new Map<Tag, TagTemplateSet>();
      allTemplates.set("UNIVERSAL", makeTemplateSet("UNIVERSAL", {
        skills: [
          makeSkill("keep-me", "core"),
          makeSkill("drop-me", "core"),
        ],
      }));

      const result = composeTemplates(["UNIVERSAL"], allTemplates, {
        config: { tier: "optional", exclude: ["drop-me"] },
      });
      expect(result.skills).toHaveLength(1);
      expect(result.skills[0]!.id).toBe("keep-me");
    });

    it("should return empty skills when no templates have skills", () => {
      const allTemplates = new Map<Tag, TagTemplateSet>();
      allTemplates.set("UNIVERSAL", makeTemplateSet("UNIVERSAL"));

      const result = composeTemplates(["UNIVERSAL"], allTemplates);
      expect(result.skills).toEqual([]);
    });
  });
});
