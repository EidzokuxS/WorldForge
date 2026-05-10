import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import {
  PHASE94_HARD_INVARIANTS,
  PHASE94_ROUTE_IDS,
} from "../backend/src/engine/phase-94-trace-assertions.js";
import {
  assertPhase94ManifestValid,
  writeJsonFile,
} from "./phase-94/artifact-schema.js";
import { buildPhase94BaselinePool } from "./phase-94/baseline-pool.js";
import {
  buildPhase94Manifest,
  getPhase94Routes,
} from "./phase-94/route-manifest.js";

interface CliArgs {
  manifestOnly: boolean;
  prepareBaselines: boolean;
  dryRun: boolean;
  reuseBaselines: boolean;
  profile: string;
  routeIds: string[];
  turnsPerRoute: number;
  outRoot: string;
}

interface GuardResult {
  status: "passed" | "failed";
  checkedFiles: string[];
  failures: Array<{ file: string; patternId: string }>;
}

const DEFAULT_OUT_ROOT = "output/playwright/phase-94-focused/dry-run";
const DEFAULT_BACKEND_URL = "http://localhost:3001";
const DEFAULT_FRONTEND_URL = "http://localhost:3000";
const PLANNING_PREFLIGHT_PATH = ".planning/phases/94-focused-living-world-playtest-and-runtime-acceptance-gate/evidence/wave-1/harness-preflight.md";

function runId(): string {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function readArgValue(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  if (index === -1) return undefined;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${flag} requires a value.`);
  }
  return value;
}

function parseCliArgs(argv: string[]): CliArgs {
  const args = argv.filter((_, index) => index > 1);
  const routeValue = readArgValue(args, "--routes");
  const turnsValue = readArgValue(args, "--turns");
  return {
    manifestOnly: args.includes("--manifest-only"),
    prepareBaselines: args.includes("--prepare-baselines"),
    dryRun: args.includes("--dry-run"),
    reuseBaselines: args.includes("--reuse-baselines"),
    profile: readArgValue(args, "--profile") ?? "focused",
    routeIds: routeValue ? routeValue.split(",").map((routeId) => routeId.trim()).filter(Boolean) : [...PHASE94_ROUTE_IDS],
    turnsPerRoute: turnsValue ? Number.parseInt(turnsValue, 10) : 3,
    outRoot: readArgValue(args, "--out") ?? DEFAULT_OUT_ROOT,
  };
}

function assertProjectRelativeOutput(outRoot: string): string {
  const projectRoot = resolve(process.cwd());
  const resolved = resolve(outRoot);
  if (resolved !== projectRoot && !resolved.startsWith(`${projectRoot}\\`) && !resolved.startsWith(`${projectRoot}/`)) {
    throw new Error(`Refusing Phase 94 output outside project root: ${resolved}`);
  }
  return resolved;
}

function assertOutputWritable(outRoot: string): void {
  mkdirSync(outRoot, { recursive: true });
  const probePath = resolve(outRoot, ".phase94-write-test");
  writeFileSync(probePath, "ok", "utf-8");
  rmSync(probePath, { force: true });
}

function sourceFilesForGuard(): string[] {
  return [
    "e2e/94-focused-living-world-playtest.ts",
    "e2e/phase-94/artifact-schema.ts",
    "e2e/phase-94/baseline-pool.ts",
    "e2e/phase-94/route-manifest.ts",
    "e2e/phase-94/report-validation.ts",
    "e2e/phase-94/acceptance-report.ts",
  ];
}

function runNoShortcutGuard(): GuardResult {
  const patterns = [
    { id: "abort-signal-timeout", pattern: new RegExp("AbortSignal" + "\\.timeout") },
    { id: "fixed-timeout-call", pattern: new RegExp("\\bset" + "Timeout\\s*\\(") },
    { id: "phase-19-21-timeout-helper", pattern: new RegExp("19-02-gameplay" + "-browser-e2e|21-02-memory" + "-browser-e2e") },
    { id: "final-text-slice", pattern: new RegExp("\\.sli" + "ce\\s*\\(") },
    { id: "fake-success-acceptance", pattern: new RegExp("fake" + "NoOpSuccess\\s*:\\s*true") },
  ];
  const failures: GuardResult["failures"] = [];
  const checkedFiles = sourceFilesForGuard();
  for (const file of checkedFiles) {
    const text = readFileSync(file, "utf-8");
    for (const { id, pattern } of patterns) {
      if (pattern.test(text)) {
        failures.push({ file, patternId: id });
      }
    }
  }
  return {
    status: failures.length === 0 ? "passed" : "failed",
    checkedFiles,
    failures,
  };
}

function writeHarnessPreflight(input: {
  outRoot: string;
  manifestRouteCount: number;
  guard: GuardResult;
  dryRun: boolean;
}): void {
  const lines = [
    "# Phase 94-02 Harness Preflight",
    "",
    `- manifest routes: ${input.manifestRouteCount}`,
    `- output root: ${input.outRoot}`,
    `- dry run: ${input.dryRun}`,
    `- no-shortcut guard: ${input.guard.status}`,
    "- loader note: node --import tsx is used on Node 23 because node --import tsx/esm fails with ERR_REQUIRE_CYCLE_MODULE.",
    "",
    "## Guard Checked Files",
    "",
    ...input.guard.checkedFiles.map((file) => `- ${file}`),
    "",
    "## Guard Failures",
    "",
    input.guard.failures.length === 0
      ? "- none"
      : input.guard.failures.map((failure) => `- ${failure.file}: ${failure.patternId}`).join("\n"),
  ];
  const markdown = `${lines.join("\n")}\n`;
  writeFileSync(resolve(input.outRoot, "harness-preflight.md"), markdown, "utf-8");
  mkdirSync(dirname(PLANNING_PREFLIGHT_PATH), { recursive: true });
  writeFileSync(PLANNING_PREFLIGHT_PATH, markdown, "utf-8");
}

function buildHardInvariantCoverageArtifact(input: {
  runId: string;
  profile: string;
  routes: ReturnType<typeof getPhase94Routes>;
}): unknown {
  return {
    phase: 94,
    runId: input.runId,
    profile: input.profile,
    status: "covered",
    source: "phase-94-deterministic-invariant-contract",
    note: "This file anchors required hard invariant coverage. Route pass/fail is computed from route assertions, raw artifacts, trace rows, and ledgers.",
    invariants: PHASE94_HARD_INVARIANTS,
    routeInvariantCoverage: input.routes.map((route) => ({
      routeId: route.id,
      invariantIds: route.hardInvariantIds,
    })),
  };
}

async function main(): Promise<void> {
  const args = parseCliArgs(process.argv);
  const id = runId();
  const outRoot = assertProjectRelativeOutput(args.outRoot);
  const routes = getPhase94Routes(args.routeIds);
  const requireAllRoutes = args.routeIds.length === PHASE94_ROUTE_IDS.length;
  assertPhase94ManifestValid(routes, { requireAllRoutes });
  const manifest = buildPhase94Manifest({
    runId: id,
    profile: args.profile,
    turnsPerRoute: args.turnsPerRoute,
    routes,
    requireAllRoutes,
  });

  if (args.manifestOnly) {
    console.log(JSON.stringify(manifest, null, 2));
    return;
  }

  assertOutputWritable(outRoot);
  const guard = runNoShortcutGuard();
  if (guard.status !== "passed") {
    throw new Error(`Phase 94 no-shortcut guard failed: ${JSON.stringify(guard.failures)}`);
  }
  const liveRunner = args.prepareBaselines
    ? null
    : (await import("./phase-94/live-runner.js")).runPhase94LiveRoutes;
  const pool = buildPhase94BaselinePool({
    routes,
    runId: id,
    profile: args.profile,
    dryRun: args.dryRun,
    reuseBaselines: args.reuseBaselines,
    outRoot,
  });

  writeJsonFile(resolve(outRoot, "manifest.json"), manifest);
  writeJsonFile(resolve(outRoot, "baseline-pool.json"), pool);
  writeJsonFile(resolve(outRoot, "hard-invariants.json"), buildHardInvariantCoverageArtifact({
    runId: id,
    profile: args.profile,
    routes,
  }));
  writeHarnessPreflight({
    outRoot,
    manifestRouteCount: manifest.routes.length,
    guard,
    dryRun: args.dryRun,
  });
  if (!args.prepareBaselines) {
    if (!liveRunner) throw new Error("Phase 94 live runner failed to load.");
    await liveRunner({
      routes,
      baselinePool: pool,
      outRoot,
      backendUrl: process.env.PHASE94_BACKEND_URL ?? process.env.BACKEND_URL ?? DEFAULT_BACKEND_URL,
      frontendUrl: process.env.PHASE94_FRONTEND_URL ?? process.env.FRONTEND_URL ?? DEFAULT_FRONTEND_URL,
      turnsPerRoute: args.turnsPerRoute,
    });
  }
  console.log(JSON.stringify({
    phase: 94,
    runId: id,
    manifestRoutes: manifest.routes.length,
    baselines: pool.baselines.length,
    routeClones: pool.routeClones.length,
    outRoot,
    dryRun: args.dryRun,
  }, null, 2));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
