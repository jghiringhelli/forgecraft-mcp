/**
 * refresh_project tool handler.
 *
 * Re-analyzes an existing project that has forgecraft.yaml,
 * detects drift (new tags, changed scope), and proposes updates.
 * Can optionally apply updates to config and CLAUDE.md.
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
import { writeFileSync, readFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import yaml from "js-yaml";
import { ALL_TAGS, CONTENT_TIERS, ALL_OUTPUT_TARGETS, OUTPUT_TARGET_CONFIGS, DEFAULT_OUTPUT_TARGET } from "../shared/types.js";
import type { Tag, ContentTier, ForgeCraftConfig, OutputTarget } from "../shared/types.js";
import { analyzeProject } from "../analyzers/package-json.js";
import { checkCompleteness } from "../analyzers/completeness.js";
import { loadAllTemplatesWithExtras, loadUserOverrides } from "../registry/loader.js";
import { composeTemplates } from "../registry/composer.js";
import { renderInstructionFile } from "../registry/renderer.js";
import { renderSentinelTree } from "../registry/sentinel-renderer.js";
import { writeInstructionFileWithMerge } from "../shared/filesystem.js";
import { detectLanguage } from "../analyzers/language-detector.js";
import { detectProjectContext } from "../analyzers/project-context.js";
import { createLogger } from "../shared/logger/index.js";
const logger = createLogger(stryMutAct_9fa48("261") ? "" : (stryCov_9fa48("261"), "tools/refresh-project"));

/** Minimum confidence to suggest a new tag. */
const SUGGEST_THRESHOLD = 0.5;

// ── Schema ───────────────────────────────────────────────────────────

export const refreshProjectSchema = z.object(stryMutAct_9fa48("262") ? {} : (stryCov_9fa48("262"), {
  project_dir: z.string().describe(stryMutAct_9fa48("263") ? "" : (stryCov_9fa48("263"), "Absolute path to the project root directory.")),
  apply: z.boolean().default(stryMutAct_9fa48("264") ? true : (stryCov_9fa48("264"), false)).describe(stryMutAct_9fa48("265") ? "" : (stryCov_9fa48("265"), "If true, apply recommended changes to forgecraft.yaml and CLAUDE.md.")),
  tier: z.enum(CONTENT_TIERS as unknown as [string, ...string[]]).optional().describe(stryMutAct_9fa48("266") ? "" : (stryCov_9fa48("266"), "Override tier level. If omitted, uses current config value.")),
  add_tags: z.array(z.enum(ALL_TAGS as unknown as [string, ...string[]])).optional().describe(stryMutAct_9fa48("267") ? "" : (stryCov_9fa48("267"), "Explicitly add these tags during refresh.")),
  remove_tags: z.array(z.enum(ALL_TAGS as unknown as [string, ...string[]])).optional().describe(stryMutAct_9fa48("268") ? "" : (stryCov_9fa48("268"), "Explicitly remove these tags during refresh.")),
  output_targets: z.array(z.enum(ALL_OUTPUT_TARGETS as unknown as [string, ...string[]])).optional().describe(stryMutAct_9fa48("269") ? "" : (stryCov_9fa48("269"), "Override output targets. If omitted, uses current config value or defaults to ['claude'].")),
  sentinel: z.boolean().default(stryMutAct_9fa48("270") ? false : (stryCov_9fa48("270"), true)).describe(stryMutAct_9fa48("271") ? "" : (stryCov_9fa48("271"), "If true (default), generate a sentinel CLAUDE.md + .claude/standards/ domain files. Set to false to regenerate the traditional monolithic CLAUDE.md.")),
  release_phase: z.enum(stryMutAct_9fa48("272") ? [] : (stryCov_9fa48("272"), [stryMutAct_9fa48("273") ? "" : (stryCov_9fa48("273"), "development"), stryMutAct_9fa48("274") ? "" : (stryCov_9fa48("274"), "pre-release"), stryMutAct_9fa48("275") ? "" : (stryCov_9fa48("275"), "release-candidate"), stryMutAct_9fa48("276") ? "" : (stryCov_9fa48("276"), "production")])).optional().describe(stryMutAct_9fa48("277") ? "" : (stryCov_9fa48("277"), "Override current release cycle phase. If omitted, uses value from forgecraft.yaml or defaults to 'development'."))
}));

// ── Types ────────────────────────────────────────────────────────────

interface DriftReport {
  readonly currentTags: Tag[];
  readonly newTagSuggestions: Array<{
    tag: Tag;
    confidence: number;
    evidence: string[];
  }>;
  readonly droppedTagCandidates: Tag[];
  readonly completenessGaps: string[];
  readonly completenessFixed: string[];
  readonly tierChange: {
    from: ContentTier;
    to: ContentTier;
  } | null;
  readonly blockCountDelta: {
    before: number;
    after: number;
  };
}

// ── Handler ──────────────────────────────────────────────────────────

export async function refreshProjectHandler(args: z.infer<typeof refreshProjectSchema>): Promise<{
  content: Array<{
    type: "text";
    text: string;
  }>;
}> {
  if (stryMutAct_9fa48("278")) {
    {}
  } else {
    stryCov_9fa48("278");
    const projectDir = args.project_dir;
    logger.info(stryMutAct_9fa48("279") ? "" : (stryCov_9fa48("279"), "Refresh project starting"), stryMutAct_9fa48("280") ? {} : (stryCov_9fa48("280"), {
      projectDir,
      apply: args.apply
    }));

    // ── Step 1: Load current config ────────────────────────────────
    const existingConfig = loadUserOverrides(projectDir);
    if (stryMutAct_9fa48("283") ? false : stryMutAct_9fa48("282") ? true : stryMutAct_9fa48("281") ? existingConfig : (stryCov_9fa48("281", "282", "283"), !existingConfig)) {
      if (stryMutAct_9fa48("284")) {
        {}
      } else {
        stryCov_9fa48("284");
        return stryMutAct_9fa48("285") ? {} : (stryCov_9fa48("285"), {
          content: stryMutAct_9fa48("286") ? [] : (stryCov_9fa48("286"), [stryMutAct_9fa48("287") ? {} : (stryCov_9fa48("287"), {
            type: stryMutAct_9fa48("288") ? "" : (stryCov_9fa48("288"), "text"),
            text: buildNoConfigOutput(projectDir)
          })])
        });
      }
    }

    // ── Step 2: Re-analyze project ─────────────────────────────────
    const drift = analyzeDrift(projectDir, existingConfig, args);

    // ── Step 3: Build updated config ───────────────────────────────
    const updatedTags = computeUpdatedTags(drift.currentTags, drift.newTagSuggestions, args.add_tags as Tag[] | undefined, args.remove_tags as Tag[] | undefined);
    const updatedTier = stryMutAct_9fa48("289") ? (args.tier ?? existingConfig.tier) && "recommended" : (stryCov_9fa48("289"), (stryMutAct_9fa48("290") ? args.tier && existingConfig.tier : (stryCov_9fa48("290"), args.tier ?? existingConfig.tier)) ?? (stryMutAct_9fa48("291") ? "" : (stryCov_9fa48("291"), "recommended")));
    const updatedConfig: ForgeCraftConfig = stryMutAct_9fa48("292") ? {} : (stryCov_9fa48("292"), {
      ...existingConfig,
      tags: updatedTags,
      tier: updatedTier as ContentTier,
      releasePhase: (args.release_phase ?? existingConfig.releasePhase ?? "development") as ForgeCraftConfig["releasePhase"]
    });

    // ── Step 4: Compose with updated config ────────────────────────
    const allTemplates = await loadAllTemplatesWithExtras(undefined, updatedConfig.templateDirs);
    const composed = composeTemplates(updatedTags, allTemplates, stryMutAct_9fa48("293") ? {} : (stryCov_9fa48("293"), {
      config: updatedConfig
    }));

    // ── Step 5: Apply or preview ───────────────────────────────────
    if (stryMutAct_9fa48("296") ? false : stryMutAct_9fa48("295") ? true : stryMutAct_9fa48("294") ? args.apply : (stryCov_9fa48("294", "295", "296"), !args.apply)) {
      if (stryMutAct_9fa48("297")) {
        {}
      } else {
        stryCov_9fa48("297");
        return stryMutAct_9fa48("298") ? {} : (stryCov_9fa48("298"), {
          content: stryMutAct_9fa48("299") ? [] : (stryCov_9fa48("299"), [stryMutAct_9fa48("300") ? {} : (stryCov_9fa48("300"), {
            type: stryMutAct_9fa48("301") ? "" : (stryCov_9fa48("301"), "text"),
            text: buildPreviewOutput(drift, updatedTags, updatedConfig, composed, updatedTier as ContentTier)
          })])
        });
      }
    }

    // Write updated config
    const configYaml = yaml.dump(updatedConfig, stryMutAct_9fa48("302") ? {} : (stryCov_9fa48("302"), {
      lineWidth: 100,
      noRefs: stryMutAct_9fa48("303") ? false : (stryCov_9fa48("303"), true)
    }));
    writeFileSync(join(projectDir, stryMutAct_9fa48("304") ? "" : (stryCov_9fa48("304"), "forgecraft.yaml")), configYaml, stryMutAct_9fa48("305") ? "" : (stryCov_9fa48("305"), "utf-8"));

    // Regenerate instruction files for all targets
    const outputTargets = (args.output_targets ?? updatedConfig.outputTargets ?? [DEFAULT_OUTPUT_TARGET]) as OutputTarget[];
    const releasePhase = stryMutAct_9fa48("306") ? (args.release_phase ?? updatedConfig.releasePhase) && "development" : (stryCov_9fa48("306"), (stryMutAct_9fa48("307") ? args.release_phase && updatedConfig.releasePhase : (stryCov_9fa48("307"), args.release_phase ?? updatedConfig.releasePhase)) ?? (stryMutAct_9fa48("308") ? "" : (stryCov_9fa48("308"), "development")));
    const context = stryMutAct_9fa48("309") ? {} : (stryCov_9fa48("309"), {
      ...detectProjectContext(projectDir, stryMutAct_9fa48("310") ? updatedConfig.projectName && inferProjectName(projectDir) : (stryCov_9fa48("310"), updatedConfig.projectName ?? inferProjectName(projectDir)), detectLanguage(projectDir), updatedTags),
      releasePhase
    });
    let migrationWarning: string | undefined;
    for (const target of outputTargets) {
      if (stryMutAct_9fa48("311")) {
        {}
      } else {
        stryCov_9fa48("311");
        const targetConfig = OUTPUT_TARGET_CONFIGS[target];

        // For claude target: use sentinel tree (default) or monolithic file
        if (stryMutAct_9fa48("314") ? target === "claude" || args.sentinel !== false : stryMutAct_9fa48("313") ? false : stryMutAct_9fa48("312") ? true : (stryCov_9fa48("312", "313", "314"), (stryMutAct_9fa48("316") ? target !== "claude" : stryMutAct_9fa48("315") ? true : (stryCov_9fa48("315", "316"), target === (stryMutAct_9fa48("317") ? "" : (stryCov_9fa48("317"), "claude")))) && (stryMutAct_9fa48("319") ? args.sentinel === false : stryMutAct_9fa48("318") ? true : (stryCov_9fa48("318", "319"), args.sentinel !== (stryMutAct_9fa48("320") ? true : (stryCov_9fa48("320"), false)))))) {
          if (stryMutAct_9fa48("321")) {
            {}
          } else {
            stryCov_9fa48("321");
            const sentinelFiles = renderSentinelTree(composed.instructionBlocks, context);

            // Detect migration: does the existing CLAUDE.md look like a monolithic ForgeCraft file?
            const claudeMdPath = join(projectDir, stryMutAct_9fa48("322") ? "" : (stryCov_9fa48("322"), "CLAUDE.md"));
            if (stryMutAct_9fa48("324") ? false : stryMutAct_9fa48("323") ? true : (stryCov_9fa48("323", "324"), existsSync(claudeMdPath))) {
              if (stryMutAct_9fa48("325")) {
                {}
              } else {
                stryCov_9fa48("325");
                const existing = readFileSync(claudeMdPath, stryMutAct_9fa48("326") ? "" : (stryCov_9fa48("326"), "utf-8"));
                const lineCount = existing.split(stryMutAct_9fa48("327") ? "" : (stryCov_9fa48("327"), "\n")).length;
                const isSentinel = existing.includes(stryMutAct_9fa48("328") ? "" : (stryCov_9fa48("328"), "ForgeCraft sentinel"));
                const isForgeCraftGenerated = stryMutAct_9fa48("331") ? existing.includes("ForgeCraft |") && isSentinel : stryMutAct_9fa48("330") ? false : stryMutAct_9fa48("329") ? true : (stryCov_9fa48("329", "330", "331"), existing.includes(stryMutAct_9fa48("332") ? "" : (stryCov_9fa48("332"), "ForgeCraft |")) || isSentinel);
                if (stryMutAct_9fa48("335") ? !isSentinel || lineCount > 100 : stryMutAct_9fa48("334") ? false : stryMutAct_9fa48("333") ? true : (stryCov_9fa48("333", "334", "335"), (stryMutAct_9fa48("336") ? isSentinel : (stryCov_9fa48("336"), !isSentinel)) && (stryMutAct_9fa48("339") ? lineCount <= 100 : stryMutAct_9fa48("338") ? lineCount >= 100 : stryMutAct_9fa48("337") ? true : (stryCov_9fa48("337", "338", "339"), lineCount > 100)))) {
                  if (stryMutAct_9fa48("340")) {
                    {}
                  } else {
                    stryCov_9fa48("340");
                    // Large non-sentinel CLAUDE.md: extract custom content to project-specific.md
                    migrationWarning = extractCustomContent(projectDir, existing, isForgeCraftGenerated);
                  }
                }
              }
            }

            // Replace all sentinel files (don't merge — they're always ForgeCraft-generated)
            for (const file of sentinelFiles) {
              if (stryMutAct_9fa48("341")) {
                {}
              } else {
                stryCov_9fa48("341");
                const fullPath = join(projectDir, file.relativePath);
                mkdirSync(dirname(fullPath), stryMutAct_9fa48("342") ? {} : (stryCov_9fa48("342"), {
                  recursive: stryMutAct_9fa48("343") ? false : (stryCov_9fa48("343"), true)
                }));
                writeFileSync(fullPath, file.content, stryMutAct_9fa48("344") ? "" : (stryCov_9fa48("344"), "utf-8"));
              }
            }

            // Ensure project-specific.md exists (never overwrite — user-owned)
            ensureProjectSpecific(projectDir);
          }
        } else {
          if (stryMutAct_9fa48("345")) {
            {}
          } else {
            stryCov_9fa48("345");
            const content = renderInstructionFile(composed.instructionBlocks, context, target, stryMutAct_9fa48("346") ? {} : (stryCov_9fa48("346"), {
              compact: updatedConfig.compact
            }));
            const outputPath = targetConfig.directory ? join(projectDir, targetConfig.directory, targetConfig.filename) : join(projectDir, targetConfig.filename);
            writeInstructionFileWithMerge(outputPath, content);
          }
        }
      }
    }
    return stryMutAct_9fa48("347") ? {} : (stryCov_9fa48("347"), {
      content: stryMutAct_9fa48("348") ? [] : (stryCov_9fa48("348"), [stryMutAct_9fa48("349") ? {} : (stryCov_9fa48("349"), {
        type: stryMutAct_9fa48("350") ? "" : (stryCov_9fa48("350"), "text"),
        text: buildAppliedOutput(drift, updatedTags, updatedConfig, composed, updatedTier as ContentTier, stryMutAct_9fa48("353") ? args.sentinel === false : stryMutAct_9fa48("352") ? false : stryMutAct_9fa48("351") ? true : (stryCov_9fa48("351", "352", "353"), args.sentinel !== (stryMutAct_9fa48("354") ? true : (stryCov_9fa48("354"), false))), migrationWarning)
      })])
    });
  }
}

// ── Drift Analysis ───────────────────────────────────────────────────

/**
 * Analyze how the project has drifted from its current config.
 */
function analyzeDrift(projectDir: string, config: ForgeCraftConfig, args: z.infer<typeof refreshProjectSchema>): DriftReport {
  if (stryMutAct_9fa48("355")) {
    {}
  } else {
    stryCov_9fa48("355");
    const currentTags: Tag[] = stryMutAct_9fa48("356") ? config.tags && ["UNIVERSAL"] : (stryCov_9fa48("356"), config.tags ?? (stryMutAct_9fa48("357") ? [] : (stryCov_9fa48("357"), [stryMutAct_9fa48("358") ? "" : (stryCov_9fa48("358"), "UNIVERSAL")])));
    const currentTier: ContentTier = (config.tier ?? "recommended") as ContentTier;
    const requestedTier = (args.tier ?? currentTier) as ContentTier;

    // Re-detect tags from code
    const detections = analyzeProject(projectDir);
    const newTagSuggestions: Array<{
      tag: Tag;
      confidence: number;
      evidence: string[];
    }> = stryMutAct_9fa48("359") ? ["Stryker was here"] : (stryCov_9fa48("359"), []);
    const detectedTagSet = new Set<Tag>();
    for (const d of detections) {
      if (stryMutAct_9fa48("360")) {
        {}
      } else {
        stryCov_9fa48("360");
        detectedTagSet.add(d.tag);
        if (stryMutAct_9fa48("363") ? d.confidence >= SUGGEST_THRESHOLD || !currentTags.includes(d.tag) : stryMutAct_9fa48("362") ? false : stryMutAct_9fa48("361") ? true : (stryCov_9fa48("361", "362", "363"), (stryMutAct_9fa48("366") ? d.confidence < SUGGEST_THRESHOLD : stryMutAct_9fa48("365") ? d.confidence > SUGGEST_THRESHOLD : stryMutAct_9fa48("364") ? true : (stryCov_9fa48("364", "365", "366"), d.confidence >= SUGGEST_THRESHOLD)) && (stryMutAct_9fa48("367") ? currentTags.includes(d.tag) : (stryCov_9fa48("367"), !currentTags.includes(d.tag))))) {
          if (stryMutAct_9fa48("368")) {
            {}
          } else {
            stryCov_9fa48("368");
            newTagSuggestions.push(stryMutAct_9fa48("369") ? {} : (stryCov_9fa48("369"), {
              tag: d.tag,
              confidence: d.confidence,
              evidence: d.evidence
            }));
          }
        }
      }
    }

    // Tags in config that code analysis no longer supports
    const droppedTagCandidates = stryMutAct_9fa48("370") ? currentTags : (stryCov_9fa48("370"), currentTags.filter(stryMutAct_9fa48("371") ? () => undefined : (stryCov_9fa48("371"), t => stryMutAct_9fa48("374") ? t !== "UNIVERSAL" || !detectedTagSet.has(t) : stryMutAct_9fa48("373") ? false : stryMutAct_9fa48("372") ? true : (stryCov_9fa48("372", "373", "374"), (stryMutAct_9fa48("376") ? t === "UNIVERSAL" : stryMutAct_9fa48("375") ? true : (stryCov_9fa48("375", "376"), t !== (stryMutAct_9fa48("377") ? "" : (stryCov_9fa48("377"), "UNIVERSAL")))) && (stryMutAct_9fa48("378") ? detectedTagSet.has(t) : (stryCov_9fa48("378"), !detectedTagSet.has(t)))))));

    // Completeness re-check
    const completeness = checkCompleteness(projectDir, currentTags);
    const completenessGaps = completeness.failing.map(stryMutAct_9fa48("379") ? () => undefined : (stryCov_9fa48("379"), f => f.check));
    const completenessFixed = completeness.passing.map(stryMutAct_9fa48("380") ? () => undefined : (stryCov_9fa48("380"), p => p.check));

    // Tier change
    const tierChange = (stryMutAct_9fa48("383") ? requestedTier === currentTier : stryMutAct_9fa48("382") ? false : stryMutAct_9fa48("381") ? true : (stryCov_9fa48("381", "382", "383"), requestedTier !== currentTier)) ? stryMutAct_9fa48("384") ? {} : (stryCov_9fa48("384"), {
      from: currentTier,
      to: requestedTier
    }) : null;

    // Block count comparison (before vs after)
    const allTemplates = loadAllTemplatesWithExtras(undefined, config.templateDirs);
    const beforeComposed = composeTemplates(currentTags, allTemplates, stryMutAct_9fa48("385") ? {} : (stryCov_9fa48("385"), {
      config
    }));
    const proposedTags = computeUpdatedTags(currentTags, newTagSuggestions, args.add_tags as Tag[] | undefined, args.remove_tags as Tag[] | undefined);
    const afterConfig = stryMutAct_9fa48("386") ? {} : (stryCov_9fa48("386"), {
      ...config,
      tags: proposedTags,
      tier: requestedTier
    });
    const afterComposed = composeTemplates(proposedTags, allTemplates, stryMutAct_9fa48("387") ? {} : (stryCov_9fa48("387"), {
      config: afterConfig
    }));
    return stryMutAct_9fa48("388") ? {} : (stryCov_9fa48("388"), {
      currentTags,
      newTagSuggestions,
      droppedTagCandidates,
      completenessGaps,
      completenessFixed,
      tierChange,
      blockCountDelta: stryMutAct_9fa48("389") ? {} : (stryCov_9fa48("389"), {
        before: beforeComposed.claudeMdBlocks.length,
        after: afterComposed.claudeMdBlocks.length
      })
    });
  }
}

// ── Tag Computation ──────────────────────────────────────────────────

/**
 * Compute the updated tag set from current tags, suggestions, and explicit adds/removes.
 */
function computeUpdatedTags(currentTags: Tag[], suggestions: Array<{
  tag: Tag;
  confidence: number;
}>, addTags?: Tag[], removeTags?: Tag[]): Tag[] {
  if (stryMutAct_9fa48("390")) {
    {}
  } else {
    stryCov_9fa48("390");
    const tagSet = new Set<Tag>(currentTags);

    // Add high-confidence suggestions
    for (const s of suggestions) {
      if (stryMutAct_9fa48("391")) {
        {}
      } else {
        stryCov_9fa48("391");
        if (stryMutAct_9fa48("395") ? s.confidence < 0.6 : stryMutAct_9fa48("394") ? s.confidence > 0.6 : stryMutAct_9fa48("393") ? false : stryMutAct_9fa48("392") ? true : (stryCov_9fa48("392", "393", "394", "395"), s.confidence >= 0.6)) {
          if (stryMutAct_9fa48("396")) {
            {}
          } else {
            stryCov_9fa48("396");
            tagSet.add(s.tag);
          }
        }
      }
    }

    // Explicit adds
    if (stryMutAct_9fa48("398") ? false : stryMutAct_9fa48("397") ? true : (stryCov_9fa48("397", "398"), addTags)) {
      if (stryMutAct_9fa48("399")) {
        {}
      } else {
        stryCov_9fa48("399");
        for (const t of addTags) {
          if (stryMutAct_9fa48("400")) {
            {}
          } else {
            stryCov_9fa48("400");
            tagSet.add(t);
          }
        }
      }
    }

    // Explicit removes (never remove UNIVERSAL)
    if (stryMutAct_9fa48("402") ? false : stryMutAct_9fa48("401") ? true : (stryCov_9fa48("401", "402"), removeTags)) {
      if (stryMutAct_9fa48("403")) {
        {}
      } else {
        stryCov_9fa48("403");
        for (const t of removeTags) {
          if (stryMutAct_9fa48("404")) {
            {}
          } else {
            stryCov_9fa48("404");
            if (stryMutAct_9fa48("407") ? t === "UNIVERSAL" : stryMutAct_9fa48("406") ? false : stryMutAct_9fa48("405") ? true : (stryCov_9fa48("405", "406", "407"), t !== (stryMutAct_9fa48("408") ? "" : (stryCov_9fa48("408"), "UNIVERSAL")))) {
              if (stryMutAct_9fa48("409")) {
                {}
              } else {
                stryCov_9fa48("409");
                tagSet.delete(t);
              }
            }
          }
        }
      }
    }

    // Ensure UNIVERSAL
    tagSet.add(stryMutAct_9fa48("410") ? "" : (stryCov_9fa48("410"), "UNIVERSAL"));
    return Array.from(tagSet);
  }
}

// ── Output Formatting ────────────────────────────────────────────────

/**
 * Infer project name from directory path.
 */
function inferProjectName(projectDir: string): string {
  if (stryMutAct_9fa48("411")) {
    {}
  } else {
    stryCov_9fa48("411");
    const parts = stryMutAct_9fa48("412") ? projectDir.replace(/\\/g, "/").split("/") : (stryCov_9fa48("412"), projectDir.replace(/\\/g, stryMutAct_9fa48("413") ? "" : (stryCov_9fa48("413"), "/")).split(stryMutAct_9fa48("414") ? "" : (stryCov_9fa48("414"), "/")).filter(Boolean));
    return stryMutAct_9fa48("415") ? parts[parts.length - 1] && "my-project" : (stryCov_9fa48("415"), parts[stryMutAct_9fa48("416") ? parts.length + 1 : (stryCov_9fa48("416"), parts.length - 1)] ?? (stryMutAct_9fa48("417") ? "" : (stryCov_9fa48("417"), "my-project")));
  }
}

/**
 * Output when no forgecraft.yaml exists.
 */
function buildNoConfigOutput(projectDir: string): string {
  if (stryMutAct_9fa48("418")) {
    {}
  } else {
    stryCov_9fa48("418");
    return (stryMutAct_9fa48("419") ? `` : (stryCov_9fa48("419"), `# No Configuration Found\n\n`)) + (stryMutAct_9fa48("420") ? `` : (stryCov_9fa48("420"), `No forgecraft.yaml or .forgecraft.json found in \`${projectDir}\`.\n\n`)) + (stryMutAct_9fa48("421") ? `` : (stryCov_9fa48("421"), `Run setup first to initialize your project configuration:\n`)) + (stryMutAct_9fa48("422") ? `` : (stryCov_9fa48("422"), `  npx forgecraft-mcp setup ${projectDir}\n`));
  }
}

/**
 * Build the preview (dry-run) output for proposed changes.
 */
function buildPreviewOutput(drift: DriftReport, updatedTags: Tag[], _config: ForgeCraftConfig, composed: ReturnType<typeof composeTemplates>, tier: ContentTier): string {
  if (stryMutAct_9fa48("423")) {
    {}
  } else {
    stryCov_9fa48("423");
    let text = stryMutAct_9fa48("424") ? `` : (stryCov_9fa48("424"), `# Refresh Preview\n\n`);
    text += stryMutAct_9fa48("425") ? `` : (stryCov_9fa48("425"), `**Current Tags:** ${drift.currentTags.map(stryMutAct_9fa48("426") ? () => undefined : (stryCov_9fa48("426"), t => stryMutAct_9fa48("427") ? `` : (stryCov_9fa48("427"), `[${t}]`))).join(stryMutAct_9fa48("428") ? "" : (stryCov_9fa48("428"), " "))}\n`);
    text += stryMutAct_9fa48("429") ? `` : (stryCov_9fa48("429"), `**Proposed Tags:** ${updatedTags.map(stryMutAct_9fa48("430") ? () => undefined : (stryCov_9fa48("430"), t => stryMutAct_9fa48("431") ? `` : (stryCov_9fa48("431"), `[${t}]`))).join(stryMutAct_9fa48("432") ? "" : (stryCov_9fa48("432"), " "))}\n`);
    text += stryMutAct_9fa48("433") ? `` : (stryCov_9fa48("433"), `**Tier:** ${tier}\n\n`);

    // New tag suggestions
    if (stryMutAct_9fa48("437") ? drift.newTagSuggestions.length <= 0 : stryMutAct_9fa48("436") ? drift.newTagSuggestions.length >= 0 : stryMutAct_9fa48("435") ? false : stryMutAct_9fa48("434") ? true : (stryCov_9fa48("434", "435", "436", "437"), drift.newTagSuggestions.length > 0)) {
      if (stryMutAct_9fa48("438")) {
        {}
      } else {
        stryCov_9fa48("438");
        text += stryMutAct_9fa48("439") ? `` : (stryCov_9fa48("439"), `## New Tags Detected\n`);
        for (const s of drift.newTagSuggestions) {
          if (stryMutAct_9fa48("440")) {
            {}
          } else {
            stryCov_9fa48("440");
            const marker = (stryMutAct_9fa48("444") ? s.confidence < 0.6 : stryMutAct_9fa48("443") ? s.confidence > 0.6 : stryMutAct_9fa48("442") ? false : stryMutAct_9fa48("441") ? true : (stryCov_9fa48("441", "442", "443", "444"), s.confidence >= 0.6)) ? stryMutAct_9fa48("445") ? "" : (stryCov_9fa48("445"), "✅ auto-add") : stryMutAct_9fa48("446") ? "" : (stryCov_9fa48("446"), "💡 suggest");
            text += stryMutAct_9fa48("447") ? `` : (stryCov_9fa48("447"), `- **[${s.tag}]** (${Math.round(stryMutAct_9fa48("448") ? s.confidence / 100 : (stryCov_9fa48("448"), s.confidence * 100))}%) — ${marker}: ${s.evidence.join(stryMutAct_9fa48("449") ? "" : (stryCov_9fa48("449"), ", "))}\n`);
          }
        }
        text += stryMutAct_9fa48("450") ? "" : (stryCov_9fa48("450"), "\n");
      }
    }

    // Dropped tag candidates
    if (stryMutAct_9fa48("454") ? drift.droppedTagCandidates.length <= 0 : stryMutAct_9fa48("453") ? drift.droppedTagCandidates.length >= 0 : stryMutAct_9fa48("452") ? false : stryMutAct_9fa48("451") ? true : (stryCov_9fa48("451", "452", "453", "454"), drift.droppedTagCandidates.length > 0)) {
      if (stryMutAct_9fa48("455")) {
        {}
      } else {
        stryCov_9fa48("455");
        text += stryMutAct_9fa48("456") ? `` : (stryCov_9fa48("456"), `## Tags No Longer Detected\n`);
        text += stryMutAct_9fa48("457") ? `` : (stryCov_9fa48("457"), `_These tags are in your config but not detected in code. Consider removing if no longer relevant._\n`);
        stryMutAct_9fa48("458") ? text -= drift.droppedTagCandidates.map(t => `- [${t}]`).join("\n") : (stryCov_9fa48("458"), text += drift.droppedTagCandidates.map(stryMutAct_9fa48("459") ? () => undefined : (stryCov_9fa48("459"), t => stryMutAct_9fa48("460") ? `` : (stryCov_9fa48("460"), `- [${t}]`))).join(stryMutAct_9fa48("461") ? "" : (stryCov_9fa48("461"), "\n")));
        text += stryMutAct_9fa48("462") ? "" : (stryCov_9fa48("462"), "\n\n");
      }
    }

    // Tier change
    if (stryMutAct_9fa48("464") ? false : stryMutAct_9fa48("463") ? true : (stryCov_9fa48("463", "464"), drift.tierChange)) {
      if (stryMutAct_9fa48("465")) {
        {}
      } else {
        stryCov_9fa48("465");
        text += stryMutAct_9fa48("466") ? `` : (stryCov_9fa48("466"), `## Tier Change\n`);
        text += stryMutAct_9fa48("467") ? `` : (stryCov_9fa48("467"), `${drift.tierChange.from} → ${drift.tierChange.to}\n\n`);
      }
    }

    // Block delta
    text += stryMutAct_9fa48("468") ? `` : (stryCov_9fa48("468"), `## Content Impact\n`);
    text += stryMutAct_9fa48("469") ? `` : (stryCov_9fa48("469"), `- Instruction blocks: ${drift.blockCountDelta.before} → ${drift.blockCountDelta.after}\n`);
    text += stryMutAct_9fa48("470") ? `` : (stryCov_9fa48("470"), `- Total available: ${composed.instructionBlocks.length} blocks, ${composed.nfrBlocks.length} NFRs, ${composed.hooks.length} hooks, ${composed.skills.length} skills\n\n`);

    // Gaps
    if (stryMutAct_9fa48("474") ? drift.completenessGaps.length <= 0 : stryMutAct_9fa48("473") ? drift.completenessGaps.length >= 0 : stryMutAct_9fa48("472") ? false : stryMutAct_9fa48("471") ? true : (stryCov_9fa48("471", "472", "473", "474"), drift.completenessGaps.length > 0)) {
      if (stryMutAct_9fa48("475")) {
        {}
      } else {
        stryCov_9fa48("475");
        text += stryMutAct_9fa48("476") ? `` : (stryCov_9fa48("476"), `## Remaining Gaps\n`);
        stryMutAct_9fa48("477") ? text -= drift.completenessGaps.map(g => `- ${g}`).join("\n") : (stryCov_9fa48("477"), text += drift.completenessGaps.map(stryMutAct_9fa48("478") ? () => undefined : (stryCov_9fa48("478"), g => stryMutAct_9fa48("479") ? `` : (stryCov_9fa48("479"), `- ${g}`))).join(stryMutAct_9fa48("480") ? "" : (stryCov_9fa48("480"), "\n")));
        text += stryMutAct_9fa48("481") ? "" : (stryCov_9fa48("481"), "\n\n");
      }
    }
    text += stryMutAct_9fa48("482") ? `` : (stryCov_9fa48("482"), `_Run with --apply to write changes: \`npx forgecraft-mcp refresh <project_dir> --apply\`_`);
    return text;
  }
}
const PROJECT_SPECIFIC_PLACEHOLDER = stryMutAct_9fa48("483") ? `` : (stryCov_9fa48("483"), `# Project-Specific Rules
<!-- This file is owned by YOU. ForgeCraft will never overwrite it. -->
<!-- Add project-specific rules, framework choices, conventions, and custom corrections here. -->
<!-- The sentinel CLAUDE.md links here for any AI reading your project. -->

## Framework & Stack Choices
<!-- e.g. We use Prisma for ORM. Deploy target is Railway. -->

## Custom Corrections
<!-- Log corrections here so the AI learns from them. -->
<!-- Format: - YYYY-MM-DD: [description of correction] -->

## Project-Specific Gates
<!-- Add any quality rules specific to this project that don't belong in universal standards. -->
`);

/**
 * Ensures .claude/standards/project-specific.md exists.
 * Never overwrites an existing file — this file is user-owned.
 */
function ensureProjectSpecific(projectDir: string): void {
  if (stryMutAct_9fa48("484")) {
    {}
  } else {
    stryCov_9fa48("484");
    const filePath = join(projectDir, stryMutAct_9fa48("485") ? "" : (stryCov_9fa48("485"), ".claude"), stryMutAct_9fa48("486") ? "" : (stryCov_9fa48("486"), "standards"), stryMutAct_9fa48("487") ? "" : (stryCov_9fa48("487"), "project-specific.md"));
    if (stryMutAct_9fa48("490") ? false : stryMutAct_9fa48("489") ? true : stryMutAct_9fa48("488") ? existsSync(filePath) : (stryCov_9fa48("488", "489", "490"), !existsSync(filePath))) {
      if (stryMutAct_9fa48("491")) {
        {}
      } else {
        stryCov_9fa48("491");
        mkdirSync(dirname(filePath), stryMutAct_9fa48("492") ? {} : (stryCov_9fa48("492"), {
          recursive: stryMutAct_9fa48("493") ? false : (stryCov_9fa48("493"), true)
        }));
        writeFileSync(filePath, PROJECT_SPECIFIC_PLACEHOLDER, stryMutAct_9fa48("494") ? "" : (stryCov_9fa48("494"), "utf-8"));
      }
    }
  }
}

/**
 * Migrates content from a large monolithic CLAUDE.md to project-specific.md.
 * Extracts sections that look like user-added content (not ForgeCraft template output).
 * Returns a migration warning message.
 */
function extractCustomContent(projectDir: string, existingContent: string, isForgeCraftGenerated: boolean): string {
  if (stryMutAct_9fa48("495")) {
    {}
  } else {
    stryCov_9fa48("495");
    const projectSpecificPath = join(projectDir, stryMutAct_9fa48("496") ? "" : (stryCov_9fa48("496"), ".claude"), stryMutAct_9fa48("497") ? "" : (stryCov_9fa48("497"), "standards"), stryMutAct_9fa48("498") ? "" : (stryCov_9fa48("498"), "project-specific.md"));
    if (stryMutAct_9fa48("500") ? false : stryMutAct_9fa48("499") ? true : (stryCov_9fa48("499", "500"), existsSync(projectSpecificPath))) {
      if (stryMutAct_9fa48("501")) {
        {}
      } else {
        stryCov_9fa48("501");
        const existing = readFileSync(projectSpecificPath, stryMutAct_9fa48("502") ? "" : (stryCov_9fa48("502"), "utf-8"));
        if (stryMutAct_9fa48("505") ? false : stryMutAct_9fa48("504") ? true : stryMutAct_9fa48("503") ? existing.includes(PROJECT_SPECIFIC_PLACEHOLDER.slice(0, 40)) : (stryCov_9fa48("503", "504", "505"), !existing.includes(stryMutAct_9fa48("506") ? PROJECT_SPECIFIC_PLACEHOLDER : (stryCov_9fa48("506"), PROJECT_SPECIFIC_PLACEHOLDER.slice(0, 40))))) {
          if (stryMutAct_9fa48("507")) {
            {}
          } else {
            stryCov_9fa48("507");
            // User has already edited project-specific.md — don't touch it
            return isForgeCraftGenerated ? stryMutAct_9fa48("508") ? "" : (stryCov_9fa48("508"), "Your existing CLAUDE.md was a ForgeCraft-generated monolithic file. It has been replaced with a sentinel. Custom content was NOT migrated because `.claude/standards/project-specific.md` already contains your edits.") : stryMutAct_9fa48("509") ? "" : (stryCov_9fa48("509"), "Your existing CLAUDE.md appears to be custom. It has been replaced with the sentinel. Back up any custom rules you need into `.claude/standards/project-specific.md`.");
          }
        }
      }
    }

    // Extract sections that look custom (not standard ForgeCraft headers)
    const forgecraftHeaders = new Set(stryMutAct_9fa48("510") ? [] : (stryCov_9fa48("510"), [stryMutAct_9fa48("511") ? "" : (stryCov_9fa48("511"), "Code Standards"), stryMutAct_9fa48("512") ? "" : (stryCov_9fa48("512"), "Production Code Standards"), stryMutAct_9fa48("513") ? "" : (stryCov_9fa48("513"), "SOLID Principles"), stryMutAct_9fa48("514") ? "" : (stryCov_9fa48("514"), "Zero Hardcoded Values"), stryMutAct_9fa48("515") ? "" : (stryCov_9fa48("515"), "Zero Mocks in Application Code"), stryMutAct_9fa48("516") ? "" : (stryCov_9fa48("516"), "Interfaces First"), stryMutAct_9fa48("517") ? "" : (stryCov_9fa48("517"), "Dependency Injection"), stryMutAct_9fa48("518") ? "" : (stryCov_9fa48("518"), "Error Handling"), stryMutAct_9fa48("519") ? "" : (stryCov_9fa48("519"), "Modular from Day One"), stryMutAct_9fa48("520") ? "" : (stryCov_9fa48("520"), "Layered Architecture"), stryMutAct_9fa48("521") ? "" : (stryCov_9fa48("521"), "Clean Code Principles"), stryMutAct_9fa48("522") ? "" : (stryCov_9fa48("522"), "CI/CD"), stryMutAct_9fa48("523") ? "" : (stryCov_9fa48("523"), "Testing Pyramid"), stryMutAct_9fa48("524") ? "" : (stryCov_9fa48("524"), "Data Guardrails"), stryMutAct_9fa48("525") ? "" : (stryCov_9fa48("525"), "Commit Protocol"), stryMutAct_9fa48("526") ? "" : (stryCov_9fa48("526"), "MCP-Powered Tooling"), stryMutAct_9fa48("527") ? "" : (stryCov_9fa48("527"), "Engineering Preferences"), stryMutAct_9fa48("528") ? "" : (stryCov_9fa48("528"), "Library / Package Standards"), stryMutAct_9fa48("529") ? "" : (stryCov_9fa48("529"), "CLI Standards"), stryMutAct_9fa48("530") ? "" : (stryCov_9fa48("530"), "API Standards"), stryMutAct_9fa48("531") ? "" : (stryCov_9fa48("531"), "Security"), stryMutAct_9fa48("532") ? "" : (stryCov_9fa48("532"), "Graceful Shutdown"), stryMutAct_9fa48("533") ? "" : (stryCov_9fa48("533"), "Project Identity")]));
    const lines = existingContent.split(stryMutAct_9fa48("534") ? "" : (stryCov_9fa48("534"), "\n"));
    const customSections: string[] = stryMutAct_9fa48("535") ? ["Stryker was here"] : (stryCov_9fa48("535"), []);
    let inCustomSection = stryMutAct_9fa48("536") ? true : (stryCov_9fa48("536"), false);
    let currentSection: string[] = stryMutAct_9fa48("537") ? ["Stryker was here"] : (stryCov_9fa48("537"), []);
    let currentHeader = stryMutAct_9fa48("538") ? "Stryker was here!" : (stryCov_9fa48("538"), "");
    for (const line of lines) {
      if (stryMutAct_9fa48("539")) {
        {}
      } else {
        stryCov_9fa48("539");
        const headerMatch = line.match(stryMutAct_9fa48("544") ? /^#{1,3}\s+(.)/ : stryMutAct_9fa48("543") ? /^#{1,3}\S+(.+)/ : stryMutAct_9fa48("542") ? /^#{1,3}\s(.+)/ : stryMutAct_9fa48("541") ? /^#\s+(.+)/ : stryMutAct_9fa48("540") ? /#{1,3}\s+(.+)/ : (stryCov_9fa48("540", "541", "542", "543", "544"), /^#{1,3}\s+(.+)/));
        if (stryMutAct_9fa48("546") ? false : stryMutAct_9fa48("545") ? true : (stryCov_9fa48("545", "546"), headerMatch)) {
          if (stryMutAct_9fa48("547")) {
            {}
          } else {
            stryCov_9fa48("547");
            if (stryMutAct_9fa48("550") ? inCustomSection || currentSection.length > 2 : stryMutAct_9fa48("549") ? false : stryMutAct_9fa48("548") ? true : (stryCov_9fa48("548", "549", "550"), inCustomSection && (stryMutAct_9fa48("553") ? currentSection.length <= 2 : stryMutAct_9fa48("552") ? currentSection.length >= 2 : stryMutAct_9fa48("551") ? true : (stryCov_9fa48("551", "552", "553"), currentSection.length > 2)))) {
              if (stryMutAct_9fa48("554")) {
                {}
              } else {
                stryCov_9fa48("554");
                customSections.push(stryMutAct_9fa48("555") ? currentSection.join("\n") : (stryCov_9fa48("555"), currentSection.join(stryMutAct_9fa48("556") ? "" : (stryCov_9fa48("556"), "\n")).trim()));
              }
            }
            currentHeader = stryMutAct_9fa48("557") ? headerMatch[1] : (stryCov_9fa48("557"), headerMatch[1].trim());
            inCustomSection = stryMutAct_9fa48("558") ? Array.from(forgecraftHeaders).some(h => currentHeader.toLowerCase().includes(h.toLowerCase())) : (stryCov_9fa48("558"), !(stryMutAct_9fa48("559") ? Array.from(forgecraftHeaders).every(h => currentHeader.toLowerCase().includes(h.toLowerCase())) : (stryCov_9fa48("559"), Array.from(forgecraftHeaders).some(stryMutAct_9fa48("560") ? () => undefined : (stryCov_9fa48("560"), h => stryMutAct_9fa48("561") ? currentHeader.toUpperCase().includes(h.toLowerCase()) : (stryCov_9fa48("561"), currentHeader.toLowerCase().includes(stryMutAct_9fa48("562") ? h.toUpperCase() : (stryCov_9fa48("562"), h.toLowerCase()))))))));
            currentSection = stryMutAct_9fa48("563") ? [] : (stryCov_9fa48("563"), [line]);
          }
        } else {
          if (stryMutAct_9fa48("564")) {
            {}
          } else {
            stryCov_9fa48("564");
            currentSection.push(line);
          }
        }
      }
    }
    if (stryMutAct_9fa48("567") ? inCustomSection || currentSection.length > 2 : stryMutAct_9fa48("566") ? false : stryMutAct_9fa48("565") ? true : (stryCov_9fa48("565", "566", "567"), inCustomSection && (stryMutAct_9fa48("570") ? currentSection.length <= 2 : stryMutAct_9fa48("569") ? currentSection.length >= 2 : stryMutAct_9fa48("568") ? true : (stryCov_9fa48("568", "569", "570"), currentSection.length > 2)))) {
      if (stryMutAct_9fa48("571")) {
        {}
      } else {
        stryCov_9fa48("571");
        customSections.push(stryMutAct_9fa48("572") ? currentSection.join("\n") : (stryCov_9fa48("572"), currentSection.join(stryMutAct_9fa48("573") ? "" : (stryCov_9fa48("573"), "\n")).trim()));
      }
    }
    if (stryMutAct_9fa48("577") ? customSections.length <= 0 : stryMutAct_9fa48("576") ? customSections.length >= 0 : stryMutAct_9fa48("575") ? false : stryMutAct_9fa48("574") ? true : (stryCov_9fa48("574", "575", "576", "577"), customSections.length > 0)) {
      if (stryMutAct_9fa48("578")) {
        {}
      } else {
        stryCov_9fa48("578");
        const extracted = stryMutAct_9fa48("579") ? `` : (stryCov_9fa48("579"), `# Project-Specific Rules
<!-- Migrated from monolithic CLAUDE.md by ForgeCraft sentinel upgrade -->
<!-- Review and clean up — some content below may have been incorrectly classified as custom -->

${customSections.join(stryMutAct_9fa48("580") ? "" : (stryCov_9fa48("580"), "\n\n"))}
`);
        mkdirSync(dirname(projectSpecificPath), stryMutAct_9fa48("581") ? {} : (stryCov_9fa48("581"), {
          recursive: stryMutAct_9fa48("582") ? false : (stryCov_9fa48("582"), true)
        }));
        writeFileSync(projectSpecificPath, extracted, stryMutAct_9fa48("583") ? "" : (stryCov_9fa48("583"), "utf-8"));
        return stryMutAct_9fa48("584") ? `` : (stryCov_9fa48("584"), `Your CLAUDE.md (${existingContent.split(stryMutAct_9fa48("585") ? "" : (stryCov_9fa48("585"), "\n")).length} lines) has been converted to a sentinel. ${customSections.length} custom section(s) were extracted to \`.claude/standards/project-specific.md\` — please review that file and clean it up.`);
      }
    }
    ensureProjectSpecific(projectDir);
    return stryMutAct_9fa48("586") ? `` : (stryCov_9fa48("586"), `Your CLAUDE.md (${existingContent.split(stryMutAct_9fa48("587") ? "" : (stryCov_9fa48("587"), "\n")).length} lines) has been converted to a sentinel. No custom sections were detected. Review \`.claude/standards/project-specific.md\` and add any project-specific rules you need.`);
  }
}

/**
 * Build the output after applying changes.
 */
function buildAppliedOutput(drift: DriftReport, updatedTags: Tag[], config: ForgeCraftConfig, composed: ReturnType<typeof composeTemplates>, tier: ContentTier, usedSentinel = stryMutAct_9fa48("588") ? false : (stryCov_9fa48("588"), true), migrationWarning?: string): string {
  if (stryMutAct_9fa48("589")) {
    {}
  } else {
    stryCov_9fa48("589");
    const configYaml = yaml.dump(config, stryMutAct_9fa48("590") ? {} : (stryCov_9fa48("590"), {
      lineWidth: 100,
      noRefs: stryMutAct_9fa48("591") ? false : (stryCov_9fa48("591"), true)
    }));
    let text = stryMutAct_9fa48("592") ? `` : (stryCov_9fa48("592"), `# Project Refreshed\n\n`);
    text += stryMutAct_9fa48("593") ? `` : (stryCov_9fa48("593"), `**Tags:** ${updatedTags.map(stryMutAct_9fa48("594") ? () => undefined : (stryCov_9fa48("594"), t => stryMutAct_9fa48("595") ? `` : (stryCov_9fa48("595"), `[${t}]`))).join(stryMutAct_9fa48("596") ? "" : (stryCov_9fa48("596"), " "))}\n`);
    text += stryMutAct_9fa48("597") ? `` : (stryCov_9fa48("597"), `**Tier:** ${tier}\n\n`);
    text += stryMutAct_9fa48("598") ? `` : (stryCov_9fa48("598"), `## Changes Applied\n`);
    text += stryMutAct_9fa48("599") ? `` : (stryCov_9fa48("599"), `- forgecraft.yaml — updated\n`);
    if (stryMutAct_9fa48("601") ? false : stryMutAct_9fa48("600") ? true : (stryCov_9fa48("600", "601"), usedSentinel)) {
      if (stryMutAct_9fa48("602")) {
        {}
      } else {
        stryCov_9fa48("602");
        text += stryMutAct_9fa48("603") ? `` : (stryCov_9fa48("603"), `- CLAUDE.md — replaced with sentinel (~50 lines)\n`);
        text += stryMutAct_9fa48("604") ? `` : (stryCov_9fa48("604"), `- .claude/standards/*.md — domain files generated (${composed.instructionBlocks.length} blocks distributed)\n`);
        text += stryMutAct_9fa48("605") ? `` : (stryCov_9fa48("605"), `- .claude/standards/project-specific.md — preserved (user-owned, never overwritten)\n\n`);
      }
    } else {
      if (stryMutAct_9fa48("606")) {
        {}
      } else {
        stryCov_9fa48("606");
        text += stryMutAct_9fa48("607") ? `` : (stryCov_9fa48("607"), `- Instruction files — regenerated (${composed.instructionBlocks.length} blocks)\n\n`);
      }
    }
    if (stryMutAct_9fa48("609") ? false : stryMutAct_9fa48("608") ? true : (stryCov_9fa48("608", "609"), migrationWarning)) {
      if (stryMutAct_9fa48("610")) {
        {}
      } else {
        stryCov_9fa48("610");
        text += stryMutAct_9fa48("611") ? `` : (stryCov_9fa48("611"), `## Migration Notice\n`);
        stryMutAct_9fa48("612") ? text -= migrationWarning + "\n\n" : (stryCov_9fa48("612"), text += migrationWarning + (stryMutAct_9fa48("613") ? "" : (stryCov_9fa48("613"), "\n\n")));
      }
    }
    if (stryMutAct_9fa48("617") ? drift.newTagSuggestions.length <= 0 : stryMutAct_9fa48("616") ? drift.newTagSuggestions.length >= 0 : stryMutAct_9fa48("615") ? false : stryMutAct_9fa48("614") ? true : (stryCov_9fa48("614", "615", "616", "617"), drift.newTagSuggestions.length > 0)) {
      if (stryMutAct_9fa48("618")) {
        {}
      } else {
        stryCov_9fa48("618");
        const added = stryMutAct_9fa48("619") ? drift.newTagSuggestions : (stryCov_9fa48("619"), drift.newTagSuggestions.filter(stryMutAct_9fa48("620") ? () => undefined : (stryCov_9fa48("620"), s => stryMutAct_9fa48("624") ? s.confidence < 0.6 : stryMutAct_9fa48("623") ? s.confidence > 0.6 : stryMutAct_9fa48("622") ? false : stryMutAct_9fa48("621") ? true : (stryCov_9fa48("621", "622", "623", "624"), s.confidence >= 0.6))));
        if (stryMutAct_9fa48("628") ? added.length <= 0 : stryMutAct_9fa48("627") ? added.length >= 0 : stryMutAct_9fa48("626") ? false : stryMutAct_9fa48("625") ? true : (stryCov_9fa48("625", "626", "627", "628"), added.length > 0)) {
          if (stryMutAct_9fa48("629")) {
            {}
          } else {
            stryCov_9fa48("629");
            text += stryMutAct_9fa48("630") ? `` : (stryCov_9fa48("630"), `## New Tags Added\n`);
            stryMutAct_9fa48("631") ? text -= added.map(s => `- [${s.tag}] — ${s.evidence.join(", ")}`).join("\n") : (stryCov_9fa48("631"), text += added.map(stryMutAct_9fa48("632") ? () => undefined : (stryCov_9fa48("632"), s => stryMutAct_9fa48("633") ? `` : (stryCov_9fa48("633"), `- [${s.tag}] — ${s.evidence.join(stryMutAct_9fa48("634") ? "" : (stryCov_9fa48("634"), ", "))}`))).join(stryMutAct_9fa48("635") ? "" : (stryCov_9fa48("635"), "\n")));
            text += stryMutAct_9fa48("636") ? "" : (stryCov_9fa48("636"), "\n\n");
          }
        }
      }
    }
    text += stryMutAct_9fa48("637") ? `` : (stryCov_9fa48("637"), `## What refresh does NOT create\n`);
    text += stryMutAct_9fa48("638") ? `` : (stryCov_9fa48("638"), `Run \`scaffold .\` (without --force) to create any missing artifacts:\n`);
    text += stryMutAct_9fa48("639") ? `` : (stryCov_9fa48("639"), `Status.md, docs/PRD.md, docs/TechSpec.md, docs/adrs/, .env.example, hooks, skills, .gitignore\n\n`);
    text += stryMutAct_9fa48("640") ? `` : (stryCov_9fa48("640"), `## Updated Config\n`);
    text += stryMutAct_9fa48("641") ? `` : (stryCov_9fa48("641"), `\`\`\`yaml\n${configYaml}\`\`\`\n\n`);
    text += stryMutAct_9fa48("642") ? `` : (stryCov_9fa48("642"), `> **Tip:** Remove ForgeCraft from your MCP servers to save tokens (setup is done).\n`);
    text += stryMutAct_9fa48("643") ? `` : (stryCov_9fa48("643"), `> Re-add it when needed: \`claude mcp add forgecraft -- npx -y forgecraft-mcp\`\n\n`);
    text += stryMutAct_9fa48("644") ? `` : (stryCov_9fa48("644"), `⚠️ **Restart required** to pick up CLAUDE.md changes.`);
    return text;
  }
}