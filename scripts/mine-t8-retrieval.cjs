/**
 * Mine T8 experiment transcripts: classify agentic retrieval (Read/Grep/Glob)
 * as harness vs docs vs code — the agentic analog of tokens-per-query in
 * Yarmoluk & McCreary's CKG benchmark (§9.3 transcript-walking methodology).
 */
const fs = require("fs");
const path = require("path");
const os = require("os");

const dir = path.join(
  os.homedir(),
  ".claude",
  "projects",
  "C--workspace-PragmaWorks-gs-generative-specification-experiments-ax-treatment-v8-output-project",
);

const files = fs.readdirSync(dir).filter((f) => f.endsWith(".jsonl"));
const stats = {
  harnessReads: 0,
  docReads: 0,
  codeReads: 0,
  otherReads: 0,
  searches: 0,
  harnessSearches: 0,
};
const harnessFiles = {};
const docFiles = {};
let totalTurnsWithUsage = 0;

for (const f of files) {
  const lines = fs.readFileSync(path.join(dir, f), "utf-8").split("\n");
  for (const line of lines) {
    if (!line.trim()) continue;
    let e;
    try {
      e = JSON.parse(line);
    } catch {
      continue;
    }
    if (e?.message?.usage) totalTurnsWithUsage++;
    const content = e?.message?.content;
    if (!Array.isArray(content)) continue;
    for (const c of content) {
      if (c.type !== "tool_use") continue;
      const inp = c.input || {};
      const raw = inp.file_path || inp.path || "";
      const p = String(raw).split("\\").join("/");
      if (c.name === "Read") {
        if (p.includes("/.claude/") || /CLAUDE\.md$/.test(p)) {
          stats.harnessReads++;
          const k = p.split("/").slice(-2).join("/");
          harnessFiles[k] = (harnessFiles[k] || 0) + 1;
        } else if (p.includes("/docs/")) {
          stats.docReads++;
          const k = p.split("/").slice(-2).join("/");
          docFiles[k] = (docFiles[k] || 0) + 1;
        } else if (/\/(src|tests|prisma)\//.test(p)) {
          stats.codeReads++;
        } else {
          stats.otherReads++;
        }
      }
      if (c.name === "Grep" || c.name === "Glob") {
        stats.searches++;
        if (p.includes(".claude") || p.includes("docs")) stats.harnessSearches++;
      }
    }
  }
}

const top = (obj, n) =>
  Object.entries(obj)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([k, v]) => `${k}:${v}`)
    .join("  ");

console.log("T8 agentic retrieval profile (11 sessions, all passes):");
console.log(JSON.stringify(stats, null, 2));
console.log("\nTop harness reads:", top(harnessFiles, 8));
console.log("Top doc reads:    ", top(docFiles, 8));
console.log("\nassistant turns with usage:", totalTurnsWithUsage);
