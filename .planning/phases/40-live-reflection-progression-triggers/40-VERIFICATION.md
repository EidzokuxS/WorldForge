---
phase: 40-live-reflection-progression-triggers
verified: 2026-04-10T03:52:08.3585349Z
status: human_needed
score: 3/3 must-haves verified
re_verification:
  previous_status: gaps_found
  previous_score: 2/3
  gaps_closed:
    - "After reflection fires, later turns show changed NPC beliefs, goals, relationships, or progression state that the player can observe."
  gaps_remaining: []
  regressions: []
human_verification:
  - test: "Play a normal conversation arc until reflection threshold is crossed, then continue into a later NPC turn"
    expected: "The NPC should reflect on the same-turn committed events that triggered the threshold, and later dialogue/actions should reflect updated beliefs, goals, or relationships without requiring any repair script or reload"
    why_human: "This runtime path depends on live Judge and Embedder model behavior during ordinary play; code and tests prove the wiring, but not the exact qualitative outcome with real providers"
---

# Phase 40: Live Reflection & Progression Triggers Verification Report

**Phase Goal:** Reflection and progression become live runtime mechanics that actually trigger during normal play.
**Verified:** 2026-04-10T03:52:08.3585349Z
**Status:** human_needed
**Re-verification:** Yes - after gap closure

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
| --- | --- | --- | --- |
| 1 | Repeated important interactions can accumulate enough live runtime signal for an NPC to reflect during ordinary gameplay. | ✓ VERIFIED | `accumulateReflectionBudget()` remains the shared authoritative seam in `backend/src/engine/reflection-budget.ts`, and the live writers still feed it from `backend/src/engine/tool-executor.ts:546-554`, `backend/src/engine/npc-tools.ts:90,121-129`, and `backend/src/engine/npc-offscreen.ts:222-230`. |
| 2 | After reflection fires, later turns show changed NPC beliefs, goals, relationships, or progression state that the player can observe. | ✓ VERIFIED | The prior blocker is closed: `storeEpisodicEvent()` now queues same-turn committed evidence in `backend/src/vectors/episodic-events.ts:31-113`, `runReflection()` reads that queue before vector fallback in `backend/src/engine/reflection-agent.ts:83-93`, and later NPC turns still read canonical beliefs/goals/relationships in `backend/src/engine/npc-agent.ts:152-163`. |
| 3 | Reflection-driven progression happens through the normal gameplay loop instead of requiring manual repair steps or one-off scripts. | ✓ VERIFIED | Rollback-critical finalization still runs `tickPresentNpcs()` -> `simulateOffscreenNpcs()` -> `checkAndTriggerReflections()` before auxiliary work in `backend/src/routes/chat.ts:64-104`, and `buildOnPostTurn()` defers queue draining until after that path in `backend/src/routes/chat.ts:222-229`. |

**Score:** 3/3 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
| --- | --- | --- | --- |
| `backend/src/engine/reflection-budget.ts` | Campaign-scoped participant resolution and `unprocessedImportance` accumulation helper | ✓ VERIFIED | Exists, substantive, and still used by all authoritative writer seams. |
| `backend/src/engine/tool-executor.ts` | `log_event` committed-write accumulation seam | ✓ VERIFIED | `handleLogEvent()` stores the episodic event and immediately accumulates reflection budget. |
| `backend/src/engine/npc-tools.ts` | Present-NPC live writer seam | ✓ VERIFIED | `speak` stores an episodic event and accumulates budget; `act` still piggybacks through `log_event` to avoid double-counting. |
| `backend/src/engine/npc-offscreen.ts` | Off-screen live writer seam | ✓ VERIFIED | `applyOffscreenUpdate()` stores an episodic event and accumulates budget on the same path. |
| `backend/src/vectors/episodic-events.ts` | Same-turn committed-event handoff for reflection and later embedding | ✓ VERIFIED | Adds queue/read/drain helpers on top of `storeEpisodicEvent()` so committed events are available before embeddings exist. |
| `backend/src/engine/reflection-agent.ts` | Reflection runner that merges same-turn committed evidence with semantic retrieval | ✓ VERIFIED | `runReflection()` now builds `Recent evidence` from queued same-turn events plus semantic search fallback. |
| `backend/src/engine/npc-agent.ts` | Later-turn canonical structured-state readback | ✓ VERIFIED | Later turns still hydrate structured record state and relationship graph into the prompt. |
| `backend/src/routes/chat.ts` | Post-turn orchestration that runs reflection before done and drains queued evidence afterward | ✓ VERIFIED | Rollback-critical reflection remains inside finalization; auxiliary drain embeds queued committed events afterward. |
| `backend/src/vectors/__tests__/episodic-events.test.ts` | Queue creation, scoping, and drain regressions | ✓ VERIFIED | Locks campaign/tick scoping and drain-clears behavior. |
| `backend/src/engine/__tests__/reflection-agent.test.ts` | Same-turn evidence and structured-state reflection regressions | ✓ VERIFIED | Locks `Recent evidence` population from pending committed events and structured-state-first prompt rules. |
| `backend/src/routes/__tests__/chat.test.ts` | Route-level finalization ordering and post-reflection drain regressions | ✓ VERIFIED | Locks reflection-before-done and queued-event drain for non-`log_event` writers. |

### Key Link Verification

| From | To | Via | Status | Details |
| --- | --- | --- | --- | --- |
| `backend/src/engine/tool-executor.ts` | `backend/src/engine/reflection-budget.ts` | `log_event` committed episodic-event write followed by budget accumulation | WIRED | Verified by source and `gsd-tools verify key-links` on `40-01-PLAN.md`. |
| `backend/src/engine/npc-tools.ts` | `backend/src/engine/reflection-budget.ts` | Present-NPC `speak` and `act -> log_event` reuse the live accumulation seam | WIRED | `speak` calls the helper directly; `act` delegates to `executeToolCall("log_event", ...)`. |
| `backend/src/engine/npc-offscreen.ts` | `backend/src/engine/reflection-budget.ts` | Off-screen episodic-event write followed by budget accumulation | WIRED | `applyOffscreenUpdate()` stores and accumulates on the same committed write path. |
| `backend/src/vectors/episodic-events.ts` | `backend/src/engine/reflection-agent.ts` | Non-destructive same-turn committed-event read before `searchEpisodicEvents()` fallback | WIRED | `readPendingCommittedEvents()` feeds `runReflection()` before semantic retrieval. |
| `backend/src/vectors/episodic-events.ts` | `backend/src/routes/chat.ts` | Post-turn drain of queued committed events into `embedAndUpdateEvent()` | WIRED | `queueAuxiliaryPostTurnWork()` drains tick-scoped events and embeds them after reflection completes. |
| `backend/src/routes/chat.ts` | `backend/src/engine/reflection-agent.ts` | Rollback-critical post-turn finalization invokes reflection before done | WIRED | `runRollbackCriticalPostTurn()` calls `checkAndTriggerReflections()` before auxiliary drain is queued. |
| `backend/src/engine/reflection-tools.ts` | `backend/src/engine/npc-agent.ts` | Later NPC turns hydrate canonical structured state and relationships | WIRED | Later prompt assembly still reads canonical beliefs, goals, and relationship graph. |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| --- | --- | --- | --- | --- |
| `backend/src/engine/reflection-budget.ts` | `participantNames` -> matching NPC rows | SQLite `npcs` query scoped by `campaignId` | Yes | ✓ FLOWING |
| `backend/src/vectors/episodic-events.ts` | Pending committed-event queue | Live `storeEpisodicEvent()` writes from `log_event`, `speak`, and off-screen updates | Yes | ✓ FLOWING |
| `backend/src/engine/reflection-agent.ts` | `recentEvents` | `readPendingCommittedEvents(campaignId, tick)` merged with `searchEpisodicEvents()` fallback | Yes | ✓ FLOWING |
| `backend/src/routes/chat.ts` | `pendingCommittedEvents` | `drainPendingCommittedEvents(campaignId, summary.tick)` after rollback-critical reflection | Yes | ✓ FLOWING |
| `backend/src/engine/npc-agent.ts` | `beliefs`, `goalsText`, `relationshipLines` | Canonical structured NPC record plus relationship graph | Yes | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| --- | --- | --- | --- |
| Same-turn committed evidence is visible to reflection before embeddings exist, and route finalization drains queued committed events afterward | `npm --prefix backend exec vitest run src/vectors/__tests__/episodic-events.test.ts src/engine/__tests__/reflection-agent.test.ts src/routes/__tests__/chat.test.ts` | 3 files passed, 47 tests passed | ✓ PASS |
| Live accumulation seams, later-turn structured readback, and progression guardrails still hold after the gap fix | `npm --prefix backend exec vitest run src/engine/__tests__/reflection-budget.test.ts src/engine/__tests__/tool-executor.test.ts src/engine/__tests__/npc-agent.test.ts src/engine/__tests__/npc-offscreen.test.ts src/engine/__tests__/reflection-progression.test.ts` | 5 files passed, 57 tests passed | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| --- | --- | --- | --- | --- |
| `SIMF-01` | `40-01-PLAN.md`, `40-02-PLAN.md`, `40-03-PLAN.md` | Reflection trigger accumulation occurs in live runtime so NPC beliefs, goals, relationship drift, and progression can actually fire under normal play. | ✓ SATISFIED | All three plans declare `SIMF-01`; `.planning/REQUIREMENTS.md` maps `SIMF-01` only to Phase 40; live accumulation, same-turn evidence handoff, rollback-critical trigger timing, and later-turn structured readback are all verified by code and 104 passing targeted tests. |

No orphaned Phase 40 requirement IDs were found in `.planning/REQUIREMENTS.md`; Phase 40 maps only to `SIMF-01`, and every plan frontmatter for this phase accounts for it.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| --- | --- | --- | --- | --- |
| None | - | No TODO/FIXME/placeholder/stub matches in scanned Phase 40 runtime and regression files | - | No blocker anti-patterns detected in the verified scope |

### Human Verification Required

### 1. Live Gameplay Reflection Smoke Test

**Test:** Start a campaign with working Judge and Embedder providers, perform several meaningful interactions involving the same key NPC until reflection threshold should be crossed, then continue play into that NPC's later turn.
**Expected:** Reflection should be triggered during normal post-turn finalization, and later NPC dialogue/action choices should reflect updated beliefs, goals, or relationships grounded in those same-turn events.
**Why human:** The code and tests prove the runtime seam, but the final user-visible behavior depends on live LLM outputs and cannot be fully validated from static inspection alone.

### Gaps Summary

No blocker gaps remain. The prior hollow seam is closed: same-turn committed events now enter a shared queue at `storeEpisodicEvent()`, reflection reads that queue before semantic fallback, and auxiliary embedding drains the same queue only after rollback-critical reflection finishes. Phase 40 is code-complete against `SIMF-01`; only a live-provider smoke test remains to confirm qualitative behavior during real play.

---

_Verified: 2026-04-10T03:52:08.3585349Z_
_Verifier: Claude (gsd-verifier)_
