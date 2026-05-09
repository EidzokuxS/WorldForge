---
phase: 88-living-world-authority-spine-and-key-npc-co-player-process-simulation
reviewed: 2026-05-08T02:03:41Z
depth: deep
files_reviewed: 12
files_reviewed_list:
  - backend/src/engine/__tests__/actor-decision-packet.test.ts
  - backend/src/engine/__tests__/actor-tools.test.ts
  - backend/src/engine/actor-brain.ts
  - backend/src/engine/actor-tools.ts
  - backend/src/engine/gm-beat-plan.ts
  - backend/src/engine/hidden-adjudication.ts
  - backend/src/engine/narrator-packet.ts
  - backend/src/engine/prompt-contracts.ts
  - backend/src/engine/scene-plan-schema.ts
  - backend/src/engine/tool-execution-context.ts
  - backend/src/engine/tool-executor.ts
  - backend/src/engine/tool-schemas.ts
findings:
  critical: 4
  warning: 1
  info: 0
  total: 5
status: issues_found
---

# Phase 88 Wave 4D: Code Review Report

**Reviewed:** 2026-05-08T02:03:41Z
**Depth:** deep
**Files Reviewed:** 12
**Status:** issues_found

## Summary

Reviewed the current diff adding `request_contested_outcome`. Focused tests pass, but the implementation has authority, grounding, and visibility defects that should be fixed before shipping.

## Critical Issues

### CR-01: BLOCKER - Actor turns can request contests on behalf of the wrong actor

**File:** `backend/src/engine/tool-execution-context.ts:527`
**Issue:** `request_contested_outcome` only checks `actorName` and `targetName` against `legalActorRefs`. In actor turns, that set is populated with the observer plus every clear active/support actor and target candidate (`tool-execution-context.ts:220-231`, `258-262`). Nothing requires `actorName` to match `context.subjectActorId`. A key NPC can therefore submit `{ actorName: "Player", targetName: "Watcher" }`, and the backend will compute player-authored combat bounds while committing an NPC authority trace.
**Fix:** For `scope === "actor_turn"`, require `actorName` to match the observer's id/actorId/label, not any visible actor. For scene-plan/player-turn execution, pass the planned action owner into grounding and require `actorName` to match that owner. Add tests for actorName != observer and action.actorId != input.actorName.

### CR-02: BLOCKER - Hidden adjudication exposes the tool without authority or grounding

**File:** `backend/src/engine/hidden-adjudication.ts:25`
**Issue:** `adjudicationActionSchema` now accepts `request_contested_outcome`, but `executeAdjudicationPlan` calls `executeToolCall` without a `ToolExecutionContext` (`hidden-adjudication.ts:146-152`). That bypasses base-world-version validation, authority tracing, and scoped ref grounding. The handler then resolves actor/target campaign-wide by id/name (`tool-executor.ts:1468-1475`), so hidden adjudication can use the new "authoritative" tool with no authoritative record.
**Fix:** Remove this tool from hidden adjudication unless a real authority context is supplied. If hidden use is intended, pass an authority-bearing context and add tests that hidden-adjudication contested outcomes create traces and reject out-of-scope refs.

### CR-03: BLOCKER - Returned bounds do not reach the final narrator prompt

**File:** `backend/src/engine/turn-processor.ts:798`
**Issue:** `scenePlanActionToPacketEffect` calls `summarizeRuntimeToolResultForNarrator` without `toolResult`, so the new request summary cannot see the accepted `matchup` or bounds (`narrator-packet.ts:313-323`). `collectPerceivableEffects` keeps the prebuilt packet effect before generated effects (`narrator-packet.ts:426-438`), and prompt formatting prints only `effect.summary` (`narrator-packet.ts:511-518`, `player-facing-packet.ts:315-316`). Net effect: the backend computes `allowedEffects`/`prohibitedEffects`, but final narration sees only a generic "bounded without a settled outcome" line.
**Fix:** Pass `toolResult` into `scenePlanActionToPacketEffect`, and make the contested summary include compact allowed/prohibited consequences. Add an integration test asserting final narration prompt text contains the returned bounds and not only the generic summary.

### CR-04: BLOCKER - Non-mutating bounds requests are recorded as state deltas

**File:** `backend/src/engine/tool-executor.ts:1827`
**Issue:** `stateDeltaRefsForToolResult` disables broad payload inference, then still records `actorName`, `targetName`, `mode`, ids, and `matchup` as `stateDeltaRefs`. `finalizeAuthorityResult` commits those refs and marks `requireStateDelta: true` (`tool-executor.ts:1953-1972`). A read-only bounds request that promises no HP, movement, inventory, tag, or relationship mutation is therefore stored as if it changed actor/matchup state.
**Fix:** Do not use `stateDeltaRefs` for read-only bounds. Either introduce a separate authority field/table for `knowledgeOutputs`/bounds refs, or allow an authoritative trace with empty `stateDeltaRefs` for `request_contested_outcome`. Add tests that contested outcome traces do not contain labels, modes, or matchup tokens as state deltas.

## Warnings

### WR-01: WARNING - Raw combat math is returned and logged as a tool result

**File:** `backend/src/engine/tool-executor.ts:1531`
**Issue:** The result includes `combatSummaryLines`, `posture`, and `outcomeBounds`; the combat envelope lines include exact tier/rank comparisons and target vulnerability text (`combat-envelope.ts:300-312`, `1054-1058`). `executeToolCall` logs the full `resultForLog` (`tool-executor.ts:2109-2113`), and player-facing packet construction copies perceivable effects with raw `toolResult` attached (`player-facing-packet.ts:180-188`). Even if prompt formatting currently omits raw tool results, this creates a hidden-stat leakage surface in logs/debug packet consumers.
**Fix:** Return a sanitized public bounds payload, keep exact stat math internal, and redact `request_contested_outcome` tool results before logging or copying into player-facing/perceivable effect objects.

---

_Reviewed: 2026-05-08T02:03:41Z_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: deep_

## Re-Review After Blocker Fixes

**Reviewed:** 2026-05-08T02:47Z
**Reviewer:** Parfit
**Status:** PASS

Parfit re-reviewed the Wave 4D blocker fixes and found no new critical issue in the scoped pass.

Closure refs:

- Actor/target grounding now uses action-scoped `subjectActorRefs`, wired through scene-plan validation/execution.
- Hidden adjudication no longer exposes `request_contested_outcome`.
- Narrator packet summaries receive the accepted tool result and include compact allowed/prohibited bounds.
- Contested outcome authority traces suppress `stateDeltaRefs` because bounds requests are not entity mutations.
- Public/logged contested result payloads omit raw combat tier guidance.
