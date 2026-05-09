# Phase 88 Harness Preflight And Overnight GLM Run

Date: 2026-05-08

## Intent

Before leaving the Phase 88 live proof to run for hours, validate the harness itself so it does not fail every 30 minutes from test-runner fragility rather than gameplay behavior.

The user intentionally selected `glm-5-turbo` for the live model path to avoid burning more OpenCode quota. This run preserves that setting and does not override it.

## Harness Checks

- Fresh live runs default to provisioning new campaigns unless `PHASE88_REUSE_EXISTING_CAMPAIGNS=1` is explicitly set.
- `PHASE88_CAMPAIGN_IDS` remains available only for explicit regression runs against known campaign ids.
- Deterministic `deep` profile passed after route expectation tuning and stall-guard changes:
  - Artifact: `output/playwright/phase-88-living-world/deterministic-deep-20260508-harness-stall-guard/summary.json`
  - Coverage: 8 routes, 14 turns, 0 hard failures, 14 soft-review samples.
- Backend typecheck passed after the harness stall-guard change.
- Judge calibration dry-run passed and wrote `output/playwright/phase-88-living-world/judge-calibration.json`.
- Frontend/backend listeners answered current health checks before launch:
  - Backend `http://localhost:3001/api/health` returned `{"status":"ok"}`.
  - Frontend `http://localhost:3000` returned HTTP 200.

## Stall Guard Correction

The previous live run exposed a harness bug: a route could log a "turn still running" line for thousands of seconds even when `submitted=false`, `assistant=false`, and `spinner=false`.

That is not a long model turn. It means the player action did not reach chat history while the UI was idle.

The harness now distinguishes:

- Real long model work: the action is submitted or the assistant is in progress; no arbitrary model-turn timeout is enforced.
- Lost submission / stale UI: no submitted user message, no assistant message, and no spinner. The harness reloads and resubmits within the configured retry budget, then records `action_submission_lost` instead of waiting forever.

## Overnight Run

- Artifact: `output/playwright/phase-88-living-world/live-deep-20260508-overnight-glm/`
- Runner: detached `Start-Process` PowerShell process, PID stored in `pid.txt`.
- Mode/profile: `PHASE88_MODE=live`, `PHASE88_PROFILE=deep`.
- Fresh campaigns: yes; no `PHASE88_REUSE_EXISTING_CAMPAIGNS`, no `PHASE88_CAMPAIGN_IDS`.
- Retry budget: `PHASE88_FETCH_RETRY_LIMIT=18`, `PHASE88_ACTION_SUBMIT_RETRY_LIMIT=3`.
- Output log: `run.out.log`.

Initial monitoring confirmed the first fresh campaign worldgen began and progressed through SSE keepalive/progress events.
