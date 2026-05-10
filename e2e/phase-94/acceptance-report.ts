import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { writeJsonFile } from "./artifact-schema.js";
import { validatePhase94ReportArtifacts } from "./report-validation.js";

interface CliArgs {
  inputRoot: string;
  requireAllRoutes: boolean | null;
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
  const inputRoot = readArgValue(args, "--input");
  if (!inputRoot) {
    throw new Error("--input is required.");
  }
  return {
    inputRoot,
    requireAllRoutes: args.includes("--require-all-routes")
      ? true
      : args.includes("--allow-subset")
        ? false
        : null,
  };
}

function renderMarkdown(input: ReturnType<typeof validatePhase94ReportArtifacts>): string {
  const { report } = input;
  const lines = [
    "# Phase 94 Acceptance Report",
    "",
    `- status: ${report.status}`,
    `- run id: ${report.runId}`,
    `- profile: ${report.profile}`,
    `- route mode: ${report.requiredRouteMode}`,
    `- input root: ${report.inputRoot}`,
    "",
    "## Metrics",
    "",
    `- route completion ratio: ${report.metrics.route_completion_ratio}`,
    `- hard failure count: ${report.metrics.hard_failure_count}`,
    `- missing artifact count: ${report.metrics.missing_artifact_count}`,
    `- parser-like response rate: ${report.metrics.parser_like_response_rate}`,
    `- empty assistant text count: ${report.metrics.empty_assistant_text_count}`,
    `- stale job count: ${report.metrics.stale_job_count}`,
    "",
    "## Routes",
    "",
    ...report.routeSummaries.map((route) => (
      `- ${route.routeId}: ${route.status}, turns ${route.terminalDoneCount}/${route.turnCount}, hard failures ${route.hardFailureCount}, missing artifacts ${route.missingArtifactCount}`
    )),
    "",
    "## Hard Diagnostics",
    "",
  ];
  const hardDiagnostics = report.diagnostics.filter((diagnostic) => diagnostic.severity === "hard");
  if (hardDiagnostics.length === 0) {
    lines.push("- none");
  } else {
    for (const diagnostic of hardDiagnostics) {
      lines.push(`- ${diagnostic.routeId} / ${diagnostic.gate}: ${diagnostic.message}`);
    }
  }
  lines.push(
    "",
    "## Soft Review",
    "",
    report.softNotes.length === 0
      ? "- not present; Phase 94-05 owns prose and playfeel review."
      : `- soft notes: ${report.softNotes.length}`,
    "",
  );
  return `${lines.join("\n")}\n`;
}

async function main(): Promise<void> {
  const args = parseCliArgs(process.argv);
  const result = validatePhase94ReportArtifacts({
    inputRoot: args.inputRoot,
    requireAllRoutes: args.requireAllRoutes ?? undefined,
  });
  const inputRoot = resolve(args.inputRoot);
  writeJsonFile(resolve(inputRoot, "acceptance-report.json"), result.report);
  writeJsonFile(resolve(inputRoot, "living-world-assertions.json"), result.livingWorldAssertions);
  writeFileSync(resolve(inputRoot, "acceptance-report.md"), renderMarkdown(result), "utf-8");
  console.log(JSON.stringify({
    phase: 94,
    status: result.report.status,
    runId: result.report.runId,
    profile: result.report.profile,
    requiredRouteMode: result.report.requiredRouteMode,
    routeCount: result.report.routeSummaries.length,
    hardFailureCount: result.report.hardFailures.length,
    missingArtifactCount: result.report.metrics.missing_artifact_count,
    reportPath: resolve(inputRoot, "acceptance-report.json"),
  }, null, 2));
  if (result.report.status !== "passed") {
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
