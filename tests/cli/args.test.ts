import { describe, it, expect } from "vitest";
import { parseCliArgs, str, arr, bool } from "../../src/cli/args.js";

describe("parseCliArgs", () => {
  describe("command extraction", () => {
    it("extracts command from first argument", () => {
      expect(parseCliArgs(["audit", "/tmp/project"]).command).toBe("audit");
    });

    it("defaults to 'serve' when no arguments given", () => {
      expect(parseCliArgs([]).command).toBe("serve");
    });

    it("returns empty positional and flags for a bare command", () => {
      const result = parseCliArgs(["audit"]);
      expect(result.positional).toEqual([]);
      expect(result.flags).toEqual({});
    });
  });

  describe("positional arguments", () => {
    it("collects positional args before flags", () => {
      const result = parseCliArgs(["audit", "/tmp/project"]);
      expect(result.positional).toEqual(["/tmp/project"]);
    });

    it("collects multiple positional args", () => {
      const result = parseCliArgs(["scaffold", "/dir", "other"]);
      expect(result.positional).toEqual(["/dir", "other"]);
    });

    it("non-flag arg after a value-flag is consumed as the flag's value, not positional", () => {
      const result = parseCliArgs(["audit", "--json", "/tmp/project"]);
      expect(result.flags["json"]).toEqual(["/tmp/project"]);
      expect(result.positional).toEqual([]);
    });
  });

  describe("boolean flags", () => {
    it("parses --flag alone as true", () => {
      const result = parseCliArgs(["audit", "--json"]);
      expect(result.flags["json"]).toBe(true);
    });

    it("parses --no-flag as false", () => {
      const result = parseCliArgs(["audit", "--no-anti-patterns"]);
      expect(result.flags["anti-patterns"]).toBe(false);
    });

    it("parses multiple boolean flags", () => {
      const result = parseCliArgs(["audit", "--json", "--dry-run"]);
      expect(result.flags["json"]).toBe(true);
      expect(result.flags["dry-run"]).toBe(true);
    });
  });

  describe("value flags", () => {
    it("parses --flag value as array with one element", () => {
      const result = parseCliArgs(["scaffold", "--language", "typescript"]);
      expect(result.flags["language"]).toEqual(["typescript"]);
    });

    it("parses --flag val1 val2 as array", () => {
      const result = parseCliArgs(["generate", "--tags", "API", "CLI"]);
      expect(result.flags["tags"]).toEqual(["API", "CLI"]);
    });

    it("stops collecting values at the next --flag", () => {
      const result = parseCliArgs(["generate", "--tags", "API", "--json"]);
      expect(result.flags["tags"]).toEqual(["API"]);
      expect(result.flags["json"]).toBe(true);
    });

    it("parses multiple value flags independently", () => {
      const result = parseCliArgs([
        "refresh",
        "--add-tags",
        "API",
        "CLI",
        "--remove-tags",
        "WEB",
      ]);
      expect(result.flags["add-tags"]).toEqual(["API", "CLI"]);
      expect(result.flags["remove-tags"]).toEqual(["WEB"]);
    });
  });

  describe("mixed input", () => {
    it("bare boolean flag followed by positional-style value consumes value as flag value", () => {
      const result = parseCliArgs(["audit", "--json", "/my/project"]);
      expect(result.flags["json"]).toEqual(["/my/project"]);
    });

    it("handles all three types together", () => {
      const result = parseCliArgs([
        "refresh",
        "/project",
        "--add-tags",
        "API",
        "--apply",
        "--no-check",
      ]);
      expect(result.command).toBe("refresh");
      expect(result.positional).toEqual(["/project"]);
      expect(result.flags["add-tags"]).toEqual(["API"]);
      expect(result.flags["apply"]).toBe(true);
      expect(result.flags["check"]).toBe(false);
    });
  });
});

describe("str helper", () => {
  it("returns first element of an array flag", () => {
    const flags = { lang: ["typescript"] };
    expect(str(flags, "lang")).toBe("typescript");
  });

  it("returns first element when array has multiple values", () => {
    const flags = { tags: ["API", "CLI"] };
    expect(str(flags, "tags")).toBe("API");
  });

  it("returns undefined for boolean flag", () => {
    const flags = { json: true };
    expect(str(flags, "json")).toBeUndefined();
  });

  it("returns undefined for missing flag", () => {
    expect(str({}, "missing")).toBeUndefined();
  });
});

describe("arr helper", () => {
  it("returns array for array flag", () => {
    const flags = { tags: ["API", "CLI"] };
    expect(arr(flags, "tags")).toEqual(["API", "CLI"]);
  });

  it("returns undefined for boolean flag", () => {
    const flags = { json: true };
    expect(arr(flags, "json")).toBeUndefined();
  });

  it("returns undefined for missing flag", () => {
    expect(arr({}, "missing")).toBeUndefined();
  });

  it("returns undefined for empty array", () => {
    const flags = { tags: [] as string[] };
    expect(
      arr(flags as Record<string, string[] | boolean>, "tags"),
    ).toBeUndefined();
  });
});

describe("bool helper", () => {
  it("returns true for boolean true flag", () => {
    expect(bool({ json: true }, "json", false)).toBe(true);
  });

  it("returns false for boolean false flag (--no-*)", () => {
    expect(bool({ check: false }, "check", true)).toBe(false);
  });

  it("returns defaultVal when flag is absent", () => {
    expect(bool({}, "json", false)).toBe(false);
    expect(bool({}, "json", true)).toBe(true);
  });

  it("returns defaultVal when flag is an array (not boolean)", () => {
    const flags = { tags: ["API"] };
    expect(bool(flags, "tags", false)).toBe(false);
  });
});
