param(
  [switch]$DryRun,
  [switch]$Force
)

$ErrorActionPreference = "Stop"

$outDir = Resolve-Path "output/oracle/phase95-architecture-full-cycle-r4"
$prompt = @"
Read the attached Phase 95 Full-Cycle Architecture R4 request first, then review the attached current-head architecture document, harness rubric, and source files. This is an architecture-level GO/NO-GO review for the WorldForge gameplay loop as a playable LLM-driven RPG, not a narrow diff review and not scripted-playtest acceptance.
"@

$files = @(
  "output/oracle/phase95-architecture-full-cycle-r4/REQUEST.md",
  "docs/phase95-current-gameplay-cycle-architecture-r4-2026-05-24.md",
  "AGENTS.md",
  "C:/Users/robra/.agents/skills/agents-best-practices/SKILL.md",
  "backend/src/routes/chat.ts",
  "backend/src/routes/campaigns.ts",
  "backend/src/engine/gameplay-control-plane-contract.ts",
  "backend/src/engine/gm-tool-loop.ts",
  "backend/src/engine/tool-execution-context.ts",
  "backend/src/engine/tool-executor.ts",
  "backend/src/engine/runtime-tool-descriptors.ts",
  "backend/src/engine/runtime-tool-input-schemas.ts",
  "backend/src/engine/narration-grounding-guard.ts",
  "backend/src/campaign/restore-bundle.ts",
  "backend/src/campaign/store-manifest.ts",
  "backend/src/campaign/clone.ts",
  "frontend/lib/api.ts"
)

$argsList = @()
if ($DryRun) {
  $argsList += @("--dry-run", "summary", "--files-report")
}
if ($Force) {
  $argsList += @("--force")
}

$argsList += @(
  "--engine", "browser",
  "--model", "gpt-5.5-pro",
  "--slug", "phase95-architecture-full-cycle-r4",
  "--browser-bundle-files",
  "--browser-bundle-format", "text",
  "--browser-attachments", "always",
  "--write-output", (Join-Path $outDir "oracle-review.md"),
  "--prompt", $prompt
)

foreach ($file in $files) {
  $resolved = Resolve-Path $file
  $argsList += @("--file", $resolved.Path)
}

& oracle @argsList
