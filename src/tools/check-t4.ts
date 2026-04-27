/**
 * check_t4 tool handler.
 *
 * Surfaces pending T4 production signals at session start. Reads
 * .forgecraft/t4-signals.json written by forgecraft-eye, formats each
 * signal as a spec update candidate, and guides the practitioner through
 * the diagnosis → spec update → rederivation cycle.
 *
 * Run at the start of any development session to check whether production
 * has produced specification-level diagnoses since the last session.
 */

import { z } from "zod";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { ToolResult } from "../shared/types.js";

// ── Schema ───────────────────────────────────────────────────────────

export const checkT4Schema = z.object({
  project_dir: z.string().describe("Absolute path to the project root."),
  acknowledge: z
    .string()
    .optional()
    .describe(
      "Signal ID to mark as acknowledged (e.g., 'sig-20260424-143022-001').",
    ),
  resolve: z
    .string()
    .optional()
    .describe(
      "Signal ID to mark as resolved (spec update applied and deployed).",
    ),
  show_resolved: z
    .boolean()
    .optional()
    .describe("Include resolved signals in output. Default: false."),
});

export type CheckT4Input = z.infer<typeof checkT4Schema>;

// ── Types ─────────────────────────────────────────────────────────────

export type SignalSeverity = "critical" | "warning" | "info";
export type SignalStatus = "pending" | "acknowledged" | "resolved";

export interface T4Signal {
  id: string;
  timestamp: string;
  exception_class: string;
  severity: SignalSeverity;
  gs_property: string;
  spec_ref: string;
  diagnosis: string;
  suggested_update: string;
  status: SignalStatus;
  correlation_id?: string;
  service?: string;
  environment?: string;
  acknowledged_at?: string;
  resolved_at?: string;
}

export interface T4SignalQueue {
  signals: T4Signal[];
  last_updated?: string;
}

// ── Queue helpers ─────────────────────────────────────────────────────

function queuePath(projectDir: string): string {
  return join(projectDir, ".forgecraft", "t4-signals.json");
}

function readQueue(projectDir: string): T4SignalQueue {
  const path = queuePath(projectDir);
  if (!existsSync(path)) return { signals: [] };
  try {
    const raw = readFileSync(path, "utf-8");
    return JSON.parse(raw) as T4SignalQueue;
  } catch {
    return { signals: [] };
  }
}

function writeQueue(projectDir: string, queue: T4SignalQueue): void {
  const path = queuePath(projectDir);
  const updated: T4SignalQueue = {
    ...queue,
    last_updated: new Date().toISOString(),
  };
  writeFileSync(path, JSON.stringify(updated, null, 2), "utf-8");
}

// ── Formatters ────────────────────────────────────────────────────────

function severityIcon(severity: SignalSeverity): string {
  switch (severity) {
    case "critical":
      return "🔴";
    case "warning":
      return "🟡";
    case "info":
      return "🔵";
  }
}

function statusIcon(status: SignalStatus): string {
  switch (status) {
    case "pending":
      return "⏳ pending";
    case "acknowledged":
      return "👁 acknowledged";
    case "resolved":
      return "✅ resolved";
  }
}

function formatSignal(signal: T4Signal, index: number): string[] {
  const lines: string[] = [
    `### Signal ${index + 1}: ${severityIcon(signal.severity)} ${signal.exception_class}`,
    "",
    `**ID:** \`${signal.id}\`  **Status:** ${statusIcon(signal.status)}`,
    `**Timestamp:** ${signal.timestamp}${signal.service ? `  **Service:** ${signal.service}` : ""}`,
    "",
    `**GS Property Violated:** ${signal.gs_property}`,
    `**Spec Location:** \`${signal.spec_ref}\``,
    "",
    "**Diagnosis:**",
    `> ${signal.diagnosis}`,
    "",
    "**Suggested Spec Update:**",
    `> ${signal.suggested_update}`,
    "",
  ];

  if (signal.correlation_id) {
    lines.push(`**Correlation ID:** \`${signal.correlation_id}\``, "");
  }

  if (signal.status === "pending") {
    lines.push(
      "**Actions:**",
      `- To acknowledge: \`forgecraft check_t4 acknowledge="${signal.id}"\``,
      `- To resolve after spec update: \`forgecraft check_t4 resolve="${signal.id}"\``,
      "",
    );
  }

  lines.push("---", "");
  return lines;
}

function buildChronicleQuery(projectName: string): string {
  return [
    "## Chronicle Query (if configured)",
    "",
    "If forgecraft-eye is writing to Chronicle, retrieve signals with:",
    "```",
    "chronicle recall",
    `  query: "t4 signal specification violation"`,
    `  tags: ["t4-signal", "${projectName}"]`,
    '  memory_types: ["architectural"]',
    '  tiers: ["core"]',
    "```",
    "",
  ].join("\n");
}

// ── Handler ───────────────────────────────────────────────────────────

export async function checkT4Handler(args: CheckT4Input): Promise<ToolResult> {
  const projectDir = resolve(args.project_dir);
  const showResolved = args.show_resolved ?? false;

  const queue = readQueue(projectDir);
  const projectName = projectDir.split(/[\\/]/).pop() ?? "project";

  // Handle acknowledge action
  if (args.acknowledge) {
    const signal = queue.signals.find((s) => s.id === args.acknowledge);
    if (!signal) {
      return {
        content: [
          {
            type: "text",
            text: `Signal \`${args.acknowledge}\` not found in queue.`,
          },
        ],
      };
    }
    signal.status = "acknowledged";
    signal.acknowledged_at = new Date().toISOString();
    writeQueue(projectDir, queue);
    return {
      content: [
        {
          type: "text",
          text: [
            `✅ Signal \`${args.acknowledge}\` marked as acknowledged.`,
            "",
            "The diagnosis is noted. After updating the specification and redeploying:",
            `\`forgecraft check_t4 resolve="${args.acknowledge}"\``,
          ].join("\n"),
        },
      ],
    };
  }

  // Handle resolve action
  if (args.resolve) {
    const signal = queue.signals.find((s) => s.id === args.resolve);
    if (!signal) {
      return {
        content: [
          {
            type: "text",
            text: `Signal \`${args.resolve}\` not found in queue.`,
          },
        ],
      };
    }
    signal.status = "resolved";
    signal.resolved_at = new Date().toISOString();
    writeQueue(projectDir, queue);
    return {
      content: [
        {
          type: "text",
          text: [
            `✅ Signal \`${args.resolve}\` marked as resolved.`,
            "",
            "The T4 loop is complete for this signal:",
            "production exception → spec diagnosis → spec update → rederivation → verified deployment.",
          ].join("\n"),
        },
      ],
    };
  }

  // No queue file at all
  if (!existsSync(queuePath(projectDir))) {
    return {
      content: [
        {
          type: "text",
          text: [
            "## T4 Signal Check",
            "",
            "No signal queue found at `.forgecraft/t4-signals.json`.",
            "",
            "This means either:",
            "- forgecraft-eye has not yet been deployed to production",
            "- No qualifying exceptions have fired since deployment",
            "- The queue was already cleared",
            "",
            "## Setup forgecraft-eye",
            "",
            "1. Generate the monitoring contract and eye config:",
            "   ```",
            "   forgecraft setup_monitoring",
            "   ```",
            "",
            "2. Install the diagnostic agent:",
            "   ```bash",
            "   npm install forgecraft-eye",
            "   ```",
            "",
            "3. Pipe production logs through it:",
            "   ```bash",
            "   my-service 2>&1 | npx forgecraft-eye",
            "   ```",
            "   Or use programmatically:",
            "   ```typescript",
            "   import { runEyeFromConfig } from 'forgecraft-eye';",
            "   await runEyeFromConfig(projectDir);",
            "   ```",
            "",
            "4. Signals are written to `.forgecraft/t4-signals.json`.",
            "   Run `forgecraft check_t4` at the next session start.",
            "",
            "npm: https://www.npmjs.com/package/forgecraft-eye",
            "Source: https://github.com/jghiringhelli/forgecraft-eye",
            "",
            buildChronicleQuery(projectName),
          ].join("\n"),
        },
      ],
    };
  }

  const visibleSignals = showResolved
    ? queue.signals
    : queue.signals.filter((s) => s.status !== "resolved");

  const pending = queue.signals.filter((s) => s.status === "pending");
  const acknowledged = queue.signals.filter((s) => s.status === "acknowledged");
  const resolved = queue.signals.filter((s) => s.status === "resolved");
  const critical = pending.filter((s) => s.severity === "critical");

  const lines: string[] = [
    "## T4 Signal Check",
    "",
    `**Queue:** ${pending.length} pending / ${acknowledged.length} acknowledged / ${resolved.length} resolved`,
  ];

  if (queue.last_updated) {
    lines.push(`**Last updated:** ${queue.last_updated}`);
  }

  lines.push("");

  if (critical.length > 0) {
    lines.push(
      `> 🔴 **${critical.length} critical signal${critical.length === 1 ? "" : "s"} require immediate spec attention.**`,
      "",
    );
  }

  if (visibleSignals.length === 0) {
    lines.push(
      "No pending signals. Production is behaving within specification.",
      "",
      resolved.length > 0
        ? `(${resolved.length} resolved signals hidden. Pass \`show_resolved: true\` to display.)`
        : "",
    );
  } else {
    lines.push(
      "The following production signals require specification updates.",
      "Each signal represents a gap in the specification — not a code bug.",
      "Update the spec first; the AI derives the fix.",
      "",
    );

    for (const [i, signal] of visibleSignals.entries()) {
      lines.push(...formatSignal(signal, i));
    }
  }

  // Monitoring spec status
  const monitoringSpecPath = join(projectDir, "docs", "monitoring-spec.md");
  if (!existsSync(monitoringSpecPath)) {
    lines.push(
      "---",
      "",
      "⚠️  `docs/monitoring-spec.md` not found.",
      "Run `forgecraft setup_monitoring` to generate the production contract.",
      "",
    );
  }

  lines.push(buildChronicleQuery(projectName));

  // Cycle guidance if signals present
  if (pending.length > 0) {
    lines.push(
      "## The T4 → T1 Cycle",
      "",
      "For each pending signal:",
      "1. Read the diagnosis and suggested spec update above",
      "2. Open the referenced spec file (`spec_ref`) and apply the update",
      "3. Run `forgecraft generate_session_prompt` to derive the fix from the updated spec",
      "4. Let the AI derive the code change — do not patch directly",
      "5. Run the harness: `forgecraft run_harness`",
      '6. Deploy and verify the T4 loop closed: `forgecraft check_t4 resolve="<id>"`',
    );
  }

  return {
    content: [
      { type: "text", text: lines.filter((l) => l !== undefined).join("\n") },
    ],
  };
}
