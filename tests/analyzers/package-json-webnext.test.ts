/**
 * Tests for WEB-NEXT tag detection in package-json analyzer.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { analyzeProject } from "../../src/analyzers/package-json.js";

function makeTempDir(): string {
  const dir = join(tmpdir(), `fc-pkg-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function writePkgJson(dir: string, pkg: object): void {
  writeFileSync(
    join(dir, "package.json"),
    JSON.stringify(pkg, null, 2),
    "utf-8",
  );
}

describe("WEB-NEXT tag detection", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = makeTempDir();
  });
  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("detects WEB-NEXT from next in dependencies", () => {
    writePkgJson(tempDir, {
      dependencies: { next: "14.0.0", react: "18.0.0", "react-dom": "18.0.0" },
    });
    const detections = analyzeProject(tempDir);
    const tags = detections.map((d) => d.tag);
    expect(tags).toContain("WEB-NEXT");
  });

  it("also detects WEB-REACT from react+react-dom when next is present", () => {
    writePkgJson(tempDir, {
      dependencies: { next: "14.0.0", react: "18.0.0", "react-dom": "18.0.0" },
    });
    const detections = analyzeProject(tempDir);
    const tags = detections.map((d) => d.tag);
    expect(tags).toContain("WEB-REACT");
    expect(tags).toContain("WEB-NEXT");
  });

  it("does NOT detect WEB-NEXT for plain React SPA without Next.js", () => {
    writePkgJson(tempDir, {
      dependencies: { react: "18.0.0", "react-dom": "18.0.0" },
    });
    const detections = analyzeProject(tempDir);
    const tags = detections.map((d) => d.tag);
    expect(tags).not.toContain("WEB-NEXT");
    expect(tags).toContain("WEB-REACT");
  });

  it("detects WEB-NEXT from next.config.js file presence", () => {
    writeFileSync(join(tempDir, "next.config.js"), "module.exports = {};");
    const detections = analyzeProject(tempDir);
    const tags = detections.map((d) => d.tag);
    expect(tags).toContain("WEB-NEXT");
  });

  it("detects WEB-NEXT from next.config.mjs", () => {
    writeFileSync(join(tempDir, "next.config.mjs"), "export default {};");
    const detections = analyzeProject(tempDir);
    const tags = detections.map((d) => d.tag);
    expect(tags).toContain("WEB-NEXT");
  });
});
