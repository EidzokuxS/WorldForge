---
phase: 81
reviewed_at: 2026-05-03
reviewers:
  - gemini
  - claude
  - opencode
  - cursor-agent
  - codex-cli-failed
  - gsd-plan-checker
  - gsd-runtime-explorer
  - gsd-verification-checker
---

# Cross-AI Plan Review - Phase 81

## Verdict

FLAG before execution. The architecture direction is right, but the first draft was under-specified in the exact places that determine whether Phase 81 becomes playable GM orchestration or another fragile structured-output stack.

## Reviewer Notes

### Gemini

Verdict: FLAG.

Main concern: the original checklist-without-payloads design creates an N+1 latency trap. A mutating turn could become `GM Read -> Checklist -> Tool Step 1 -> Tool Step 2 -> ... -> Narration`, which risks playability.

Amendment: allow the checklist to carry bounded initial candidate tool requests on the happy path, then execute them sequentially through backend validation. Use per-step revision only when a candidate tool request fails validation.

### Claude

Verdict: FLAG.

Main concerns:

- tool-step envelope schema was not defined;
- path-classification gate needed explicit authority;
- rollback wording conflicted across docs;
- existing test migration surface was not enumerated;
- live gate needed rubric and latency measurement.

### OpenCode / Cursor Review

Verdict: FLAG.

Main concerns:

- dirty Phase 79/80 worktree makes implementation risky;
- `gm-beat-plan.ts` still exists and has no cleanup owner;
- tool-step loop lacked concrete numeric bounds;
- GM Read schema and Oracle injection were under-specified;
- SSE stage mapping was too vague.

### GSD Plan Checker

Verdict: FLAG.

Main concerns:

- Stage 0 frame/forecast envelope was underplanned;
- dependencies between plans were implicit;
- checklist -> tool request -> tool result -> narrator packet needs a shared result/status contract;
- redaction centralization was missing.

### Runtime Explorer

Verdict: partly compatible, not drop-in.

Findings:

- current runtime already has the high-level skeleton, but GM Read does not exist;
- `gm-turn-decision` still allows concrete `plannedTools.input`;
- mutating paths still use one static `ScenePlanner`;
- tool-step feedback loop does not exist;
- riskiest files are `turn-processor.ts`, `tool-executor.ts`, `tool-execution-context.ts`, `scene-plan-validator.ts`, `semantic-scene-plan-schema.ts`, `narrator-packet.ts`, `scene-assembly.ts`, and `routes/chat.ts`.

### Verification Checker

Verdict: FLAG, near BLOCK.

Main concerns:

- live gate lacked objective pass/fail rubric;
- rejected/revised/skipped tool behavior must be deterministic, not left to a live run happening to trigger it;
- DB/state mutation proof was missing;
- SSE/stage assertions and telemetry correlation need explicit gates.

### Codex CLI

Failed. The installed Codex CLI rejected the default `gpt-5.5` model as requiring a newer CLI/app version. No review content was produced.

## Consensus Amendments

1. Add a baseline/preflight plan before source edits.
2. Define Stage 0 frame/forecast envelope tests.
3. Define `runGmRead` and a concrete compact GM Read schema.
4. Replace the absolute "no tool payloads in checklist" rule with a bounded happy-path `candidateToolRequest` per checklist item, backend-validated step by step.
5. Define a shared step status/result envelope: `stepId`, `status`, `attempt`, `toolName`, `validationError`, `visibleEffect`, `privateGuardTerms`, and DB mutation correlation.
6. Use per-step revision only on validation failure; do not repair the whole checklist.
7. Add numeric bounds: checklist max 6, total tool requests max 8, one revision per step.
8. Clarify rollback: successful tool steps are settled; failed later steps are skipped/aborted and must not be narrated as happened. Turn-level catastrophic errors still use existing route rollback.
9. Add path/stage SSE taxonomy and frontend status assertions.
10. Add deterministic failure fixtures for invalid ref, invalid payload, revision success, repeated failure skip, partial branch abort, and failed-effect narration exclusion.
11. Add DB before/after state assertions for single-tool, multi-step, failed-step, and route rollback cases.
12. Add live playability matrix with objective per-turn rubric, provider/model, latency, path, stage order, tool statuses, DB deltas, and narration verdict.
13. Add explicit `gm-beat-plan` cleanup owner.
14. Expand GitNexus impact targets and require `gitnexus_detect_changes()` before closeout.

## Decision

Proceed only after amending Phase 81 plans with the consensus changes. Execution should not start from the first draft.
