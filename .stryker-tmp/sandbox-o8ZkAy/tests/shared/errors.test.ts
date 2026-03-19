/**
 * Tests for the custom error hierarchy.
 *
 * Verifies each error class: correct name, message, context, inheritance,
 * and that they are distinguishable via instanceof.
 */
// @ts-nocheck


import { describe, it, expect } from "vitest";
import {
  ForgeError,
  TemplateNotFoundError,
  ValidationError,
  FileSystemError,
  AnalysisError,
  TemplateParseError,
  DiscoveryError,
} from "../../src/shared/errors/index.js";

// ── ForgeError (base) ─────────────────────────────────────────────────

describe("ForgeError", () => {
  it("sets message and name", () => {
    const err = new ForgeError("base error");
    expect(err.message).toBe("base error");
    expect(err.name).toBe("ForgeError");
  });

  it("stores context", () => {
    const err = new ForgeError("msg", { foo: "bar" });
    expect(err.context).toEqual({ foo: "bar" });
  });

  it("defaults to empty context", () => {
    const err = new ForgeError("msg");
    expect(err.context).toEqual({});
  });

  it("is an instance of Error", () => {
    const err = new ForgeError("msg");
    expect(err instanceof Error).toBe(true);
  });
});

// ── TemplateNotFoundError ─────────────────────────────────────────────

describe("TemplateNotFoundError", () => {
  it("includes tag in message", () => {
    const err = new TemplateNotFoundError("WEB-REACT");
    expect(err.message).toContain("WEB-REACT");
  });

  it("includes section in message when provided", () => {
    const err = new TemplateNotFoundError("API", "nfr");
    expect(err.message).toContain("nfr");
  });

  it("stores tag in context", () => {
    const err = new TemplateNotFoundError("CLI");
    expect(err.context["tag"]).toBe("CLI");
  });

  it("has name TemplateNotFoundError", () => {
    expect(new TemplateNotFoundError("X").name).toBe("TemplateNotFoundError");
  });

  it("extends ForgeError", () => {
    expect(new TemplateNotFoundError("X") instanceof ForgeError).toBe(true);
  });
});

// ── ValidationError ───────────────────────────────────────────────────

describe("ValidationError", () => {
  it("sets message", () => {
    const err = new ValidationError("missing field");
    expect(err.message).toBe("missing field");
  });

  it("stores field in context when provided", () => {
    const err = new ValidationError("bad value", "project_dir");
    expect(err.context["field"]).toBe("project_dir");
  });

  it("has name ValidationError", () => {
    expect(new ValidationError("x").name).toBe("ValidationError");
  });

  it("extends ForgeError", () => {
    expect(new ValidationError("x") instanceof ForgeError).toBe(true);
  });
});

// ── FileSystemError ───────────────────────────────────────────────────

describe("FileSystemError", () => {
  it("sets message", () => {
    const err = new FileSystemError("file not found", "/some/path");
    expect(err.message).toBe("file not found");
  });

  it("stores filePath in context", () => {
    const err = new FileSystemError("fail", "/tmp/x.ts");
    expect(err.context["filePath"]).toBe("/tmp/x.ts");
  });

  it("has name FileSystemError", () => {
    expect(new FileSystemError("x", "/p").name).toBe("FileSystemError");
  });

  it("extends ForgeError", () => {
    expect(new FileSystemError("x", "/p") instanceof ForgeError).toBe(true);
  });
});

// ── AnalysisError ─────────────────────────────────────────────────────

describe("AnalysisError", () => {
  it("sets message", () => {
    const err = new AnalysisError("analysis failed");
    expect(err.message).toBe("analysis failed");
  });

  it("stores extra details in context", () => {
    const err = new AnalysisError("fail", { file: "package.json" });
    expect(err.context["file"]).toBe("package.json");
  });

  it("has name AnalysisError", () => {
    expect(new AnalysisError("x").name).toBe("AnalysisError");
  });

  it("extends ForgeError", () => {
    expect(new AnalysisError("x") instanceof ForgeError).toBe(true);
  });
});

// ── TemplateParseError ────────────────────────────────────────────────

describe("TemplateParseError", () => {
  it("includes reason in message", () => {
    const err = new TemplateParseError("/tmp/x.yaml", "bad indentation");
    expect(err.message).toContain("bad indentation");
  });

  it("stores filePath and reason in context", () => {
    const err = new TemplateParseError("/templates/api.yaml", "unexpected key");
    expect(err.context["filePath"]).toBe("/templates/api.yaml");
    expect(err.context["reason"]).toBe("unexpected key");
  });

  it("has name TemplateParseError", () => {
    expect(new TemplateParseError("/x", "y").name).toBe("TemplateParseError");
  });

  it("extends ForgeError", () => {
    expect(new TemplateParseError("/x", "y") instanceof ForgeError).toBe(true);
  });
});

// ── DiscoveryError ────────────────────────────────────────────────────

describe("DiscoveryError", () => {
  it("sets message", () => {
    const err = new DiscoveryError("registry unavailable");
    expect(err.message).toBe("registry unavailable");
  });

  it("stores url in context when provided", () => {
    const err = new DiscoveryError("timeout", "https://registry.example.com");
    expect(err.context["url"]).toBe("https://registry.example.com");
  });

  it("has name DiscoveryError", () => {
    expect(new DiscoveryError("x").name).toBe("DiscoveryError");
  });

  it("extends ForgeError", () => {
    expect(new DiscoveryError("x") instanceof ForgeError).toBe(true);
  });

  it("instanceof check distinguishes from other error subtypes", () => {
    const d = new DiscoveryError("x");
    expect(d instanceof TemplateNotFoundError).toBe(false);
    expect(d instanceof DiscoveryError).toBe(true);
  });
});
