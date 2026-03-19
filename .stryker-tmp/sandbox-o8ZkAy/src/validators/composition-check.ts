/**
 * Composition validator — checks that a set of GenerativeSpec artifacts
 * can be composed without conflicts.
 *
 * Detects:
 *   - Circular dependencies (acyclicity violation)
 *   - Overlapping scope conflicts (two specs governing the same artifact)
 *   - Incompatible constraint pairs
 */
// @ts-nocheck


import type { GenerativeSpec, CompositionConflict, BoundedSpec, ComposableSpec } from "../core/index.js";

/** Result of a composition check between all registered specs. */
export interface CompositionReport {
  readonly composable: boolean;
  readonly conflicts: ReadonlyArray<CompositionConflict>;
  readonly cyclicDependencies: ReadonlyArray<ReadonlyArray<string>>;
}

/**
 * Check whether a set of GenerativeSpec artifacts can be composed without conflict.
 *
 * @param specs - All specs in the composition
 * @returns Report of conflicts and circular dependencies
 */
export function checkComposition(specs: ReadonlyArray<GenerativeSpec>): CompositionReport {
  const conflicts: CompositionConflict[] = [];

  // Pairwise conflict check
  for (let i = 0; i < specs.length; i++) {
    for (let j = i + 1; j < specs.length; j++) {
      const a = specs[i]!;
      const b = specs[j]!;
      const found = a.composeWith(b as unknown as ComposableSpec & BoundedSpec);
      conflicts.push(...found);
    }
  }

  // Cyclic dependency check (DFS)
  const adjacency = new Map<string, ReadonlyArray<string>>(
    specs.map((s) => [s.specId, s.dependsOn]),
  );
  const cycles = detectCycles(adjacency);

  return {
    composable: conflicts.length === 0 && cycles.length === 0,
    conflicts,
    cyclicDependencies: cycles,
  };
}

/** DFS-based cycle detection on a directed adjacency map. */
function detectCycles(
  graph: ReadonlyMap<string, ReadonlyArray<string>>,
): ReadonlyArray<ReadonlyArray<string>> {
  const cycles: string[][] = [];
  const visited = new Set<string>();
  const path = new Set<string>();

  function dfs(node: string, trail: string[]): void {
    if (path.has(node)) {
      const cycleStart = trail.indexOf(node);
      cycles.push(trail.slice(cycleStart));
      return;
    }
    if (visited.has(node)) return;

    visited.add(node);
    path.add(node);

    for (const neighbor of graph.get(node) ?? []) {
      dfs(neighbor, [...trail, neighbor]);
    }

    path.delete(node);
  }

  for (const node of graph.keys()) {
    dfs(node, [node]);
  }

  return cycles;
}
