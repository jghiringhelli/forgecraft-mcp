// @ts-nocheck
import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { scanFolderStructure, renderFolderTree, listAllFiles, fileExists, directoryExists } from "../../src/analyzers/folder-structure.js";

const FIXTURES_DIR = join(import.meta.dirname, "..", "fixtures");

function createTree(name: string, files: Record<string, string>): string {
  const dir = join(FIXTURES_DIR, `tree-${name}`);
  rmSync(dir, { recursive: true, force: true });

  for (const [relPath, content] of Object.entries(files)) {
    const fullPath = join(dir, relPath);
    mkdirSync(join(fullPath, ".."), { recursive: true });
    writeFileSync(fullPath, content);
  }

  return dir;
}

describe("folder-structure analyzer", () => {
  describe("scanFolderStructure", () => {
    it("should scan a simple directory", () => {
      const dir = createTree("simple", {
        "src/index.ts": "export {};",
        "src/utils/helpers.ts": "export {};",
        "README.md": "# Test",
      });

      const tree = scanFolderStructure(dir);

      expect(tree.type).toBe("directory");
      expect(tree.children).toBeDefined();
      expect(tree.children!.length).toBeGreaterThan(0);

      rmSync(dir, { recursive: true });
    });

    it("should skip node_modules", () => {
      const dir = createTree("skip-nm", {
        "src/index.ts": "",
        "node_modules/pkg/index.js": "",
      });

      const tree = scanFolderStructure(dir);
      const names = tree.children!.map((c) => c.name);

      expect(names).not.toContain("node_modules");

      rmSync(dir, { recursive: true });
    });

    it("should skip dotfiles/dotdirs", () => {
      const dir = createTree("skip-dots", {
        "src/index.ts": "",
        ".git/config": "",
      });

      const tree = scanFolderStructure(dir);
      const names = tree.children!.map((c) => c.name);

      expect(names).not.toContain(".git");

      rmSync(dir, { recursive: true });
    });

    it("should respect maxDepth", () => {
      const dir = createTree("depth", {
        "a/b/c/d/e.ts": "",
      });

      const tree = scanFolderStructure(dir, 2);

      // At depth 2: root(0) → a(1) → b(2, no children expanded)
      const a = tree.children!.find((c) => c.name === "a")!;
      const b = a.children!.find((c) => c.name === "b")!;

      // b should exist but its children should not be expanded
      expect(b).toBeDefined();
      expect(b.children).toBeUndefined();

      rmSync(dir, { recursive: true });
    });
  });

  describe("renderFolderTree", () => {
    it("should render a tree as text", () => {
      const dir = createTree("render", {
        "src/index.ts": "",
        "README.md": "",
      });

      const tree = scanFolderStructure(dir);
      const text = renderFolderTree(tree);

      expect(text).toContain("src/");
      expect(text).toContain("README.md");
      expect(text).toContain("├──");

      rmSync(dir, { recursive: true });
    });
  });

  describe("listAllFiles", () => {
    it("should return flat list of files", () => {
      const dir = createTree("list", {
        "src/index.ts": "",
        "src/utils/helpers.ts": "",
        "README.md": "",
      });

      const files = listAllFiles(dir);

      expect(files).toContain("README.md");
      expect(files).toContain(join("src", "index.ts"));
      expect(files).toContain(join("src", "utils", "helpers.ts"));

      rmSync(dir, { recursive: true });
    });
  });

  describe("fileExists / directoryExists", () => {
    it("should detect existing files", () => {
      const dir = createTree("exists", {
        "package.json": "{}",
      });

      expect(fileExists(dir, "package.json")).toBe(true);
      expect(fileExists(dir, "missing.json")).toBe(false);

      rmSync(dir, { recursive: true });
    });

    it("should detect existing directories", () => {
      const dir = createTree("dir-exists", {
        "src/index.ts": "",
      });

      expect(directoryExists(dir, "src")).toBe(true);
      expect(directoryExists(dir, "missing")).toBe(false);

      rmSync(dir, { recursive: true });
    });
  });
});
