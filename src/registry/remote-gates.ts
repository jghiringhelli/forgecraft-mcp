import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { dump as yamlDump } from "js-yaml";

export interface RemoteGate {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly category: string;
  readonly gsProperty: string;
  readonly phase: string;
  readonly hook: string;
  readonly check: string;
  readonly passCriterion: string;
  readonly tags?: string[];
  readonly owasp_asvs_level?: number;
  readonly evidence?: string;
  readonly status: "approved" | "quarantine";
  readonly contributor?: string;
}

export interface RemoteGatesIndex {
  readonly generatedAt: string;
  readonly version: string;
  readonly gateCount: number;
  readonly tags: string[];
  readonly gates: RemoteGate[];
}

const DEFAULT_REGISTRY_URL =
  "https://raw.githubusercontent.com/jghiringhelli/quality-gates/master/index.json";

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

interface CacheEntry {
  readonly fetchedAt: string;
  readonly data: RemoteGatesIndex;
}

/**
 * Fetches the remote quality-gates registry index.
 * Uses a local cache with 24-hour TTL to avoid hitting GitHub on every tool call.
 * Falls back to empty gate list if fetch fails (never crashes the tool).
 *
 * @param projectRoot - Project root for cache file location.
 * @param registryUrl - Override registry URL (from forgecraft.yaml).
 * @returns The remote gates index, or an empty index on failure.
 */
export async function fetchRemoteGates(
  projectRoot: string,
  registryUrl?: string,
): Promise<RemoteGatesIndex> {
  const url = registryUrl ?? DEFAULT_REGISTRY_URL;
  const cachePath = join(projectRoot, ".forgecraft", "gates-cache.json");

  const cached = readCache(cachePath);
  if (cached) return cached.data;

  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(5000), // 5 second timeout
      headers: { Accept: "application/json" },
    });
    if (!response.ok) return emptyIndex();

    const data = (await response.json()) as RemoteGatesIndex;
    writeCache(cachePath, data, projectRoot);
    return data;
  } catch {
    // Network failure, timeout, or parse error — fail gracefully
    return emptyIndex();
  }
}

/**
 * Returns gates from the remote registry filtered by tags.
 * Returns all gates if tags is empty.
 *
 * @param index - The remote gates index to filter.
 * @param tags - Tag strings to match against (case-insensitive). Empty = return all.
 * @returns Filtered array of remote gates.
 */
export function filterGatesByTags(
  index: RemoteGatesIndex,
  tags: string[],
): readonly RemoteGate[] {
  if (tags.length === 0) return index.gates;
  return index.gates.filter(
    (g) =>
      !g.tags ||
      g.tags.length === 0 ||
      g.tags.some((t) => tags.includes(t.toUpperCase())),
  );
}

/**
 * Install tag-matching approved registry gates into the project as YAML files.
 *
 * Gates land in `.forgecraft/gates/registry/<category>/<id>.yaml` — the
 * community-suggestion area. The dev/AI reviews and promotes relevant gates
 * to `.forgecraft/gates/active/` (human-judgment step — registry gates are
 * never auto-activated).
 *
 * Idempotent: existing files are never overwritten. Quarantined gates are skipped.
 *
 * @param projectRoot - Target project root
 * @param index - The fetched remote gates index
 * @param tags - Active project tags to filter by
 * @returns Relative paths of gate files written
 */
export function installRemoteGates(
  projectRoot: string,
  index: RemoteGatesIndex,
  tags: string[],
): string[] {
  const written: string[] = [];
  const matching = filterGatesByTags(index, tags).filter(
    (g) => g.status === "approved",
  );

  for (const gate of matching) {
    const category = sanitizePathSegment(gate.category || "general");
    const id = sanitizePathSegment(gate.id);
    if (!id) continue;

    const dir = join(projectRoot, ".forgecraft", "gates", "registry", category);
    const filePath = join(dir, `${id}.yaml`);
    if (existsSync(filePath)) continue;

    try {
      mkdirSync(dir, { recursive: true });
      writeFileSync(
        filePath,
        yamlDump(
          {
            id: gate.id,
            title: gate.title,
            description: gate.description,
            domain: gate.category,
            gsProperty: gate.gsProperty,
            phase: gate.phase,
            hook: gate.hook,
            check: gate.check,
            passCriterion: gate.passCriterion,
            tags: gate.tags ?? [],
            ...(gate.evidence ? { evidence: gate.evidence } : {}),
            source: "community-registry",
          },
          { lineWidth: 100, noRefs: true },
        ),
        "utf-8",
      );
      written.push(`.forgecraft/gates/registry/${category}/${id}.yaml`);
    } catch {
      // Single gate write failure is non-fatal — continue with the rest
    }
  }

  return written;
}

/** Strip path-traversal characters from a gate-supplied path segment. */
function sanitizePathSegment(segment: string): string {
  return segment.replace(/[^a-zA-Z0-9_-]/g, "-").replace(/^-+|-+$/g, "");
}

function readCache(cachePath: string): CacheEntry | null {
  if (!existsSync(cachePath)) return null;
  try {
    const entry = JSON.parse(readFileSync(cachePath, "utf-8")) as CacheEntry;
    const age = Date.now() - new Date(entry.fetchedAt).getTime();
    if (age > CACHE_TTL_MS) return null;
    return entry;
  } catch {
    return null;
  }
}

function writeCache(
  cachePath: string,
  data: RemoteGatesIndex,
  projectRoot: string,
): void {
  try {
    const dir = join(projectRoot, ".forgecraft");
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const entry: CacheEntry = { fetchedAt: new Date().toISOString(), data };
    writeFileSync(cachePath, JSON.stringify(entry, null, 2), "utf-8");
  } catch {
    // Cache write failure is non-fatal
  }
}

function emptyIndex(): RemoteGatesIndex {
  return {
    generatedAt: new Date().toISOString(),
    version: "1",
    gateCount: 0,
    tags: [],
    gates: [],
  };
}
