/**
 * ForgeCraft — Gate Contribution Route.
 *
 * Extracted from http-server.ts so it can be unit-tested without
 * starting a live Express server (which calls app.listen at module load).
 *
 * Usage:
 *   app.use(createContributeGateRouter())
 */

import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";

const QUALITY_GATES_REPO = "jghiringhelli/quality-gates";
const GITHUB_API = "https://api.github.com";

const gateContributionSchema = z.object({
  gate: z.object({
    id: z.string(),
    title: z.string().optional(),
    description: z.string().optional(),
    domain: z.string().optional(),
    gsProperty: z.string().optional(),
    phase: z.string().optional(),
    hook: z.string().optional(),
    check: z.string().optional(),
    passCriterion: z.string().optional(),
    tags: z.array(z.string()).optional(),
    evidence: z.string(),
    convergenceAttributes: z.record(z.boolean()).optional(),
  }),
  mode: z.enum(["anonymous", "attributed"]),
  attribution: z
    .object({
      github: z.string().optional(),
      projectType: z.string().optional(),
    })
    .optional(),
  experimentId: z.string().optional(),
});

type GateContributionPayload = z.infer<typeof gateContributionSchema>;

/**
 * Formats a gate proposal as a GitHub Issue body in Markdown.
 */
function formatIssueBody(payload: GateContributionPayload): string {
  const { gate, mode, attribution, experimentId } = payload;
  const lines: string[] = [
    `## Gate Proposal: \`${gate.id}\``,
    "",
    `**Mode:** ${mode}`,
  ];

  if (mode === "attributed" && attribution?.github) {
    lines.push(`**Contributor:** @${attribution.github}`);
  }
  if (attribution?.projectType) {
    lines.push(`**Project type:** ${attribution.projectType}`);
  }
  if (experimentId) {
    lines.push(`**Experiment:** \`${experimentId}\``);
  }

  lines.push("", "---", "");

  if (gate.title) lines.push(`### ${gate.title}`, "");
  if (gate.description) lines.push(gate.description, "");

  const fields: Array<[string, string | undefined]> = [
    ["GS Property", gate.gsProperty],
    ["Phase", gate.phase],
    ["Hook", gate.hook],
    ["Domain", gate.domain],
    ["Tags", gate.tags?.join(", ")],
  ];
  const populated = fields.filter(([, v]) => v);
  if (populated.length > 0) {
    lines.push("| Field | Value |", "|---|---|");
    for (const [k, v] of populated) lines.push(`| ${k} | ${v} |`);
    lines.push("");
  }

  if (gate.check) {
    lines.push("**Check:**", "```", gate.check, "```", "");
  }
  if (gate.passCriterion) {
    lines.push(`**Pass criterion:** ${gate.passCriterion}`, "");
  }
  if (gate.evidence) {
    lines.push("**Evidence:**", gate.evidence, "");
  }
  if (gate.convergenceAttributes) {
    const attrs = Object.entries(gate.convergenceAttributes)
      .map(([k, v]) => `- ${k}: ${v ? "✅" : "❌"}`)
      .join("\n");
    lines.push("**Convergence attributes:**", attrs, "");
  }

  lines.push(
    "---",
    "_Submitted via ForgeCraft `contribute_gate`. Review and label `approved` to graduate._",
  );

  return lines.join("\n");
}

export interface ContributeGateRouterOptions {
  /** Max gate proposals per IP per 15-minute window. Default: 5. */
  maxRequestsPerWindow?: number;
}

/**
 * Creates an Express Router with POST /contribute/gate.
 * Requires GITHUB_TOKEN env var at request time.
 * Rate-limited to maxRequestsPerWindow per IP per 15 minutes.
 */
export function createContributeGateRouter(
  options: ContributeGateRouterOptions = {},
): Router {
  const { maxRequestsPerWindow = 5 } = options;
  const router = Router();

  router.use(
    rateLimit({
      windowMs: 15 * 60 * 1000,
      max: maxRequestsPerWindow,
      standardHeaders: true,
      legacyHeaders: false,
      message: {
        error:
          "Too many gate proposals from this IP. Please wait before submitting again.",
      },
    }),
  );

  router.post("/contribute/gate", async (req, res) => {
    const githubToken = process.env.GITHUB_TOKEN;
    if (!githubToken) {
      res.status(503).json({
        error: "Gate contributions unavailable: GITHUB_TOKEN not set",
      });
      return;
    }

    const parsed = gateContributionSchema.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(422)
        .json({ error: "Invalid payload", details: parsed.error.flatten() });
      return;
    }

    const { gate, mode, attribution } = parsed.data;
    const title = `[Gate Proposal] ${gate.id}${
      mode === "attributed" && attribution?.github
        ? ` — @${attribution.github}`
        : ""
    }`;
    const body = formatIssueBody(parsed.data);
    const labels = ["gate-proposal", "quarantine", "status:pending-review"];

    try {
      const response = await fetch(
        `${GITHUB_API}/repos/${QUALITY_GATES_REPO}/issues`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${githubToken}`,
            Accept: "application/vnd.github+json",
            "Content-Type": "application/json",
            "X-GitHub-Api-Version": "2022-11-28",
          },
          body: JSON.stringify({ title, body, labels }),
          signal: AbortSignal.timeout(10000),
        },
      );

      if (!response.ok) {
        const err = await response.text();
        console.error(`GitHub API error ${response.status}: ${err}`);
        res
          .status(502)
          .json({ error: "GitHub API error", status: response.status });
        return;
      }

      const issue = (await response.json()) as {
        number: number;
        html_url: string;
      };
      console.log(`Gate proposal submitted: ${gate.id} → ${issue.html_url}`);

      res.status(200).json({
        status: "submitted",
        issueUrl: issue.html_url,
        issueNumber: issue.number,
      });
    } catch (err) {
      console.error("Gate contribution failed:", err);
      res.status(503).json({ error: "Failed to reach GitHub API" });
    }
  });

  return router;
}
