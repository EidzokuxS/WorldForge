---
phase: 45-authoritative-scene-assembly-and-start-of-play-runtime
verified: 2026-04-12T08:17:22.7113815Z
status: passed
score: 8/8 must-haves verified
---

# Phase 45: Authoritative Scene Assembly & Start-of-Play Runtime Verification Report

**Phase Goal:** Make player-visible turn text a single runtime-grounded scene output instead of duplicated prose, premise dumps, or narration emitted before authoritative local changes settle.
**Verified:** 2026-04-12T08:17:22.7113815Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
| --- | --- | --- | --- |
| 1 | Phase 45 has explicit regressions for the opening-scene, no-premise, settlement-order, and duplicate-output seams. | ✓ VERIFIED | Targeted tests exist in `backend/src/engine/__tests__/turn-processor.test.ts:531-589`, `backend/src/engine/__tests__/turn-processor.test.ts:783-804`, `backend/src/engine/__tests__/prompt-assembler.test.ts:368-563`, `frontend/components/game/__tests__/narrative-log.test.tsx:20-35`, and `frontend/app/game/__tests__/page.test.tsx:342-403`. |
| 2 | Visible narration now comes from one final settled-scene pass instead of the hidden tool-driving stream. | ✓ VERIFIED | `processTurn()` emits hidden-pass `scene-settling`, runs hidden `streamText()`, then assembles final narration and yields the first visible `narrative` only after settlement in `backend/src/engine/turn-processor.ts:629-878`. |
| 3 | Local present-scene settlement happens before visible narration, while rollback-critical off-screen/reflection/faction work stays post-narration. | ✓ VERIFIED | `onBeforeVisibleNarration` is awaited before scene assembly in `backend/src/engine/turn-processor.ts:801-817`; the route wires that hook to `tickPresentNpcs()` in `backend/src/routes/chat.ts:121-140` and `backend/src/routes/chat.ts:267-275`; post-narration finalization is emitted as `finalizing_turn` and only then runs `simulateOffscreenNpcs()`, `checkAndTriggerReflections()`, and `tickFactions()` via `backend/src/engine/turn-processor.ts:917-938` and `backend/src/routes/chat.ts:90-119`. Ordering is regression-tested in `backend/src/routes/__tests__/chat.test.ts:453-535`. |
| 4 | Final visible narration is assembled from authoritative opening state, local scene facts, recent local context, and player-perceivable same-turn effects. | ✓ VERIFIED | `assembleAuthoritativeScene()` reads opening state, current scene, pending committed events, and recent location events in `backend/src/engine/scene-assembly.ts:141-177` and `backend/src/engine/scene-assembly.ts:393-483`; `assembleFinalNarrationPrompt()` injects `[OPENING STATE]`, `[SCENE EFFECTS]`, `[PLAYER-PERCEIVABLE CONSEQUENCES]`, `[RECENT LOCAL CONTEXT]`, and `[PRESENT ACTORS]` in `backend/src/engine/prompt-assembler.ts:915-974`. |
| 5 | Repeated visible output blocks are collapsed before persistence, and the storyteller contract forbids scene restarts. | ✓ VERIFIED | Repeated paragraph blocks are normalized and collapsed in `backend/src/engine/scene-assembly.ts:92-138`, applied before persistence in `backend/src/engine/turn-processor.ts:870-881` and `backend/src/engine/turn-processor.ts:1009-1015`; the narration contract requires “one continuous narration pass” and forbids restarting the same beat in `backend/src/engine/storyteller-contract.ts:7-13`. The alternate-wording restart protection is an inference from this contract plus the single final-pass architecture. |
| 6 | Opening-scene generation has an explicit backend trigger path instead of premise fallback or an empty log. | ✓ VERIFIED | The backend exposes `/chat/opening` and blocks duplicate openings in `backend/src/routes/chat.ts:309-378`; `processOpeningScene()` builds authoritative scene assembly and final narration without premise fallback in `backend/src/engine/turn-processor.ts:941-1018`. This route is covered in `backend/src/routes/__tests__/chat.test.ts:264-324`. |
| 7 | The `/game` opening surface no longer renders the campaign premise as opening narration. | ✓ VERIFIED | `NarrativeLog` ignores `premise` and shows neutral opening copy when `messages.length === 0` in `frontend/components/game/narrative-log.tsx:20-30` and `frontend/components/game/narrative-log.tsx:85-88`; the leaf and page regressions assert premise is not shown in `frontend/components/game/__tests__/narrative-log.test.tsx:20-35` and `frontend/app/game/__tests__/page.test.tsx:342-353`. |
| 8 | Frontend `/game` actively requests the opening scene and distinguishes hidden opening/scene-settling work from post-narration finalization. | ✓ VERIFIED | `requestOpeningScene()` calls `chatOpening()` and parses SSE progress in `frontend/app/game/page.tsx:180-239`; initialization invokes it when there is no assistant message in `frontend/app/game/page.tsx:266-290`; turn flows keep `sceneProgress` separate from `turnPhase` in `frontend/app/game/page.tsx:376-465`, `frontend/app/game/page.tsx:468-550`, and render both into `NarrativeLog` at `frontend/app/game/page.tsx:705-715`. This behavior is covered in `frontend/app/game/__tests__/page.test.tsx:356-403`. |

**Score:** 8/8 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
| --- | --- | --- | --- |
| `backend/src/engine/scene-assembly.ts` | Authoritative scene-effects assembly and duplicate-block collapse | ✓ VERIFIED | Defines `SceneAssembly`/`SceneEffect`, reads live DB/config/event sources, and emits `playerPerceivableConsequences` in `:13-63` and `:393-483`; collapse logic is in `:92-138`. |
| `backend/src/engine/turn-processor.ts` | Hidden resolution, pre-visible local settlement, final visible narration pass | ✓ VERIFIED | Hidden pass is non-visible in `:629-729`; local settlement hook is awaited in `:792-817`; final narration assembly/persistence is in `:820-881`; rollback-critical finalization follows in `:917-938`; opening path exists in `:941-1018`. |
| `backend/src/routes/chat.ts` | Route wiring for opening generation, pre-visible local settlement, and post-narration finalization | ✓ VERIFIED | `buildOnBeforeVisibleNarration()` wires `tickPresentNpcs()` in `:267-275`; `/chat/opening` streams authoritative openings in `:309-378`; action/retry routes pass both hooks into `processTurn()` in `:527-546` and `:653-672`. |
| `backend/src/engine/storyteller-contract.ts` | Distinct hidden-pass and final-visible narration rules | ✓ VERIFIED | Hidden and final-visible rule sets are separated in `:32-44`; `buildStorytellerContract()` drops tool-support rules for the final-visible pass in `:55-75`. |
| `backend/src/engine/prompt-assembler.ts` | Final narration prompt built from authoritative scene assembly | ✓ VERIFIED | `assembleFinalNarrationPrompt()` injects opening state, scene effects, perceivable consequences, recent local context, and present actors in `:915-974`. |
| `backend/src/engine/__tests__/turn-processor.test.ts` | Regression coverage for deferred narration and duplicate suppression | ✓ VERIFIED | Covers pre-visible settlement in `:531-589` and duplicate suppression in `:783-804`. |
| `backend/src/engine/__tests__/prompt-assembler.test.ts` | Regression coverage for authoritative final narration context | ✓ VERIFIED | Covers opening-state/scene-effects/perceivable-context prompt assembly in `:368-563`. |
| `backend/src/routes/__tests__/chat.test.ts` | Route-level wiring coverage for opening and post-turn ordering | ✓ VERIFIED | Covers `/chat/opening` in `:264-324` and pre-visible/post-visible ordering in `:453-535`. |
| `frontend/components/game/narrative-log.tsx` | No-premise opening surface and progress/finalization copy | ✓ VERIFIED | Neutral placeholder and progress/finalization states are rendered in `:85-88` and `:197-215`; `premise` is intentionally unused in `:20-30`. |
| `frontend/app/game/page.tsx` | `/game` state wiring for opening request and scene/finalization phases | ✓ VERIFIED | Requests opening scene in `:187-239` and `:266-290`, maintains `sceneProgress`/`turnPhase` in `:376-550`, and passes them into `NarrativeLog` in `:705-715`. |

### Key Link Verification

| From | To | Via | Status | Details |
| --- | --- | --- | --- | --- |
| `backend/src/engine/scene-assembly.ts` | `backend/src/engine/turn-processor.ts` | Final narration input built from settled scene assembly | ✓ WIRED | `processTurn()` calls `assembleAuthoritativeScene()` before `assembleFinalNarrationPrompt()` in `backend/src/engine/turn-processor.ts:820-837`; opening flow does the same in `backend/src/engine/turn-processor.ts:964-976`. |
| `backend/src/engine/turn-processor.ts` | `backend/src/routes/chat.ts` | Pre-visible local settlement and post-visible rollback-critical finalization | ✓ WIRED | Route injects `buildOnBeforeVisibleNarration()` and `buildOnPostTurn()` into `processTurn()` in `backend/src/routes/chat.ts:529-546` and `backend/src/routes/chat.ts:655-672`. |
| `frontend/lib/api.ts` | `frontend/app/game/page.tsx` | Active opening-scene request from `/game` | ✓ WIRED | `chatOpening()` posts to `/api/chat/opening` in `frontend/lib/api.ts:1078-1079`, and `requestOpeningScene()` uses it in `frontend/app/game/page.tsx:187-239`. |
| `frontend/app/game/page.tsx` | `frontend/components/game/narrative-log.tsx` | Shared opening/progress contract on `/game` | ✓ WIRED | `GamePage` passes `messages`, `premise`, `turnPhase`, and `sceneProgress` into `NarrativeLog` in `frontend/app/game/page.tsx:705-715`, and `NarrativeLog` renders the neutral opening/progress states in `frontend/components/game/narrative-log.tsx:85-88` and `frontend/components/game/narrative-log.tsx:197-215`. |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| --- | --- | --- | --- | --- |
| `backend/src/engine/scene-assembly.ts` | `openingState`, `currentScene`, `recentContext`, `sceneEffects` | Live DB reads from `players`/`locations`, `readCampaignConfig()`, `listRecentLocationEvents()`, and `readPendingCommittedEvents()` in `backend/src/engine/scene-assembly.ts:141-177` and `backend/src/engine/scene-assembly.ts:396-461` | Yes | ✓ FLOWING |
| `backend/src/engine/turn-processor.ts` | `sceneAssembly`, `narrativeText` | `sceneAssembly` comes from `assembleAuthoritativeScene()` after local settlement in `backend/src/engine/turn-processor.ts:810-837`; final prose comes from `generateText()` and is persisted in `:848-881` | Yes | ✓ FLOWING |
| `frontend/app/game/page.tsx` | `messages`, `sceneProgress`, `turnPhase` | `chatHistory()`/`getWorldData()` initialize state in `frontend/app/game/page.tsx:154-176`; `chatOpening()`, `chatAction()`, and `chatRetry()` drive SSE updates in `:187-239`, `:376-465`, and `:468-550` | Yes | ✓ FLOWING |
| `frontend/components/game/narrative-log.tsx` | `messages`, `sceneProgress`, `turnPhase` | Props passed from `GamePage` in `frontend/app/game/page.tsx:705-715` and rendered directly in `frontend/components/game/narrative-log.tsx:85-88` and `frontend/components/game/narrative-log.tsx:197-215` | Yes | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| --- | --- | --- | --- |
| Backend turn sequencing, duplicate suppression, and final narration prompt contract | `npm --prefix backend exec vitest run src/engine/__tests__/turn-processor.test.ts src/engine/__tests__/prompt-assembler.test.ts src/routes/__tests__/chat.test.ts` | 3 files passed, 76 tests passed | ✓ PASS |
| Frontend no-premise opening surface and opening-progress state | `npm --prefix frontend exec vitest run components/game/__tests__/narrative-log.test.tsx app/game/__tests__/page.test.tsx` | 2 files passed, 30 tests passed | ✓ PASS |
| Route opening-scene SSE path exists and is wired to the runtime opening generator | `Select-String -Path backend/src/routes/chat.ts -Pattern 'app.post\\(\"/opening\"'` plus source inspection of `backend/src/routes/chat.ts:311-365` | `/chat/opening` route present and streams `processOpeningScene()` events | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| --- | --- | --- | --- | --- |
| `SCEN-01` | `45-01-PLAN.md`, `45-02-PLAN.md`, `45-03-PLAN.md` | Player-visible turn text is a single-pass scene assembled from authoritative runtime state, without repeated output blocks or raw-premise opening dumps. | ✓ SATISFIED | Hidden tool-driving narration is no longer visible before settlement (`backend/src/engine/turn-processor.ts:629-878`); repeated blocks are collapsed before persistence (`backend/src/engine/scene-assembly.ts:116-138`, `backend/src/engine/turn-processor.ts:870-881`); start-of-play uses `/chat/opening` plus authoritative scene assembly (`backend/src/routes/chat.ts:311-365`, `backend/src/engine/turn-processor.ts:941-1018`); `/game` no longer renders premise as opening narration (`frontend/components/game/narrative-log.tsx:85-88`, `frontend/app/game/page.tsx:187-239`). |

No orphaned Phase 45 requirements were found in `.planning/REQUIREMENTS.md`; the only mapped requirement is `SCEN-01`, and every Phase 45 plan declares it.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| --- | --- | --- | --- | --- |
| — | — | No blocker anti-patterns found in the Phase 45 runtime or test artifacts. Grep hits for `return null`, empty arrays, and similar patterns were helper defaults or test fixtures, not user-visible stubs. | ℹ️ Info | No verification-blocking placeholders, TODOs, or hollow wiring were found in the checked Phase 45 files. |

### Human Verification Required

None for phase status. A live playtest can still be useful to judge prose feel under real model output, but that is residual quality validation, not an automated blocker for `SCEN-01`.

### Gaps Summary

None. The Phase 45 codebase contains the expected runtime seam, backend route wiring, frontend opening behavior, and targeted regression coverage needed to satisfy the phase goal and `SCEN-01`.

---

_Verified: 2026-04-12T08:17:22.7113815Z_  
_Verifier: Claude (gsd-verifier)_
