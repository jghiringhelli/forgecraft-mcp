/**
 * Package.json analyzer.
 *
 * Detects frameworks, languages, and project characteristics from
 * package.json, tsconfig.json, pyproject.toml, and similar config files.
 */

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { createLogger } from "../shared/logger/index.js";
import type { Tag } from "../shared/types.js";

const logger = createLogger("analyzers/package-json");

/** Detection result with confidence and evidence. */
export interface Detection {
  readonly tag: Tag;
  readonly confidence: number;
  readonly evidence: string[];
}

/** Framework/dependency patterns that map to tags. */
const DEPENDENCY_PATTERNS: Array<{
  packages: string[];
  tag: Tag;
  evidence: string;
}> = [
  { packages: ["react", "react-dom"], tag: "WEB-REACT", evidence: "react in dependencies" },
  { packages: ["next"], tag: "WEB-REACT", evidence: "next.js in dependencies" },
  { packages: ["@remix-run/react"], tag: "WEB-REACT", evidence: "remix in dependencies" },
  { packages: ["express", "fastify", "koa", "hapi", "nestjs"], tag: "API", evidence: "HTTP framework in dependencies" },
  { packages: ["ethers", "web3", "viem", "@solana/web3.js"], tag: "WEB3", evidence: "blockchain library in dependencies" },
  { packages: ["socket.io", "ws", "pusher"], tag: "REALTIME", evidence: "WebSocket library in dependencies" },
  { packages: ["xstate", "robot3"], tag: "STATE-MACHINE", evidence: "state machine library in dependencies" },
  { packages: ["phaser", "pixi.js", "three", "babylon"], tag: "GAME", evidence: "game engine in dependencies" },
  { packages: ["commander", "yargs", "meow", "oclif"], tag: "CLI", evidence: "CLI framework in dependencies" },
  { packages: ["react-native", "expo"], tag: "MOBILE", evidence: "mobile framework in dependencies" },
  { packages: ["@tensorflow/tfjs", "onnxruntime-node"], tag: "ML", evidence: "ML library in dependencies" },
  { packages: ["terraform-cdk", "pulumi", "@aws-cdk"], tag: "INFRA", evidence: "IaC library in dependencies" },
];

/** File patterns that indicate tags. Optional confidence overrides the default 0.7. */
const FILE_PATTERNS: Array<{
  files: string[];
  tag: Tag;
  evidence: string;
  confidence?: number;
}> = [
  { files: ["next.config.js", "next.config.mjs", "next.config.ts"], tag: "WEB-REACT", evidence: "next.config found" },
  { files: ["tsconfig.json"], tag: "LIBRARY", evidence: "TypeScript project" },
  { files: [".solhint.json", "hardhat.config.ts", "foundry.toml"], tag: "WEB3", evidence: "smart contract tooling found" },
  // Docker alone is insufficient for INFRA — set below 0.6 threshold.
  // IaC deps (terraform-cdk, pulumi, @aws-cdk) in DEPENDENCY_PATTERNS correctly trigger INFRA at 0.6+.
  { files: ["Dockerfile", "docker-compose.yml", "docker-compose.yaml"], tag: "INFRA", evidence: "Docker config found", confidence: 0.45 },
];

/**
 * Analyze a project directory and detect likely tags from config files.
 */
export function analyzeProject(projectDir: string): Detection[] {
  const detections: Detection[] = [];

  // Check package.json
  const packageJsonPath = join(projectDir, "package.json");
  if (existsSync(packageJsonPath)) {
    const packageDetections = analyzePackageJson(packageJsonPath);
    detections.push(...packageDetections);
  }

  // Check for file-based indicators
  const fileDetections = analyzeFilePresence(projectDir);
  detections.push(...fileDetections);

  // Check for Python project
  const pyDetections = analyzePythonProject(projectDir);
  detections.push(...pyDetections);

  // Check if it has bin entry (CLI indicator)
  if (existsSync(packageJsonPath)) {
    const binDetection = analyzeBinEntry(packageJsonPath);
    if (binDetection) {
      detections.push(binDetection);
    }
  }

  // Deduplicate by tag, keeping highest confidence
  const deduped = deduplicateDetections(detections);

  logger.info("Project analysis complete", {
    projectDir,
    detections: deduped.length,
    tags: deduped.map((d) => d.tag),
  });

  return deduped;
}

/**
 * Analyze package.json dependencies for framework detection.
 */
function analyzePackageJson(filePath: string): Detection[] {
  try {
    const content = readFileSync(filePath, "utf-8");
    const pkg = JSON.parse(content) as Record<string, unknown>;
    const allDeps = {
      ...(pkg["dependencies"] as Record<string, string> | undefined),
      ...(pkg["devDependencies"] as Record<string, string> | undefined),
    };
    const depNames = Object.keys(allDeps);

    const detections: Detection[] = [];

    for (const pattern of DEPENDENCY_PATTERNS) {
      const found = pattern.packages.filter((p) => depNames.includes(p));
      if (found.length > 0) {
        detections.push({
          tag: pattern.tag,
          confidence: Math.min(0.6 + found.length * 0.15, 0.95),
          evidence: [pattern.evidence, `found: ${found.join(", ")}`],
        });
      }
    }

    return detections;
  } catch (error) {
    logger.warn("Failed to parse package.json", {
      path: filePath,
      error: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
}

/**
 * Check for presence of indicator files.
 */
function analyzeFilePresence(projectDir: string): Detection[] {
  const detections: Detection[] = [];

  for (const pattern of FILE_PATTERNS) {
    const found = pattern.files.filter((f) =>
      existsSync(join(projectDir, f)),
    );
    if (found.length > 0) {
      detections.push({
        tag: pattern.tag,
        confidence: pattern.confidence ?? 0.7,
        evidence: [pattern.evidence, `found: ${found.join(", ")}`],
      });
    }
  }

  return detections;
}

/**
 * Analyze Python project configuration files.
 */
function analyzePythonProject(projectDir: string): Detection[] {
  const detections: Detection[] = [];
  const pyprojectPath = join(projectDir, "pyproject.toml");

  if (existsSync(pyprojectPath)) {
    try {
      const content = readFileSync(pyprojectPath, "utf-8");

      if (content.includes("fastapi") || content.includes("flask") || content.includes("django")) {
        detections.push({
          tag: "API",
          confidence: 0.85,
          evidence: ["Python web framework in pyproject.toml"],
        });
      }

      if (content.includes("pandas") || content.includes("apache-airflow") || content.includes("prefect")) {
        detections.push({
          tag: "DATA-PIPELINE",
          confidence: 0.8,
          evidence: ["Data processing library in pyproject.toml"],
        });
      }

      if (content.includes("scikit-learn") || content.includes("torch") || content.includes("tensorflow")) {
        detections.push({
          tag: "ML",
          confidence: 0.85,
          evidence: ["ML framework in pyproject.toml"],
        });
      }
    } catch {
      // pyproject.toml parsing failed, skip
    }
  }

  return detections;
}

/**
 * Check if package.json has a bin entry (CLI indicator).
 */
function analyzeBinEntry(filePath: string): Detection | null {
  try {
    const content = readFileSync(filePath, "utf-8");
    const pkg = JSON.parse(content) as Record<string, unknown>;

    if (pkg["bin"]) {
      return {
        tag: "CLI",
        confidence: 0.8,
        evidence: ["bin entry found in package.json"],
      };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Deduplicate detections by tag, keeping highest confidence per tag.
 */
function deduplicateDetections(detections: Detection[]): Detection[] {
  const byTag = new Map<Tag, Detection>();

  for (const detection of detections) {
    const existing = byTag.get(detection.tag);
    if (!existing || detection.confidence > existing.confidence) {
      byTag.set(detection.tag, {
        ...detection,
        evidence: existing
          ? [...existing.evidence, ...detection.evidence]
          : detection.evidence,
      });
    }
  }

  return Array.from(byTag.values());
}

/**
 * Analyze a text description for tag mentions.
 */
export function analyzeDescription(description: string): Detection[] {
  const detections: Detection[] = [];
  const lower = description.toLowerCase();

  const descriptionPatterns: Array<{
    keywords: string[];
    tag: Tag;
    evidence: string;
  }> = [
    { keywords: ["react", "next.js", "nextjs", "frontend", "ui component"], tag: "WEB-REACT", evidence: "React/frontend mentioned in description" },
    { keywords: ["api", "rest", "graphql", "backend", "server", "endpoint"], tag: "API", evidence: "API/backend mentioned in description" },
    { keywords: ["blockchain", "crypto", "defi", "web3", "solidity", "ethereum", "smart contract"], tag: "WEB3", evidence: "Blockchain/Web3 mentioned in description" },
    { keywords: ["game", "arcade", "gameplay", "player"], tag: "GAME", evidence: "Game mentioned in description" },
    { keywords: ["social", "networking", "linkedin", "profile", "feed", "connection"], tag: "SOCIAL", evidence: "Social features mentioned in description" },
    { keywords: ["realtime", "real-time", "websocket", "live", "streaming"], tag: "REALTIME", evidence: "Real-time features mentioned in description" },
    { keywords: ["state machine", "workflow", "finite state", "transition"], tag: "STATE-MACHINE", evidence: "State machine mentioned in description" },
    { keywords: ["cli", "command-line", "command line", "terminal tool"], tag: "CLI", evidence: "CLI tool mentioned in description" },
    { keywords: ["library", "package", "npm", "sdk", "module"], tag: "LIBRARY", evidence: "Library/package mentioned in description" },
    { keywords: ["data pipeline", "etl", "data processing", "batch"], tag: "DATA-PIPELINE", evidence: "Data pipeline mentioned in description" },
    { keywords: ["machine learning", "ml model", "training", "inference", "neural"], tag: "ML", evidence: "ML mentioned in description" },
    { keywords: ["hipaa", "phi", "healthcare", "medical", "patient"], tag: "HEALTHCARE", evidence: "Healthcare mentioned in description" },
    { keywords: ["financial", "fintech", "payment", "transaction", "banking"], tag: "FINTECH", evidence: "Fintech mentioned in description" },
    { keywords: ["analytics", "dashboard", "reporting", "metrics", "data warehouse"], tag: "ANALYTICS", evidence: "Analytics mentioned in description" },
    { keywords: ["mobile", "react native", "flutter", "ios", "android"], tag: "MOBILE", evidence: "Mobile mentioned in description" },
    { keywords: ["infrastructure", "terraform", "kubernetes", "devops", "deploy"], tag: "INFRA", evidence: "Infrastructure mentioned in description" },
  ];

  for (const pattern of descriptionPatterns) {
    const found = pattern.keywords.filter((kw) => lower.includes(kw));
    if (found.length > 0) {
      detections.push({
        tag: pattern.tag,
        confidence: Math.min(0.5 + found.length * 0.15, 0.9),
        evidence: [pattern.evidence],
      });
    }
  }

  return deduplicateDetections(detections);
}
