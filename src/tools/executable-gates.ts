/**
 * Tag-driven executable gate matrix for the Executable Sprint phase.
 *
 * Each project tag maps to one or more verification tools. When `generate_roadmap`
 * runs, it reads the project's tags from forgecraft.yaml and selects the appropriate
 * gates. Gate files (hurl specs, Playwright tests, SQL scripts, WebSocket clients)
 * are written alongside the session prompt stubs so the AI has a runnable starting
 * point rather than prose instructions alone.
 */

// ── Gate definitions ─────────────────────────────────────────────────

/**
 * A single executable gate: the tool to use, where the gate file lives,
 * and how to generate the starter content.
 */
export interface ExecutableGate {
  /** Short tool identifier shown in roadmap and prompts */
  readonly tool: string;
  /** Human-readable description of what this gate verifies */
  readonly label: string;
  /** Relative path for the generated gate file. `{ucId}` is replaced at generation time. */
  readonly gatePathTemplate: string;
  /** Inline documentation URL shown in stubs */
  readonly docsUrl: string;
  /** Generate runnable stub content for a specific use case */
  readonly buildStub: (ucId: string, ucTitle: string) => string;
  /** One-line command to run all gates of this type */
  readonly runCommand: string;
}

// ── Gate implementations ─────────────────────────────────────────────

const hurlGate: ExecutableGate = {
  tool: "hurl",
  label: "HTTP contract verification (hurl)",
  gatePathTemplate: "tests/hurl/{ucId}.hurl",
  docsUrl: "https://hurl.dev",
  runCommand: "hurl --test tests/hurl/*.hurl",
  buildStub: (ucId, ucTitle) =>
    [
      `# Hurl gate — ${ucId}: ${ucTitle}`,
      `# Run: hurl --test tests/hurl/${ucId.toLowerCase()}.hurl`,
      `# Docs: https://hurl.dev`,
      ``,
      `# TODO: replace placeholders with actual endpoint, headers, and assertions`,
      ``,
      `POST http://localhost:3000/api/v1/TODO`,
      `Content-Type: application/json`,
      `{`,
      `  "TODO": "replace with request body"`,
      `}`,
      ``,
      `HTTP 201`,
      `[Asserts]`,
      `jsonpath "$.id" exists`,
      `jsonpath "$.TODO" isString`,
      ``,
    ].join("\n"),
};

const playwrightGate: ExecutableGate = {
  tool: "playwright",
  label: "UI end-to-end verification (Playwright)",
  gatePathTemplate: "tests/e2e/{ucId}.spec.ts",
  docsUrl: "https://playwright.dev",
  runCommand: "npx playwright test tests/e2e/",
  buildStub: (ucId, ucTitle) =>
    [
      `import { test, expect } from '@playwright/test';`,
      ``,
      `// Playwright gate — ${ucId}: ${ucTitle}`,
      `// Run: npx playwright test tests/e2e/${ucId.toLowerCase()}.spec.ts`,
      `// Docs: https://playwright.dev`,
      ``,
      `test('${ucId}: ${ucTitle}', async ({ page }) => {`,
      `  // 1. Navigate to the relevant page`,
      `  await page.goto('http://localhost:3000/TODO');`,
      ``,
      `  // 2. Interact: fill inputs, click buttons`,
      `  await page.fill('[data-testid="TODO"]', 'test value');`,
      `  await page.click('[data-testid="submit-TODO"]');`,
      ``,
      `  // 3. Assert UI response`,
      `  await expect(page.locator('[data-testid="success-TODO"]')).toBeVisible();`,
      ``,
      `  // 4. Confirm DB persistence (via API read-back or direct query)`,
      `  // TODO: add DB assertion or API read-back call here`,
      `});`,
      ``,
    ].join("\n"),
};

const sqlGate: ExecutableGate = {
  tool: "sql-client",
  label: "Database persistence verification (SQL)",
  gatePathTemplate: "tests/sql/{ucId}.sql",
  docsUrl: "https://www.postgresql.org/docs/current/app-psql.html",
  runCommand: "psql $DATABASE_URL -f tests/sql/*.sql",
  buildStub: (ucId, ucTitle) =>
    [
      `-- SQL gate — ${ucId}: ${ucTitle}`,
      `-- Run: psql $DATABASE_URL -f tests/sql/${ucId.toLowerCase()}.sql`,
      `-- Purpose: confirm expected state change persisted after the use-case operation`,
      ``,
      `-- TODO: replace with the actual table and conditions for this use case`,
      ``,
      `SELECT COUNT(*) AS row_count`,
      `FROM TODO_table`,
      `WHERE TODO_condition = 'expected_value';`,
      ``,
      `-- Expected: row_count >= 1`,
      `-- If 0, the operation did not persist correctly`,
      ``,
    ].join("\n"),
};

const websocketGate: ExecutableGate = {
  tool: "ws-client",
  label: "Real-time event delivery verification (WebSocket)",
  gatePathTemplate: "tests/realtime/{ucId}.ts",
  docsUrl: "https://github.com/websockets/ws",
  runCommand: "npx tsx tests/realtime/*.ts",
  buildStub: (ucId, ucTitle) =>
    [
      `import WebSocket from 'ws';`,
      ``,
      `// WebSocket gate — ${ucId}: ${ucTitle}`,
      `// Run: npx tsx tests/realtime/${ucId.toLowerCase()}.ts`,
      `// Docs: https://github.com/websockets/ws`,
      ``,
      `const ws = new WebSocket('ws://localhost:3000/TODO');`,
      ``,
      `ws.on('open', () => {`,
      `  // Trigger the event that should produce a real-time message`,
      `  ws.send(JSON.stringify({ type: 'TODO', payload: {} }));`,
      `});`,
      ``,
      `ws.on('message', (data) => {`,
      `  const msg = JSON.parse(data.toString());`,
      `  // TODO: assert expected message shape`,
      `  console.assert(msg.type === 'TODO', 'Expected event type TODO');`,
      `  ws.close();`,
      `  process.exit(0);`,
      `});`,
      ``,
      `setTimeout(() => { console.error('TIMEOUT: no message received'); process.exit(1); }, 5000);`,
      ``,
    ].join("\n"),
};

// ── Tag → gate matrix ─────────────────────────────────────────────────

// Game gates — three complementary verification types

const gameSimulationGate: ExecutableGate = {
  tool: "game-simulation",
  label: "Headless balance simulation (win rate, reachability, termination)",
  gatePathTemplate: "tests/simulation/{ucId}.sim.ts",
  docsUrl: "https://en.wikipedia.org/wiki/Monte_Carlo_method",
  runCommand: "npx tsx tests/simulation/*.sim.ts",
  buildStub: (ucId, ucTitle) =>
    [
      `// Headless simulation gate — ${ucId}: ${ucTitle}`,
      `// Run: npx tsx tests/simulation/${ucId.toLowerCase()}.sim.ts`,
      `//`,
      `// ARCHITECTURAL PREREQUISITE: this gate only works if game logic is`,
      `// separated from the rendering layer. If your engine cannot be imported`,
      `// and run without a renderer, the architecture is not yet correct.`,
      `// ForgeCraft's GAME template enforces this separation — your GameEngine`,
      `// must be a pure logic class with zero rendering dependencies.`,
      `// The ability to run this file IS the architecture proof.`,
      `//`,
      `// Three invariants every game must satisfy:`,
      `//   1. Termination  — a game always ends in bounded steps`,
      `//   2. Reachability — win state is reachable (win rate > floor)`,
      `//   3. Balance      — game is not trivially easy (win rate < ceiling)`,
      ``,
      `// TODO: import your engine and a headless player strategy`,
      `// import { GameEngine } from '../../src/engine/GameEngine';`,
      `// import { RandomPlayer } from '../../src/simulation/RandomPlayer';`,
      ``,
      `const RUNS = 1000;`,
      `const MAX_STEPS = 10_000;   // game must terminate within this many steps`,
      `const WIN_RATE_MIN = 0.05;  // at least 5% of games should be winnable`,
      `const WIN_RATE_MAX = 0.95;  // shouldn't be trivially easy`,
      ``,
      `let wins = 0;`,
      `let completions = 0;`,
      ``,
      `for (let i = 0; i < RUNS; i++) {`,
      `  // TODO: replace with your actual engine + player`,
      `  // const game = GameEngine.create();`,
      `  // const player = new RandomPlayer();`,
      `  // let steps = 0;`,
      `  //`,
      `  // while (!game.isOver() && steps < MAX_STEPS) {`,
      `  //   game.applyAction(player.chooseAction(game.getState()));`,
      `  //   steps++;`,
      `  // }`,
      `  // if (game.isOver()) completions++;`,
      `  // if (game.isWon()) wins++;`,
      `}`,
      ``,
      `const winRate = wins / RUNS;`,
      `const completionRate = completions / RUNS;`,
      ``,
      `console.assert(completionRate >= 0.99,`,
      `  \`FAIL: game did not terminate in \${MAX_STEPS} steps for \${((1 - completionRate) * 100).toFixed(1)}% of runs\`);`,
      `console.assert(winRate >= WIN_RATE_MIN,`,
      `  \`FAIL: win rate too low (\${(winRate * 100).toFixed(1)}%) — game may be unwinnable\`);`,
      `console.assert(winRate <= WIN_RATE_MAX,`,
      `  \`FAIL: win rate too high (\${(winRate * 100).toFixed(1)}%) — game is trivially easy\`);`,
      ``,
      `console.log(\`PASS: \${RUNS} runs — win rate \${(winRate * 100).toFixed(1)}%, completion \${(completionRate * 100).toFixed(1)}%\`);`,
      ``,
    ].join("\n"),
};

const gameStateIntegrityGate: ExecutableGate = {
  tool: "game-state",
  label: "Game state integrity (serialize / deserialize / invariants)",
  gatePathTemplate: "tests/state/{ucId}.state.ts",
  docsUrl: "https://en.wikipedia.org/wiki/State_(computer_science)",
  runCommand: "npx tsx tests/state/*.state.ts",
  buildStub: (ucId, ucTitle) =>
    [
      `// State integrity gate — ${ucId}: ${ucTitle}`,
      `// Run: npx tsx tests/state/${ucId.toLowerCase()}.state.ts`,
      `//`,
      `// Verifies:`,
      `//   1. Save/load round-trip produces identical state`,
      `//   2. State invariants hold after every transition`,
      `//   3. No illegal state is reachable from a valid initial state`,
      ``,
      `// TODO: import your state types and engine`,
      `// import { GameEngine, GameState } from '../../src/engine/GameEngine';`,
      ``,
      `// 1. Round-trip: serialize then deserialize = same state`,
      `// const initial = GameEngine.create().getState();`,
      `// const serialized = JSON.stringify(initial);`,
      `// const restored = GameEngine.fromState(JSON.parse(serialized)).getState();`,
      `// console.assert(JSON.stringify(restored) === serialized, 'FAIL: save/load round-trip mismatch');`,
      ``,
      `// 2. Invariant check: define what must always be true`,
      `// function assertInvariants(state: GameState): void {`,
      `//   // TODO: replace with actual invariants for ${ucId}`,
      `//   console.assert(state.score >= 0, 'score must be non-negative');`,
      `//   console.assert(state.lives >= 0, 'lives must be non-negative');`,
      `//   console.assert(Array.isArray(state.entities), 'entities must be an array');`,
      `// }`,
      ``,
      `// 3. Apply N random transitions, assert invariants hold throughout`,
      `// const engine = GameEngine.create();`,
      `// for (let step = 0; step < 1000 && !engine.isOver(); step++) {`,
      `//   engine.applyAction(engine.getValidActions()[0]);`,
      `//   assertInvariants(engine.getState());`,
      `// }`,
      ``,
      `console.log('PASS: ${ucId} state integrity verified');`,
      ``,
    ].join("\n"),
};

const gameInterfaceGate: ExecutableGate = {
  tool: "game-interface",
  label: "Game interface contracts (input handling, scoring, events)",
  gatePathTemplate: "tests/interfaces/{ucId}.iface.ts",
  docsUrl: "https://en.wikipedia.org/wiki/Software_interface",
  runCommand: "npx tsx tests/interfaces/*.iface.ts",
  buildStub: (ucId, ucTitle) =>
    [
      `// Interface contract gate — ${ucId}: ${ucTitle}`,
      `// Run: npx tsx tests/interfaces/${ucId.toLowerCase()}.iface.ts`,
      `//`,
      `// Verifies the interface contracts for this use case without rendering:`,
      `//   - Input handler accepts valid actions and rejects invalid ones`,
      `//   - Scoring function produces correct output for known inputs`,
      `//   - Event system fires the expected events for known transitions`,
      ``,
      `// TODO: import your interfaces`,
      `// import { InputHandler } from '../../src/input/InputHandler';`,
      `// import { ScoreEngine } from '../../src/scoring/ScoreEngine';`,
      `// import { EventBus } from '../../src/events/EventBus';`,
      ``,
      `// 1. Input contract: valid action accepted, invalid action rejected`,
      `// const handler = new InputHandler();`,
      `// console.assert(handler.isValid({ type: 'TODO_VALID_ACTION' }), 'FAIL: valid action rejected');`,
      `// console.assert(!handler.isValid({ type: 'INVALID' }), 'FAIL: invalid action accepted');`,
      ``,
      `// 2. Scoring contract: known input → known output`,
      `// const scorer = new ScoreEngine();`,
      `// console.assert(scorer.calculate({ TODO: 'known_input' }) === 0, 'FAIL: unexpected score');`,
      ``,
      `// 3. Event contract: transition fires expected event`,
      `// const bus = new EventBus();`,
      `// const fired: string[] = [];`,
      `// bus.on('TODO_EVENT', () => fired.push('TODO_EVENT'));`,
      `// // trigger the transition for ${ucId}`,
      `// console.assert(fired.includes('TODO_EVENT'), 'FAIL: expected event not fired');`,
      ``,
      `console.log('PASS: ${ucId} interface contracts verified');`,
      ``,
    ].join("\n"),
};

const TAG_GATE_MAP: Readonly<Record<string, ReadonlyArray<ExecutableGate>>> = {
  API: [hurlGate],
  "WEB-REACT": [playwrightGate],
  "WEB-STATIC": [playwrightGate],
  DATABASE: [sqlGate],
  REALTIME: [websocketGate],
  GAME: [gameSimulationGate, gameStateIntegrityGate, gameInterfaceGate],
  SOCIAL: [hurlGate],
  ANALYTICS: [hurlGate, sqlGate],
  AUTH: [hurlGate],
  FINTECH: [hurlGate, sqlGate],
  HEALTHCARE: [hurlGate, sqlGate],
};

/** Tags that always get the hurl gate as a fallback if no specific gate matched */
const HURL_FALLBACK_TAGS = new Set(["CLI", "LIBRARY", "INFRA", "MOBILE"]);

// ── Public API ────────────────────────────────────────────────────────

/**
 * Resolve the applicable executable gates for a project's tags.
 * Deduplicates by tool so a project tagged API+AUTH doesn't get two hurl gates.
 *
 * @param tags - Project classification tags from forgecraft.yaml
 * @returns Ordered, deduplicated list of applicable gates
 */
export function resolveExecutableGates(
  tags: ReadonlyArray<string>,
): ReadonlyArray<ExecutableGate> {
  const seen = new Set<string>();
  const gates: ExecutableGate[] = [];

  for (const tag of tags) {
    for (const gate of TAG_GATE_MAP[tag] ?? []) {
      if (!seen.has(gate.tool)) {
        seen.add(gate.tool);
        gates.push(gate);
      }
    }
  }

  // Fallback: if no gates resolved but tag is in fallback set, use hurl
  if (gates.length === 0 && tags.some((t) => HURL_FALLBACK_TAGS.has(t))) {
    gates.push(hurlGate);
  }

  // Universal fallback: always include hurl if nothing else matched
  if (gates.length === 0) {
    gates.push(hurlGate);
  }

  return gates;
}

/**
 * Format the gate file path for a specific use case.
 *
 * @param gate - The gate definition
 * @param ucId - Use-case ID (e.g. UC-001)
 * @returns Relative file path
 */
export function gateFilePath(gate: ExecutableGate, ucId: string): string {
  return gate.gatePathTemplate.replace("{ucId}", ucId.toLowerCase());
}

/**
 * Build a one-line summary of all active gates for inclusion in the roadmap
 * phase description header.
 *
 * @param gates - Resolved gates
 * @returns Comma-separated tool list string
 */
export function gateToolSummary(gates: ReadonlyArray<ExecutableGate>): string {
  return gates.map((g) => g.tool).join(", ");
}
