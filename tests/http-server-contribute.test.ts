import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import express from "express";
import type { Express } from "express";

// ── Test-only server factory ──────────────────────────────────────────
// We can't import the live http-server.ts (it calls app.listen at module load).
// Instead we re-export a createApp() factory from the server and test it here.
// For now, import the route handlers under test via a helper we'll add.

// Stub the GitHub API fetch so tests don't make real network calls.
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// Import the handler after stubbing fetch
const { createContributeGateRouter } =
  await import("../src/http-server-contribute.js");

function buildApp(): Express {
  const app = express();
  app.use(express.json());
  app.use(createContributeGateRouter());
  return app;
}

const VALID_PAYLOAD = {
  gate: {
    id: "no-raw-sql",
    title: "No raw SQL in route handlers",
    evidence: "Would have caught injection in prod-2024-03.",
  },
  mode: "anonymous",
};

// ── Tests ─────────────────────────────────────────────────────────────

describe("POST /contribute/gate", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    delete process.env.GITHUB_TOKEN;
  });

  it("returns 503 when GITHUB_TOKEN is not set", async () => {
    delete process.env.GITHUB_TOKEN;
    const app = buildApp();
    const { default: supertest } = await import("supertest");
    const res = await supertest(app)
      .post("/contribute/gate")
      .send(VALID_PAYLOAD);
    expect(res.status).toBe(503);
    expect(res.body.error).toMatch(/GITHUB_TOKEN/);
  });

  it("returns 422 when gate payload is missing evidence", async () => {
    process.env.GITHUB_TOKEN = "test-token";
    const app = buildApp();
    const { default: supertest } = await import("supertest");
    const res = await supertest(app)
      .post("/contribute/gate")
      .send({ gate: { id: "no-evidence" }, mode: "anonymous" });
    expect(res.status).toBe(422);
  });

  it("returns 200 with issueUrl when GitHub API succeeds", async () => {
    process.env.GITHUB_TOKEN = "test-token";
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        number: 42,
        html_url: "https://github.com/jghiringhelli/quality-gates/issues/42",
      }),
    });

    const app = buildApp();
    const { default: supertest } = await import("supertest");
    const res = await supertest(app)
      .post("/contribute/gate")
      .send(VALID_PAYLOAD);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("submitted");
    expect(res.body.issueUrl).toBe(
      "https://github.com/jghiringhelli/quality-gates/issues/42",
    );
  });

  it("returns 429 when the same IP exceeds the rate limit", async () => {
    process.env.GITHUB_TOKEN = "test-token";
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        number: 1,
        html_url: "https://github.com/jghiringhelli/quality-gates/issues/1",
      }),
    });

    // Build app with limit=2 so we can hit it in tests without 5+ requests
    const { default: supertest } = await import("supertest");
    const appWithLowLimit = express();
    appWithLowLimit.use(express.json());
    appWithLowLimit.use(
      createContributeGateRouter({ maxRequestsPerWindow: 2 }),
    );

    const st = supertest(appWithLowLimit);
    await st.post("/contribute/gate").send(VALID_PAYLOAD); // 1
    await st.post("/contribute/gate").send(VALID_PAYLOAD); // 2
    const res = await st.post("/contribute/gate").send(VALID_PAYLOAD); // 3 — over limit

    expect(res.status).toBe(429);
  });

  it("returns 502 when GitHub API returns an error status", async () => {
    process.env.GITHUB_TOKEN = "test-token";
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 403,
      text: async () => "Forbidden",
    });

    const app = buildApp();
    const { default: supertest } = await import("supertest");
    const res = await supertest(app)
      .post("/contribute/gate")
      .send(VALID_PAYLOAD);

    expect(res.status).toBe(502);
  });
});
