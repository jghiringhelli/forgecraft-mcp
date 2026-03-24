/**
 * External code quality probes — language-agnostic design.
 *
 * Re-exports all probes from domain-scoped modules under probes/.
 */

export type { ProbeResult } from "./probes/tool-runner.js";
export type { LocData } from "./probes/loc-probe.js";
export type { CoverageData } from "./probes/coverage-probe.js";
export type { LayerData } from "./probes/layer-probe.js";
export type { DeadCodeData } from "./probes/dead-code-probe.js";
export type { ComplexityData } from "./probes/complexity-probe.js";
export type { MutationData } from "./probes/mutation-probe.js";

export { probeLoc } from "./probes/loc-probe.js";
export { probeCoverage } from "./probes/coverage-probe.js";
export { probeLayerViolations } from "./probes/layer-probe.js";
export { probeDeadCode } from "./probes/dead-code-probe.js";
export { probeComplexity } from "./probes/complexity-probe.js";
export { probeMutation } from "./probes/mutation-probe.js";
