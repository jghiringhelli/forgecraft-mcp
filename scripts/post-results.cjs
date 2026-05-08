#!/usr/bin/env node
/**
 * post-results.cjs — Post forgecraft verify results to chronicle-team's contract.
 *
 * Usage:
 *   npm run post-results                                 # writes file only
 *   npm run post-results -- --to=https://team.url/api    # also POSTs
 *   npm run post-results -- --mr=MR-0042                 # tag with merge-request id
 *
 * Pipeline:
 *   1. Run `npx forgecraft-mcp verify .` (or read .forgecraft/verify-output.json if present)
 *   2. Parse the verify output (score, tier, pass)
 *   3. Map to chronicle-team's contract: { mrId, score, tier, pass, report, ts }
 *   4. Write to .forgecraft/post-results.json
 *   5. Optional: POST to a URL via --to flag or CHRONICLE_TEAM_URL env var
 *
 * Contract reference: chronicle-team/docs/use-cases/UC-0002-verify-merge-request.md
 *
 * No external deps — uses Node's built-in fetch (Node 18+) and child_process.
 */

const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const PROJECT_DIR = process.cwd();
const RESULTS_DIR = path.join(PROJECT_DIR, ".forgecraft");
const RESULTS_FILE = path.join(RESULTS_DIR, "post-results.json");
const CACHED_VERIFY = path.join(RESULTS_DIR, "verify-output.json");

// ── Parse args ───────────────────────────────────────────────────────────
const args = process.argv.slice(2);
let postUrl = process.env.CHRONICLE_TEAM_URL || null;
let mrId = null;
let runVerify = true;

for (const a of args) {
  if (a.startsWith("--to=")) postUrl = a.slice("--to=".length);
  else if (a.startsWith("--mr=")) mrId = a.slice("--mr=".length);
  else if (a === "--no-verify") runVerify = false;
}

// ── Get verify output (run or read cached) ───────────────────────────────
function getVerifyOutput() {
  if (!runVerify && fs.existsSync(CACHED_VERIFY)) {
    return JSON.parse(fs.readFileSync(CACHED_VERIFY, "utf8"));
  }

  console.log("Running forgecraft verify...");
  const result = spawnSync(
    "npx",
    ["forgecraft-mcp", "verify", PROJECT_DIR, "--json"],
    {
      encoding: "utf8",
      shell: process.platform === "win32",
      timeout: 180_000,
    },
  );

  if (result.status !== 0) {
    console.error("Verify failed:", result.stderr || result.stdout);
    // If verify exited non-zero but produced output, still try to parse it.
  }

  const stdout = result.stdout || "";
  // Find the JSON block in the output (verify may print human-readable text first).
  const jsonMatch = stdout.match(/\{[\s\S]*"score"[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("Could not find verify JSON output. Run `verify` manually first.");
  }
  return JSON.parse(jsonMatch[0]);
}

// ── Map to chronicle-team contract ──────────────────────────────────────
function mapToContract(verify, mrId) {
  return {
    contract_version: 1,
    mrId: mrId || autodetectMrId(),
    forgecraftScore: verify.score ?? null,                      // 0–14
    forgecraftTier: verify.tier ?? null,                        // 1–5
    forgecraftPass: verify.pass ?? false,
    forgecraftReport: verify.report || verify.summary || "",
    properties: verify.properties || verify.gs_properties || {},
    ts: new Date().toISOString(),
    project: {
      name: readPackageName(),
      branch: gitBranch(),
      commit: gitCommit(),
    },
  };
}

function autodetectMrId() {
  // Try to derive from current branch name (e.g., feat/RM-0042 → MR-0042)
  const branch = gitBranch();
  const match = branch && branch.match(/(?:RM|MR|PR)-?(\d+)/i);
  return match ? `MR-${match[1].padStart(4, "0")}` : null;
}

function readPackageName() {
  try {
    return JSON.parse(fs.readFileSync(path.join(PROJECT_DIR, "package.json"), "utf8")).name;
  } catch {
    return path.basename(PROJECT_DIR);
  }
}

function gitBranch() {
  const r = spawnSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], { encoding: "utf8", cwd: PROJECT_DIR });
  return (r.stdout || "").trim();
}

function gitCommit() {
  const r = spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf8", cwd: PROJECT_DIR });
  return (r.stdout || "").trim().slice(0, 12);
}

// ── POST to chronicle-team ──────────────────────────────────────────────
async function postToChronicle(payload, url) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw new Error(`POST ${url} failed: ${res.status} ${res.statusText}`);
  }
  return await res.text();
}

// ── Main ─────────────────────────────────────────────────────────────────
(async () => {
  try {
    const verify = getVerifyOutput();
    const payload = mapToContract(verify, mrId);

    fs.mkdirSync(RESULTS_DIR, { recursive: true });
    fs.writeFileSync(RESULTS_FILE, JSON.stringify(payload, null, 2) + "\n");
    console.log(`✅ Wrote ${RESULTS_FILE}`);
    console.log(`   score=${payload.forgecraftScore}  tier=${payload.forgecraftTier}  pass=${payload.forgecraftPass}  mrId=${payload.mrId}`);

    if (postUrl) {
      console.log(`📤 POSTing to ${postUrl}...`);
      const response = await postToChronicle(payload, postUrl);
      console.log(`   Response: ${response.slice(0, 200)}`);
    } else {
      console.log("   (no --to URL provided; not POSTing. Set CHRONICLE_TEAM_URL or pass --to=<url>)");
    }
  } catch (e) {
    console.error("❌ post-results failed:", e.message);
    process.exit(1);
  }
})();
