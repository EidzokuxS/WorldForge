# 81-01 SUMMARY: GM Read Contract

## Result

Complete.

This slice adds an additive `gm-read.v1` contract for player turns without rewiring the live turn processor yet. GM Read now has a bounded schema for situation, scene question, focal/background refs, action interpretation, path choice, rationale, evidence refs, narration guardrails, and path-specific fields.

## Code Changes

- Added `backend/src/engine/gm-turn-read.ts`.
  - Exports `gmReadSchema`, `runGmRead`, `buildGmReadPrompt`, and `validateGmReadForFrame`.
  - Uses judge role, temperature 0, one retry, and model-facing `SceneFrame` packet redaction.
  - Rejects executable/backend-owned fields recursively, including `plannedTools`, `plannedActions`, `toolName`, `input`, `payload`, `toolInput`, state deltas, HP deltas, inventory deltas, and narrator/backend ID fields.
  - Validates all GM-owned refs against the model-facing frame, rejecting hidden/background/offscreen refs and invented refs.
- Extended `buildGmReadPromptContract` in `backend/src/engine/prompt-contracts.ts`.
  - Lists allowed runtime tools only as advisory context for whether `tool_plan` is appropriate.
  - Explicitly forbids concrete tool payloads and nested runtime tool calls.
- Added `backend/src/engine/__tests__/gm-turn-read.test.ts`.
  - Covers all six paths.
  - Locks `tool_plan` as intent-only at GM Read stage.
  - Locks private/offscreen prompt redaction and private forecast-term filtering.
  - Locks post-generation validation failure for hidden refs.

## Deliberate Non-Changes

- `backend/src/engine/gm-turn-decision.ts` remains in place for now. The live turn path is not rewired in 81-01, so `plannedTools` is still present only in the old decision seam until 81-02/81-03 migrate runtime ownership.
- Opening-scene `world-brain` behavior is unchanged. This plan only establishes the player-turn GM Read contract.

## Verification

```bash
npm --prefix backend exec vitest run src/engine/__tests__/gm-turn-read.test.ts src/engine/__tests__/gm-turn-decision.test.ts
```

Passed: 2 files, 16 tests.

```bash
npm --prefix backend run typecheck
```

Passed.

```bash
git diff --check -- backend/src/engine/gm-turn-read.ts backend/src/engine/__tests__/gm-turn-read.test.ts backend/src/engine/prompt-contracts.ts
```

Passed with only the existing LF-to-CRLF warning for `prompt-contracts.ts`.

GitNexus `detect_changes(scope: "unstaged")` returned CRITICAL because the repository worktree already contains 41 dirty files from adjacent Phase 79/80/81 recovery work. That result is not scoped to this additive slice. The local 81-01 source scope is the three files listed above, with no live turn rewiring in this plan.

## Next

Proceed to 81-02: wire path gating so direct, continue, and clarification can bypass mutating planning, then introduce the new GM Read seam into the live player-turn path under tests.
