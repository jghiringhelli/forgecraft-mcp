/**
 * Tests for src/registry/remote-gates.ts
 *
 * Covers: filterGatesByTags, fetchRemoteGates (cache hits/misses, network failure), emptyIndex shape.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

// Must be imported after vi.mock setup — dynamic import used below
import {
  filterGatesByTags,
  fetchRemoteGates,
  type RemoteGate,
  type RemoteGatesIndex,
} from "../../src/registry/remote-gates.js";

function makeIndex(gates: RemoteGate[]): RemoteGatesIndex {
  return {
    generatedAt: "2024-01-01T00:00:00.000Z",
    version: "1",
    gateCount: gates.length,
    tags: [],
    gates,
  };
}

function makeGate(overrides: Partial<RemoteGate> = {}): RemoteGate {
  return {
    id: "test-gate",
    title: "Test Gate",
    description: "A test gate",
    category: "security",
    gsProperty: "correctness",
    phase: "build",
    hook: "pre-commit",
    check: "run check",
    passCriterion: "check passes",
    status: "approved",
    ...overrides,
  };
}

function makeTempDir(): string {
  const dir = join(tmpdir(), `remote-gates-test-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

describe("filterGatesByTags", () => {
  it("returns all gates when tags is empty", () => {
    const gates = [makeGate({ id: "g1" }), makeGate({ id: "g2" })];
    const index = makeIndex(gates);
    const result = filterGatesByTags(index, []);
    expect(result).toHaveLength(2);
  });

  it("returns only matching gates when tags provided", () => {
    const gates = [
      makeGate({ id: "g1", tags: ["FINTECH"] }),
      makeGate({ id: "g2", tags: ["HEALTHCARE"] }),
      makeGate({ id: "g3", tags: ["FINTECH", "API"] }),
    ];
    const index = makeIndex(gates);
    const result = filterGatesByTags(index, ["FINTECH"]);
    expect(result.map((g) => g.id)).toEqual(["g1", "g3"]);
  });

  it("returns gates with no tags field (treats as universal)", () => {
    const gates = [
      makeGate({ id: "g1" }), // no tags property
      makeGate({ id: "g2", tags: ["HEALTHCARE"] }),
    ];
    const index = makeIndex(gates);
    const result = filterGatesByTags(index, ["FINTECH"]);
    // g1 has no tags — treated as matching any
    expect(result.map((g) => g.id)).toContain("g1");
    expect(result.map((g) => g.id)).not.toContain("g2");
  });

  it("is case-insensitive (FINTECH matches fintech in gate)", () => {
    const gates = [
      makeGate({ id: "g1", tags: ["fintech"] }),
      makeGate({ id: "g2", tags: ["api"] }),
    ];
    const index = makeIndex(gates);
    const result = filterGatesByTags(index, ["FINTECH"]);
    expect(result.map((g) => g.id)).toEqual(["g1"]);
  });
});

describe("fetchRemoteGates", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = makeTempDir();
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it("returns empty index on network failure", async () => {
    vi.mocked(fetch).mockRejectedValue(new Error("Network error"));
    const result = await fetchRemoteGates(tempDir);
    expect(result.gateCount).toBe(0);
    expect(result.gates).toHaveLength(0);
    expect(result.version).toBe("1");
    expect(result.generatedAt).toBeDefined();
  });

  it("reads from cache when cache is fresh", async () => {
    const cachedIndex = makeIndex([makeGate({ id: "cached-gate" })]);
    const cacheEntry = {
      fetchedAt: new Date().toISOString(), // now = fresh
      data: cachedIndex,
    };
    const cacheDir = join(tempDir, ".forgecraft");
    mkdirSync(cacheDir, { recursive: true });
    writeFileSync(
      join(cacheDir, "gates-cache.json"),
      JSON.stringify(cacheEntry),
      "utf-8"
    );

    const result = await fetchRemoteGates(tempDir);
    expect(result.gates[0].id).toBe("cached-gate");
    // fetch should NOT have been called
    expect(fetch).not.toHaveBeenCalled();
  });

  it("ignores stale cache (>24h) and falls back to fetch", async () => {
    const staleDate = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
    const staleCacheEntry = {
      fetchedAt: staleDate,
      data: makeIndex([makeGate({ id: "stale-gate" })]),
    };
    const cacheDir = join(tempDir, ".forgecraft");
    mkdirSync(cacheDir, { recursive: true });
    writeFileSync(
      join(cacheDir, "gates-cache.json"),
      JSON.stringify(staleCacheEntry),
      "utf-8"
    );

    // Fetch throws — should get empty index (not stale cache)
    vi.mocked(fetch).mockRejectedValue(new Error("Network error"));
    const result = await fetchRemoteGates(tempDir);
    expect(fetch).toHaveBeenCalled();
    expect(result.gateCount).toBe(0);
    expect(result.gates).toHaveLength(0);
  });
});

describe("emptyIndex shape", () => {
  it("has correct shape with gateCount:0 and empty gates array", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("fail")));
    const tempDir2 = makeTempDir();
    try {
      const result = await fetchRemoteGates(tempDir2);
      expect(result).toMatchObject({
        version: "1",
        gateCount: 0,
        tags: [],
        gates: [],
      });
      expect(typeof result.generatedAt).toBe("string");
    } finally {
      rmSync(tempDir2, { recursive: true, force: true });
      vi.restoreAllMocks();
    }
  });
});
