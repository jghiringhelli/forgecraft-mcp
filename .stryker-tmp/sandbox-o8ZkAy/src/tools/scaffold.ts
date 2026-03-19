/**
 * scaffold_project tool handler.
 *
 * Generates full project structure from classified tags.
 * Skips existing files by default to avoid overwriting user content.
 */
// @ts-nocheck
function stryNS_9fa48() {
  var g = typeof globalThis === 'object' && globalThis && globalThis.Math === Math && globalThis || new Function("return this")();
  var ns = g.__stryker__ || (g.__stryker__ = {});
  if (ns.activeMutant === undefined && g.process && g.process.env && g.process.env.__STRYKER_ACTIVE_MUTANT__) {
    ns.activeMutant = g.process.env.__STRYKER_ACTIVE_MUTANT__;
  }
  function retrieveNS() {
    return ns;
  }
  stryNS_9fa48 = retrieveNS;
  return retrieveNS();
}
stryNS_9fa48();
function stryCov_9fa48() {
  var ns = stryNS_9fa48();
  var cov = ns.mutantCoverage || (ns.mutantCoverage = {
    static: {},
    perTest: {}
  });
  function cover() {
    var c = cov.static;
    if (ns.currentTestId) {
      c = cov.perTest[ns.currentTestId] = cov.perTest[ns.currentTestId] || {};
    }
    var a = arguments;
    for (var i = 0; i < a.length; i++) {
      c[a[i]] = (c[a[i]] || 0) + 1;
    }
  }
  stryCov_9fa48 = cover;
  cover.apply(null, arguments);
}
function stryMutAct_9fa48(id) {
  var ns = stryNS_9fa48();
  function isActive(id) {
    if (ns.activeMutant === id) {
      if (ns.hitCount !== void 0 && ++ns.hitCount > ns.hitLimit) {
        throw new Error('Stryker: Hit count limit reached (' + ns.hitCount + ')');
      }
      return true;
    }
    return false;
  }
  stryMutAct_9fa48 = isActive;
  return isActive(id);
}
import { z } from "zod";
import { mkdirSync, chmodSync } from "node:fs";
import { join, dirname } from "node:path";
import { ALL_TAGS, ALL_OUTPUT_TARGETS, OUTPUT_TARGET_CONFIGS, DEFAULT_OUTPUT_TARGET } from "../shared/types.js";
import type { Tag, ScaffoldResult, OutputTarget } from "../shared/types.js";
import { loadAllTemplatesWithExtras, loadUserOverrides } from "../registry/loader.js";
import { composeTemplates } from "../registry/composer.js";
import { renderInstructionFile, renderSkill, renderStatusMd, renderPrdSkeleton, renderTechSpecSkeleton } from "../registry/renderer.js";
import { renderSentinelTree } from "../registry/sentinel-renderer.js";
import { writeFileIfMissing, checkGitSafety } from "../shared/filesystem.js";
import { detectProjectContext } from "../analyzers/project-context.js";
import { createLogger } from "../shared/logger/index.js";
const logger = createLogger(stryMutAct_9fa48("645") ? "" : (stryCov_9fa48("645"), "tools/scaffold"));

/** Template for the user-owned project-specific rules file. Never overwritten. */
const PROJECT_SPECIFIC_TEMPLATE = stryMutAct_9fa48("646") ? `` : (stryCov_9fa48("646"), `# Project-Specific Rules
<!-- This file is owned by YOU. ForgeCraft will never overwrite it. -->
<!-- Add project-specific rules, framework choices, conventions, and corrections here. -->
<!-- The sentinel CLAUDE.md links here so any AI reading your project can find it. -->

## Framework & Stack Choices
<!-- e.g. We use Prisma for ORM. Deploy target is Railway. Python 3.11+. -->

## Custom Corrections Log
<!-- Log AI corrections so the pattern isn't repeated. -->
<!-- Format: - YYYY-MM-DD: [description of correction] -->

## Project-Specific Gates
<!-- Add quality rules specific to this project that don't belong in universal standards. -->
`);

// ── Schema ───────────────────────────────────────────────────────────

export const scaffoldProjectSchema = z.object(stryMutAct_9fa48("647") ? {} : (stryCov_9fa48("647"), {
  tags: stryMutAct_9fa48("648") ? z.array(z.enum(ALL_TAGS as unknown as [string, ...string[]])).max(1).describe("Project classification tags. UNIVERSAL is always included.") : (stryCov_9fa48("648"), z.array(z.enum(ALL_TAGS as unknown as [string, ...string[]])).min(1).describe(stryMutAct_9fa48("649") ? "" : (stryCov_9fa48("649"), "Project classification tags. UNIVERSAL is always included."))),
  project_dir: z.string().describe(stryMutAct_9fa48("650") ? "" : (stryCov_9fa48("650"), "Absolute path to the project root directory.")),
  project_name: z.string().describe(stryMutAct_9fa48("651") ? "" : (stryCov_9fa48("651"), "Human-readable project name.")),
  language: z.enum(stryMutAct_9fa48("652") ? [] : (stryCov_9fa48("652"), [stryMutAct_9fa48("653") ? "" : (stryCov_9fa48("653"), "typescript"), stryMutAct_9fa48("654") ? "" : (stryCov_9fa48("654"), "python")])).default(stryMutAct_9fa48("655") ? "" : (stryCov_9fa48("655"), "typescript")).describe(stryMutAct_9fa48("656") ? "" : (stryCov_9fa48("656"), "Primary programming language.")),
  dry_run: z.boolean().default(stryMutAct_9fa48("657") ? true : (stryCov_9fa48("657"), false)).describe(stryMutAct_9fa48("658") ? "" : (stryCov_9fa48("658"), "If true, return the plan without writing files.")),
  force: z.boolean().default(stryMutAct_9fa48("659") ? true : (stryCov_9fa48("659"), false)).describe(stryMutAct_9fa48("660") ? "" : (stryCov_9fa48("660"), "If true, overwrite existing files. Default: skip files that already exist.")),
  output_targets: z.array(z.enum(ALL_OUTPUT_TARGETS as unknown as [string, ...string[]])).default(stryMutAct_9fa48("661") ? [] : (stryCov_9fa48("661"), [stryMutAct_9fa48("662") ? "" : (stryCov_9fa48("662"), "claude")])).describe(stryMutAct_9fa48("663") ? "" : (stryCov_9fa48("663"), "AI assistant targets to generate instruction files for. Options: claude, cursor, copilot, windsurf, cline, aider.")),
  sentinel: z.boolean().default(stryMutAct_9fa48("664") ? false : (stryCov_9fa48("664"), true)).describe(stryMutAct_9fa48("665") ? "" : (stryCov_9fa48("665"), "If true (default), generate a 50-line sentinel CLAUDE.md + .claude/standards/ domain files instead of one large file. Set to false to generate the traditional monolithic CLAUDE.md."))
}));

// ── Handler ──────────────────────────────────────────────────────────

export async function scaffoldProjectHandler(args: z.infer<typeof scaffoldProjectSchema>): Promise<{
  content: Array<{
    type: "text";
    text: string;
  }>;
}> {
  if (stryMutAct_9fa48("666")) {
    {}
  } else {
    stryCov_9fa48("666");
    const tags: Tag[] = args.tags.includes(stryMutAct_9fa48("667") ? "" : (stryCov_9fa48("667"), "UNIVERSAL")) ? args.tags as Tag[] : ["UNIVERSAL", ...args.tags] as Tag[];
    logger.info(stryMutAct_9fa48("668") ? "" : (stryCov_9fa48("668"), "Scaffolding project"), stryMutAct_9fa48("669") ? {} : (stryCov_9fa48("669"), {
      tags,
      projectDir: args.project_dir,
      dryRun: args.dry_run,
      force: args.force
    }));

    // Load and compose templates (respects forgecraft.yaml config if present)
    const userConfig = loadUserOverrides(args.project_dir);
    const templateSets = await loadAllTemplatesWithExtras(undefined, stryMutAct_9fa48("670") ? userConfig.templateDirs : (stryCov_9fa48("670"), userConfig?.templateDirs));
    const composed = composeTemplates(tags, templateSets, stryMutAct_9fa48("671") ? {} : (stryCov_9fa48("671"), {
      config: stryMutAct_9fa48("672") ? userConfig && undefined : (stryCov_9fa48("672"), userConfig ?? undefined)
    }));
    const context = detectProjectContext(args.project_dir, args.project_name, args.language, tags);

    // Render content
    const outputTargets = (args.output_targets ?? [DEFAULT_OUTPUT_TARGET]) as OutputTarget[];
    const statusMdContent = renderStatusMd(context);
    const prdContent = renderPrdSkeleton(context);
    const techSpecContent = renderTechSpecSkeleton(context);
    if (stryMutAct_9fa48("674") ? false : stryMutAct_9fa48("673") ? true : (stryCov_9fa48("673", "674"), args.dry_run)) {
      if (stryMutAct_9fa48("675")) {
        {}
      } else {
        stryCov_9fa48("675");
        const plan = buildDryRunPlan(composed, tags);
        return stryMutAct_9fa48("676") ? {} : (stryCov_9fa48("676"), {
          content: stryMutAct_9fa48("677") ? [] : (stryCov_9fa48("677"), [stryMutAct_9fa48("678") ? {} : (stryCov_9fa48("678"), {
            type: stryMutAct_9fa48("679") ? "" : (stryCov_9fa48("679"), "text"),
            text: plan
          })])
        });
      }
    }

    // Check git safety
    const gitWarning = checkGitSafety(args.project_dir);
    const filesCreated: string[] = stryMutAct_9fa48("680") ? ["Stryker was here"] : (stryCov_9fa48("680"), []);
    const filesSkipped: string[] = stryMutAct_9fa48("681") ? ["Stryker was here"] : (stryCov_9fa48("681"), []);

    /** Track a safe write result. */
    function trackWrite(relativePath: string, filePath: string, content: string): void {
      if (stryMutAct_9fa48("682")) {
        {}
      } else {
        stryCov_9fa48("682");
        const result = writeFileIfMissing(filePath, content, args.force);
        if (stryMutAct_9fa48("685") ? result !== "skipped" : stryMutAct_9fa48("684") ? false : stryMutAct_9fa48("683") ? true : (stryCov_9fa48("683", "684", "685"), result === (stryMutAct_9fa48("686") ? "" : (stryCov_9fa48("686"), "skipped")))) {
          if (stryMutAct_9fa48("687")) {
            {}
          } else {
            stryCov_9fa48("687");
            filesSkipped.push(relativePath);
          }
        } else {
          if (stryMutAct_9fa48("688")) {
            {}
          } else {
            stryCov_9fa48("688");
            filesCreated.push(relativePath);
          }
        }
      }
    }

    // Create directories from structure entries
    for (const entry of composed.structureEntries) {
      if (stryMutAct_9fa48("689")) {
        {}
      } else {
        stryCov_9fa48("689");
        const fullPath = join(args.project_dir, entry.path);
        if (stryMutAct_9fa48("692") ? entry.type !== "directory" : stryMutAct_9fa48("691") ? false : stryMutAct_9fa48("690") ? true : (stryCov_9fa48("690", "691", "692"), entry.type === (stryMutAct_9fa48("693") ? "" : (stryCov_9fa48("693"), "directory")))) {
          if (stryMutAct_9fa48("694")) {
            {}
          } else {
            stryCov_9fa48("694");
            mkdirSync(fullPath, stryMutAct_9fa48("695") ? {} : (stryCov_9fa48("695"), {
              recursive: stryMutAct_9fa48("696") ? false : (stryCov_9fa48("696"), true)
            }));
            filesCreated.push(stryMutAct_9fa48("697") ? `` : (stryCov_9fa48("697"), `${entry.path}/`));
          }
        }
      }
    }

    // Write instruction files for all output targets
    for (const target of outputTargets) {
      if (stryMutAct_9fa48("698")) {
        {}
      } else {
        stryCov_9fa48("698");
        const targetConfig = OUTPUT_TARGET_CONFIGS[target];

        // For claude target: use sentinel tree (default) or monolithic file
        if (stryMutAct_9fa48("701") ? target === "claude" || args.sentinel !== false : stryMutAct_9fa48("700") ? false : stryMutAct_9fa48("699") ? true : (stryCov_9fa48("699", "700", "701"), (stryMutAct_9fa48("703") ? target !== "claude" : stryMutAct_9fa48("702") ? true : (stryCov_9fa48("702", "703"), target === (stryMutAct_9fa48("704") ? "" : (stryCov_9fa48("704"), "claude")))) && (stryMutAct_9fa48("706") ? args.sentinel === false : stryMutAct_9fa48("705") ? true : (stryCov_9fa48("705", "706"), args.sentinel !== (stryMutAct_9fa48("707") ? true : (stryCov_9fa48("707"), false)))))) {
          if (stryMutAct_9fa48("708")) {
            {}
          } else {
            stryCov_9fa48("708");
            const sentinelFiles = renderSentinelTree(composed.instructionBlocks, context);
            for (const file of sentinelFiles) {
              if (stryMutAct_9fa48("709")) {
                {}
              } else {
                stryCov_9fa48("709");
                const fullPath = join(args.project_dir, file.relativePath);
                mkdirSync(dirname(fullPath), stryMutAct_9fa48("710") ? {} : (stryCov_9fa48("710"), {
                  recursive: stryMutAct_9fa48("711") ? false : (stryCov_9fa48("711"), true)
                }));
                trackWrite(file.relativePath, fullPath, file.content);
              }
            }
            // Scaffold the user-owned project-specific.md (never overwritten after first creation)
            const projectSpecificPath = join(args.project_dir, stryMutAct_9fa48("712") ? "" : (stryCov_9fa48("712"), ".claude"), stryMutAct_9fa48("713") ? "" : (stryCov_9fa48("713"), "standards"), stryMutAct_9fa48("714") ? "" : (stryCov_9fa48("714"), "project-specific.md"));
            trackWrite(stryMutAct_9fa48("715") ? "" : (stryCov_9fa48("715"), ".claude/standards/project-specific.md"), projectSpecificPath, PROJECT_SPECIFIC_TEMPLATE);
          }
        } else {
          if (stryMutAct_9fa48("716")) {
            {}
          } else {
            stryCov_9fa48("716");
            const content = renderInstructionFile(composed.instructionBlocks, context, target, stryMutAct_9fa48("717") ? {} : (stryCov_9fa48("717"), {
              compact: stryMutAct_9fa48("718") ? userConfig.compact : (stryCov_9fa48("718"), userConfig?.compact)
            }));
            const outputPath = targetConfig.directory ? join(args.project_dir, targetConfig.directory, targetConfig.filename) : join(args.project_dir, targetConfig.filename);
            mkdirSync(dirname(outputPath), stryMutAct_9fa48("719") ? {} : (stryCov_9fa48("719"), {
              recursive: stryMutAct_9fa48("720") ? false : (stryCov_9fa48("720"), true)
            }));
            const relativePath = targetConfig.directory ? stryMutAct_9fa48("721") ? `` : (stryCov_9fa48("721"), `${targetConfig.directory}/${targetConfig.filename}`) : targetConfig.filename;
            trackWrite(relativePath, outputPath, content);
          }
        }
      }
    }

    // Write Status.md
    trackWrite(stryMutAct_9fa48("722") ? "" : (stryCov_9fa48("722"), "Status.md"), join(args.project_dir, stryMutAct_9fa48("723") ? "" : (stryCov_9fa48("723"), "Status.md")), statusMdContent);

    // Write docs
    mkdirSync(join(args.project_dir, stryMutAct_9fa48("724") ? "" : (stryCov_9fa48("724"), "docs")), stryMutAct_9fa48("725") ? {} : (stryCov_9fa48("725"), {
      recursive: stryMutAct_9fa48("726") ? false : (stryCov_9fa48("726"), true)
    }));
    trackWrite(stryMutAct_9fa48("727") ? "" : (stryCov_9fa48("727"), "docs/PRD.md"), join(args.project_dir, stryMutAct_9fa48("728") ? "" : (stryCov_9fa48("728"), "docs"), stryMutAct_9fa48("729") ? "" : (stryCov_9fa48("729"), "PRD.md")), prdContent);
    trackWrite(stryMutAct_9fa48("730") ? "" : (stryCov_9fa48("730"), "docs/TechSpec.md"), join(args.project_dir, stryMutAct_9fa48("731") ? "" : (stryCov_9fa48("731"), "docs"), stryMutAct_9fa48("732") ? "" : (stryCov_9fa48("732"), "TechSpec.md")), techSpecContent);

    // Create docs/adrs/ with README so the directory is tracked by git and
    // the Auditable scorer finds it immediately (ADRs score 2/2 once populated).
    const adrsDir = join(args.project_dir, stryMutAct_9fa48("733") ? "" : (stryCov_9fa48("733"), "docs"), stryMutAct_9fa48("734") ? "" : (stryCov_9fa48("734"), "adrs"));
    mkdirSync(adrsDir, stryMutAct_9fa48("735") ? {} : (stryCov_9fa48("735"), {
      recursive: stryMutAct_9fa48("736") ? false : (stryCov_9fa48("736"), true)
    }));
    trackWrite(stryMutAct_9fa48("737") ? "" : (stryCov_9fa48("737"), "docs/adrs/README.md"), join(adrsDir, stryMutAct_9fa48("738") ? "" : (stryCov_9fa48("738"), "README.md")), renderAdrsReadme(context.projectName));

    // Write .env.example — universal signals only; runtime-specific vars are added by the AI assistant
    trackWrite(stryMutAct_9fa48("739") ? "" : (stryCov_9fa48("739"), ".env.example"), join(args.project_dir, stryMutAct_9fa48("740") ? "" : (stryCov_9fa48("740"), ".env.example")), stryMutAct_9fa48("741") ? "" : (stryCov_9fa48("741"), "# Environment configuration\n# Copy to .env and fill in values\nLOG_LEVEL=info\n"));

    // Write hooks
    const hooksDir = join(args.project_dir, stryMutAct_9fa48("742") ? "" : (stryCov_9fa48("742"), ".claude"), stryMutAct_9fa48("743") ? "" : (stryCov_9fa48("743"), "hooks"));
    mkdirSync(hooksDir, stryMutAct_9fa48("744") ? {} : (stryCov_9fa48("744"), {
      recursive: stryMutAct_9fa48("745") ? false : (stryCov_9fa48("745"), true)
    }));
    for (const hook of composed.hooks) {
      if (stryMutAct_9fa48("746")) {
        {}
      } else {
        stryCov_9fa48("746");
        const hookPath = join(hooksDir, hook.filename);
        trackWrite(stryMutAct_9fa48("747") ? `` : (stryCov_9fa48("747"), `.claude/hooks/${hook.filename}`), hookPath, hook.script);
        try {
          if (stryMutAct_9fa48("748")) {
            {}
          } else {
            stryCov_9fa48("748");
            chmodSync(hookPath, 0o755);
          }
        } catch {
          // chmod may fail on Windows, that's OK
        }
      }
    }

    // Write skills (Claude Code custom commands)
    if (stryMutAct_9fa48("752") ? composed.skills.length <= 0 : stryMutAct_9fa48("751") ? composed.skills.length >= 0 : stryMutAct_9fa48("750") ? false : stryMutAct_9fa48("749") ? true : (stryCov_9fa48("749", "750", "751", "752"), composed.skills.length > 0)) {
      if (stryMutAct_9fa48("753")) {
        {}
      } else {
        stryCov_9fa48("753");
        const commandsDir = join(args.project_dir, stryMutAct_9fa48("754") ? "" : (stryCov_9fa48("754"), ".claude"), stryMutAct_9fa48("755") ? "" : (stryCov_9fa48("755"), "commands"));
        mkdirSync(commandsDir, stryMutAct_9fa48("756") ? {} : (stryCov_9fa48("756"), {
          recursive: stryMutAct_9fa48("757") ? false : (stryCov_9fa48("757"), true)
        }));
        for (const skill of composed.skills) {
          if (stryMutAct_9fa48("758")) {
            {}
          } else {
            stryCov_9fa48("758");
            const skillContent = renderSkill(skill.content, context);
            const skillPath = join(commandsDir, skill.filename);
            trackWrite(stryMutAct_9fa48("759") ? `` : (stryCov_9fa48("759"), `.claude/commands/${skill.filename}`), skillPath, skillContent);
          }
        }
      }
    }

    // Write .gitignore — content is language-aware; tool/framework choice is left to the team
    trackWrite(stryMutAct_9fa48("760") ? "" : (stryCov_9fa48("760"), ".gitignore"), join(args.project_dir, stryMutAct_9fa48("761") ? "" : (stryCov_9fa48("761"), ".gitignore")), renderGitignore(args.language));
    const result: ScaffoldResult = stryMutAct_9fa48("762") ? {} : (stryCov_9fa48("762"), {
      filesCreated,
      mcpServersConfigured: stryMutAct_9fa48("763") ? ["Stryker was here"] : (stryCov_9fa48("763"), []),
      nextSteps: stryMutAct_9fa48("764") ? [] : (stryCov_9fa48("764"), [stryMutAct_9fa48("765") ? "" : (stryCov_9fa48("765"), "Review and adjust instruction files for your project specifics"), stryMutAct_9fa48("766") ? "" : (stryCov_9fa48("766"), "Fill in docs/PRD.md with your actual requirements"), stryMutAct_9fa48("767") ? "" : (stryCov_9fa48("767"), "Fill in docs/TechSpec.md with your architecture decisions"), renderInstallStep(args.language), stryMutAct_9fa48("768") ? "" : (stryCov_9fa48("768"), "Start implementing your first feature module")]),
      restartRequired: stryMutAct_9fa48("769") ? false : (stryCov_9fa48("769"), true)
    });
    let text = stryMutAct_9fa48("770") ? `` : (stryCov_9fa48("770"), `# Project Scaffolded Successfully\n\n`);
    text += stryMutAct_9fa48("771") ? `` : (stryCov_9fa48("771"), `**Tags:** ${tags.map(stryMutAct_9fa48("772") ? () => undefined : (stryCov_9fa48("772"), t => stryMutAct_9fa48("773") ? `` : (stryCov_9fa48("773"), `[${t}]`))).join(stryMutAct_9fa48("774") ? "" : (stryCov_9fa48("774"), " "))}\n`);
    text += stryMutAct_9fa48("775") ? `` : (stryCov_9fa48("775"), `**Files Created:** ${filesCreated.length}\n\n`);
    if (stryMutAct_9fa48("777") ? false : stryMutAct_9fa48("776") ? true : (stryCov_9fa48("776", "777"), gitWarning)) {
      if (stryMutAct_9fa48("778")) {
        {}
      } else {
        stryCov_9fa48("778");
        text += stryMutAct_9fa48("779") ? `` : (stryCov_9fa48("779"), `\n> ⚠️ **Git Warning:** ${gitWarning}\n\n`);
      }
    }
    text += stryMutAct_9fa48("780") ? `` : (stryCov_9fa48("780"), `## Created Files\n`);
    stryMutAct_9fa48("781") ? text -= filesCreated.map(f => `- \`${f}\``).join("\n") : (stryCov_9fa48("781"), text += filesCreated.map(stryMutAct_9fa48("782") ? () => undefined : (stryCov_9fa48("782"), f => stryMutAct_9fa48("783") ? `` : (stryCov_9fa48("783"), `- \`${f}\``))).join(stryMutAct_9fa48("784") ? "" : (stryCov_9fa48("784"), "\n")));
    if (stryMutAct_9fa48("788") ? filesSkipped.length <= 0 : stryMutAct_9fa48("787") ? filesSkipped.length >= 0 : stryMutAct_9fa48("786") ? false : stryMutAct_9fa48("785") ? true : (stryCov_9fa48("785", "786", "787", "788"), filesSkipped.length > 0)) {
      if (stryMutAct_9fa48("789")) {
        {}
      } else {
        stryCov_9fa48("789");
        text += stryMutAct_9fa48("790") ? `` : (stryCov_9fa48("790"), `\n\n## Skipped (already exist)\n`);
        stryMutAct_9fa48("791") ? text -= filesSkipped.map(f => `- \`${f}\``).join("\n") : (stryCov_9fa48("791"), text += filesSkipped.map(stryMutAct_9fa48("792") ? () => undefined : (stryCov_9fa48("792"), f => stryMutAct_9fa48("793") ? `` : (stryCov_9fa48("793"), `- \`${f}\``))).join(stryMutAct_9fa48("794") ? "" : (stryCov_9fa48("794"), "\n")));
        text += stryMutAct_9fa48("795") ? `` : (stryCov_9fa48("795"), `\n\n_Use \`force=true\` to overwrite existing files._`);
      }
    }
    text += stryMutAct_9fa48("796") ? `` : (stryCov_9fa48("796"), `\n\n## Next Steps\n`);
    stryMutAct_9fa48("797") ? text -= result.nextSteps.map((s, i) => `${i + 1}. ${s}`).join("\n") : (stryCov_9fa48("797"), text += result.nextSteps.map(stryMutAct_9fa48("798") ? () => undefined : (stryCov_9fa48("798"), (s, i) => stryMutAct_9fa48("799") ? `` : (stryCov_9fa48("799"), `${stryMutAct_9fa48("800") ? i - 1 : (stryCov_9fa48("800"), i + 1)}. ${s}`))).join(stryMutAct_9fa48("801") ? "" : (stryCov_9fa48("801"), "\n")));
    stryMutAct_9fa48("802") ? text -= renderGsDisclosure() : (stryCov_9fa48("802"), text += renderGsDisclosure());
    text += stryMutAct_9fa48("803") ? `` : (stryCov_9fa48("803"), `\n\n⚠️ **Restart may be required** to pick up instruction files and hooks.`);
    return stryMutAct_9fa48("804") ? {} : (stryCov_9fa48("804"), {
      content: stryMutAct_9fa48("805") ? [] : (stryCov_9fa48("805"), [stryMutAct_9fa48("806") ? {} : (stryCov_9fa48("806"), {
        type: stryMutAct_9fa48("807") ? "" : (stryCov_9fa48("807"), "text"),
        text
      })])
    });
  }
}

/**
 * Build a dry-run plan without writing files.
 */
function buildDryRunPlan(composed: ReturnType<typeof composeTemplates>, tags: Tag[]): string {
  if (stryMutAct_9fa48("808")) {
    {}
  } else {
    stryCov_9fa48("808");
    let text = stryMutAct_9fa48("809") ? `` : (stryCov_9fa48("809"), `# Scaffold Plan (Dry Run)\n\n`);
    text += stryMutAct_9fa48("810") ? `` : (stryCov_9fa48("810"), `**Tags:** ${tags.map(stryMutAct_9fa48("811") ? () => undefined : (stryCov_9fa48("811"), t => stryMutAct_9fa48("812") ? `` : (stryCov_9fa48("812"), `[${t}]`))).join(stryMutAct_9fa48("813") ? "" : (stryCov_9fa48("813"), " "))}\n\n`);
    text += stryMutAct_9fa48("814") ? `` : (stryCov_9fa48("814"), `## Directories to Create\n`);
    const dirs = stryMutAct_9fa48("815") ? composed.structureEntries : (stryCov_9fa48("815"), composed.structureEntries.filter(stryMutAct_9fa48("816") ? () => undefined : (stryCov_9fa48("816"), e => stryMutAct_9fa48("819") ? e.type !== "directory" : stryMutAct_9fa48("818") ? false : stryMutAct_9fa48("817") ? true : (stryCov_9fa48("817", "818", "819"), e.type === (stryMutAct_9fa48("820") ? "" : (stryCov_9fa48("820"), "directory"))))));
    stryMutAct_9fa48("821") ? text -= dirs.map(d => `- \`${d.path}/\`${d.description ? ` — ${d.description}` : ""}`).join("\n") : (stryCov_9fa48("821"), text += dirs.map(stryMutAct_9fa48("822") ? () => undefined : (stryCov_9fa48("822"), d => stryMutAct_9fa48("823") ? `` : (stryCov_9fa48("823"), `- \`${d.path}/\`${d.description ? stryMutAct_9fa48("824") ? `` : (stryCov_9fa48("824"), ` — ${d.description}`) : stryMutAct_9fa48("825") ? "Stryker was here!" : (stryCov_9fa48("825"), "")}`))).join(stryMutAct_9fa48("826") ? "" : (stryCov_9fa48("826"), "\n")));
    text += stryMutAct_9fa48("827") ? `` : (stryCov_9fa48("827"), `\n\n## Files to Generate\n`);
    text += stryMutAct_9fa48("828") ? `` : (stryCov_9fa48("828"), `- CLAUDE.md (~50-line sentinel)\n`);
    text += stryMutAct_9fa48("829") ? `` : (stryCov_9fa48("829"), `- .claude/standards/*.md (domain files — ForgeCraft-managed)\n`);
    text += stryMutAct_9fa48("830") ? `` : (stryCov_9fa48("830"), `- .claude/standards/project-specific.md (YOUR file — ForgeCraft never overwrites)\n`);
    text += stryMutAct_9fa48("831") ? `` : (stryCov_9fa48("831"), `- Status.md\n`);
    text += stryMutAct_9fa48("832") ? `` : (stryCov_9fa48("832"), `- docs/PRD.md (skeleton)\n`);
    text += stryMutAct_9fa48("833") ? `` : (stryCov_9fa48("833"), `- docs/TechSpec.md (skeleton with ${composed.nfrBlocks.length} NFR sections)\n`);
    text += stryMutAct_9fa48("834") ? `` : (stryCov_9fa48("834"), `- docs/adrs/README.md (ADR directory bootstrap — Auditable signal)\n`);
    text += stryMutAct_9fa48("835") ? `` : (stryCov_9fa48("835"), `- .env.example\n`);
    text += stryMutAct_9fa48("836") ? `` : (stryCov_9fa48("836"), `- .gitignore\n`);
    text += stryMutAct_9fa48("837") ? `` : (stryCov_9fa48("837"), `\n## Hooks to Install (${composed.hooks.length})\n`);
    stryMutAct_9fa48("838") ? text -= composed.hooks.map(h => `- \`${h.filename}\` (${h.trigger}) — ${h.description}`).join("\n") : (stryCov_9fa48("838"), text += composed.hooks.map(stryMutAct_9fa48("839") ? () => undefined : (stryCov_9fa48("839"), h => stryMutAct_9fa48("840") ? `` : (stryCov_9fa48("840"), `- \`${h.filename}\` (${h.trigger}) — ${h.description}`))).join(stryMutAct_9fa48("841") ? "" : (stryCov_9fa48("841"), "\n")));
    if (stryMutAct_9fa48("845") ? composed.skills.length <= 0 : stryMutAct_9fa48("844") ? composed.skills.length >= 0 : stryMutAct_9fa48("843") ? false : stryMutAct_9fa48("842") ? true : (stryCov_9fa48("842", "843", "844", "845"), composed.skills.length > 0)) {
      if (stryMutAct_9fa48("846")) {
        {}
      } else {
        stryCov_9fa48("846");
        text += stryMutAct_9fa48("847") ? `` : (stryCov_9fa48("847"), `\n\n## Skills to Install (${composed.skills.length})\n`);
        stryMutAct_9fa48("848") ? text -= composed.skills.map(s => `- \`/project:${s.filename.replace(".md", "")}\` — ${s.description}`).join("\n") : (stryCov_9fa48("848"), text += composed.skills.map(stryMutAct_9fa48("849") ? () => undefined : (stryCov_9fa48("849"), s => stryMutAct_9fa48("850") ? `` : (stryCov_9fa48("850"), `- \`/project:${s.filename.replace(stryMutAct_9fa48("851") ? "" : (stryCov_9fa48("851"), ".md"), stryMutAct_9fa48("852") ? "Stryker was here!" : (stryCov_9fa48("852"), ""))}\` — ${s.description}`))).join(stryMutAct_9fa48("853") ? "" : (stryCov_9fa48("853"), "\n")));
      }
    }
    text += stryMutAct_9fa48("854") ? `` : (stryCov_9fa48("854"), `\n\n_Run again with dry_run=false to write files._`);
    return text;
  }
}

/**
 * Render the bootstrap README for docs/adrs/.
 * Its presence tells the Auditable scorer that the ADR convention is adopted.
 * The first real ADR should supersede this file's instructions.
 */
function renderAdrsReadme(projectName: string): string {
  if (stryMutAct_9fa48("855")) {
    {}
  } else {
    stryCov_9fa48("855");
    return (stryMutAct_9fa48("856") ? [] : (stryCov_9fa48("856"), [stryMutAct_9fa48("857") ? `` : (stryCov_9fa48("857"), `# Architecture Decision Records — ${projectName}`), stryMutAct_9fa48("858") ? `Stryker was here!` : (stryCov_9fa48("858"), ``), stryMutAct_9fa48("859") ? `` : (stryCov_9fa48("859"), `This directory contains Architecture Decision Records (ADRs) for ${projectName}.`), stryMutAct_9fa48("860") ? `Stryker was here!` : (stryCov_9fa48("860"), ``), stryMutAct_9fa48("861") ? `` : (stryCov_9fa48("861"), `## Format`), stryMutAct_9fa48("862") ? `Stryker was here!` : (stryCov_9fa48("862"), ``), stryMutAct_9fa48("863") ? `` : (stryCov_9fa48("863"), `Each ADR is a numbered Markdown file: \`NNNN-short-title.md\``), stryMutAct_9fa48("864") ? `Stryker was here!` : (stryCov_9fa48("864"), ``), stryMutAct_9fa48("865") ? `` : (stryCov_9fa48("865"), `Use \`npx forgecraft-mcp generate_adr\` (or the \`generate_adr\` MCP action) to create a new ADR`), stryMutAct_9fa48("866") ? `` : (stryCov_9fa48("866"), `with automatic sequencing and the standard MADR template.`), stryMutAct_9fa48("867") ? `Stryker was here!` : (stryCov_9fa48("867"), ``), stryMutAct_9fa48("868") ? `` : (stryCov_9fa48("868"), `## Status values`), stryMutAct_9fa48("869") ? `Stryker was here!` : (stryCov_9fa48("869"), ``), stryMutAct_9fa48("870") ? `` : (stryCov_9fa48("870"), `- **Proposed** — under discussion`), stryMutAct_9fa48("871") ? `` : (stryCov_9fa48("871"), `- **Accepted** — decision taken, implementation may be pending`), stryMutAct_9fa48("872") ? `` : (stryCov_9fa48("872"), `- **Superseded by ADR-NNNN** — replaced by a later decision`), stryMutAct_9fa48("873") ? `` : (stryCov_9fa48("873"), `- **Deprecated** — no longer relevant`), stryMutAct_9fa48("874") ? `Stryker was here!` : (stryCov_9fa48("874"), ``), stryMutAct_9fa48("875") ? `` : (stryCov_9fa48("875"), `## Why ADRs?`), stryMutAct_9fa48("876") ? `Stryker was here!` : (stryCov_9fa48("876"), ``), stryMutAct_9fa48("877") ? `` : (stryCov_9fa48("877"), `Every non-obvious architectural choice must be recorded with context, alternatives`), stryMutAct_9fa48("878") ? `` : (stryCov_9fa48("878"), `considered, and consequences accepted. Without this record, the team re-litigates`), stryMutAct_9fa48("879") ? `` : (stryCov_9fa48("879"), `the same decisions and AI coding assistants cannot reason about past choices.`), stryMutAct_9fa48("880") ? `Stryker was here!` : (stryCov_9fa48("880"), ``), stryMutAct_9fa48("881") ? `` : (stryCov_9fa48("881"), `---`), stryMutAct_9fa48("882") ? `` : (stryCov_9fa48("882"), `_This README was generated by ForgeCraft scaffold. Replace it with your first ADR._`)])).join(stryMutAct_9fa48("883") ? "" : (stryCov_9fa48("883"), "\n"));
  }
}

/**
 * Language-aware .gitignore content.
 * Tool and framework choices (bundler output dirs, virtual envs, etc.) are left to the team;
 * only universal and language-level patterns are included.
 */
function renderGitignore(language: "typescript" | "python"): string {
  if (stryMutAct_9fa48("884")) {
    {}
  } else {
    stryCov_9fa48("884");
    const universal = stryMutAct_9fa48("885") ? [] : (stryCov_9fa48("885"), [stryMutAct_9fa48("886") ? "" : (stryCov_9fa48("886"), ".env"), stryMutAct_9fa48("887") ? "" : (stryCov_9fa48("887"), ".env.*"), stryMutAct_9fa48("888") ? "" : (stryCov_9fa48("888"), "coverage/"), stryMutAct_9fa48("889") ? "" : (stryCov_9fa48("889"), "*.log"), stryMutAct_9fa48("890") ? "" : (stryCov_9fa48("890"), ".DS_Store")]);
    const byLanguage: Record<string, string[]> = stryMutAct_9fa48("891") ? {} : (stryCov_9fa48("891"), {
      typescript: stryMutAct_9fa48("892") ? [] : (stryCov_9fa48("892"), [stryMutAct_9fa48("893") ? "" : (stryCov_9fa48("893"), "node_modules/"), stryMutAct_9fa48("894") ? "" : (stryCov_9fa48("894"), "dist/"), stryMutAct_9fa48("895") ? "" : (stryCov_9fa48("895"), "build/"), stryMutAct_9fa48("896") ? "" : (stryCov_9fa48("896"), ".tsbuildinfo")]),
      python: stryMutAct_9fa48("897") ? [] : (stryCov_9fa48("897"), [stryMutAct_9fa48("898") ? "" : (stryCov_9fa48("898"), "__pycache__/"), stryMutAct_9fa48("899") ? "" : (stryCov_9fa48("899"), "*.pyc"), stryMutAct_9fa48("900") ? "" : (stryCov_9fa48("900"), ".venv/"), stryMutAct_9fa48("901") ? "" : (stryCov_9fa48("901"), "venv/"), stryMutAct_9fa48("902") ? "" : (stryCov_9fa48("902"), "dist/"), stryMutAct_9fa48("903") ? "" : (stryCov_9fa48("903"), "*.egg-info/"), stryMutAct_9fa48("904") ? "" : (stryCov_9fa48("904"), ".mypy_cache/")])
    });
    return (stryMutAct_9fa48("905") ? [] : (stryCov_9fa48("905"), [...(stryMutAct_9fa48("906") ? byLanguage[language] && [] : (stryCov_9fa48("906"), byLanguage[language] ?? (stryMutAct_9fa48("907") ? ["Stryker was here"] : (stryCov_9fa48("907"), [])))), ...universal])).join(stryMutAct_9fa48("908") ? "" : (stryCov_9fa48("908"), "\n")) + (stryMutAct_9fa48("909") ? "" : (stryCov_9fa48("909"), "\n"));
  }
}

/**
 * Language-aware install step for next-steps guidance.
 * Intentionally vague — the AI assistant will choose the actual package manager.
 */
function renderInstallStep(language: "typescript" | "python"): string {
  if (stryMutAct_9fa48("910")) {
    {}
  } else {
    stryCov_9fa48("910");
    const hints: Record<string, string> = stryMutAct_9fa48("911") ? {} : (stryCov_9fa48("911"), {
      typescript: stryMutAct_9fa48("912") ? "" : (stryCov_9fa48("912"), "Install dependencies (npm install / pnpm install / yarn)"),
      python: stryMutAct_9fa48("913") ? "" : (stryCov_9fa48("913"), "Create a virtual environment and install dependencies (pip install -e . / poetry install / uv sync)")
    });
    return stryMutAct_9fa48("914") ? hints[language] && "Install project dependencies" : (stryCov_9fa48("914"), hints[language] ?? (stryMutAct_9fa48("915") ? "" : (stryCov_9fa48("915"), "Install project dependencies")));
  }
}

/**
 * GS-model disclosure appended to every scaffold summary.
 *
 * Explains what was NOT generated and WHY — referencing the Generative Specification
 * white paper decisions so the team understands the design intent, not just the output.
 */
function renderGsDisclosure(): string {
  if (stryMutAct_9fa48("916")) {
    {}
  } else {
    stryCov_9fa48("916");
    return (stryMutAct_9fa48("917") ? [] : (stryCov_9fa48("917"), [stryMutAct_9fa48("918") ? `Stryker was here!` : (stryCov_9fa48("918"), ``), stryMutAct_9fa48("919") ? `Stryker was here!` : (stryCov_9fa48("919"), ``), stryMutAct_9fa48("920") ? `` : (stryCov_9fa48("920"), `## GS Model Disclosure`), stryMutAct_9fa48("921") ? `Stryker was here!` : (stryCov_9fa48("921"), ``), stryMutAct_9fa48("922") ? `` : (stryCov_9fa48("922"), `ForgeCraft scaffolds to the **Generative Specification** model (7 properties, max 14 pts).`), stryMutAct_9fa48("923") ? `` : (stryCov_9fa48("923"), `The following artifacts were intentionally NOT generated — here is the reasoning:`), stryMutAct_9fa48("924") ? `Stryker was here!` : (stryCov_9fa48("924"), ``), stryMutAct_9fa48("925") ? `` : (stryCov_9fa48("925"), `| Artifact | Why not generated | GS property | How to satisfy it |`), stryMutAct_9fa48("926") ? `` : (stryCov_9fa48("926"), `|---|---|---|---|`), stryMutAct_9fa48("927") ? `` : (stryCov_9fa48("927"), `| commitlint / lefthook / husky | **Auditable(2/2)** requires commit discipline, not a specific tool. The GS model is tool-agnostic; enforce via any hook framework or CI rule. | Auditable | Add your preferred commit-lint config; \`verify\` will detect it automatically. |`), stryMutAct_9fa48("928") ? `` : (stryCov_9fa48("928"), `| Linter config (.eslintrc, .pylintrc…) | **Defended(2/2)** requires a pre-commit hook + lint config, but which linter is a team/language decision the AI assistant should make from your spec. | Defended | Any recognized lint config file satisfies this signal. |`), stryMutAct_9fa48("929") ? `` : (stryCov_9fa48("929"), `| CI pipeline file | **Executable(2/2)** is highest with CI evidence, but the pipeline syntax is platform-specific. The AI assistant generates this from your tag set. | Executable | Run \`scaffold\` then ask your AI to generate a CI workflow for your platform. |`), stryMutAct_9fa48("930") ? `` : (stryCov_9fa48("930"), `| docs/PRD.md content | The skeleton is scaffolded; actual requirements are your inputs. | Self-Describing | Fill in PRD.md — it is referenced by the Self-Describing scorer. |`), stryMutAct_9fa48("931") ? `Stryker was here!` : (stryCov_9fa48("931"), ``), stryMutAct_9fa48("932") ? `` : (stryCov_9fa48("932"), `> **GS principle:** scaffold outputs are language- and tool-agnostic starting points.`), stryMutAct_9fa48("933") ? `` : (stryCov_9fa48("933"), `> The AI coding assistant fills in the specifics from your spec and tag context.`), stryMutAct_9fa48("934") ? `` : (stryCov_9fa48("934"), `> Run \`node forgecraft-mcp/dist/index.js verify .\` at any time to see your GS score.`)])).join(stryMutAct_9fa48("935") ? "" : (stryCov_9fa48("935"), "\n"));
  }
}