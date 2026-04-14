---
phase: 46-encounter-scope-presence-and-knowledge-boundaries
verified: 2026-04-12T11:13:57.2978344Z
status: human_needed
score: 3/3 must-haves verified
human_verification:
  - test: "Large location no longer feels like one room"
    expected: "In a large location with multiple seeded notable NPCs, only immediate-scene or perceivable actors appear in scene text and People Here."
    why_human: "Needs live gameplay judgment across narration, world payload, and UI together."
  - test: "Hidden participants feel real without premature reveal"
    expected: "A concealed nearby actor can influence the scene through hints or consequences, without early identity leakage."
    why_human: "Unit tests prove hint-band plumbing, but not whether the live narration feels believable."
  - test: "NPC reactions use a believable knowledge basis"
    expected: "NPC reactions read as perception, report, reputation, or prior connection, not unexplained omniscience."
    why_human: "Reasoning quality and prose plausibility cannot be fully proven from static assertions."
---

# Phase 46: Encounter Scope, Presence & Knowledge Boundaries Verification Report

**Phase Goal:** Constrain scene participation and knowledge to actual encounter/perception scope so big locations stop behaving like one tiny room.
**Verified:** 2026-04-12T11:13:57.2978344Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
| --- | --- | --- | --- |
| 1 | Large locations no longer imply universal co-presence; only actually present or perceivable entities enter the live scene. | ✓ VERIFIED | `backend/src/engine/scene-presence.ts` resolves presence by `broadLocationId + sceneScopeId`, `backend/src/routes/campaigns.ts` emits bounded `currentScene`, and `/game` reads `clearNpcIds` before any fallback. Covered by `scene-presence.test.ts`, `campaigns.inventory-authority.test.ts`, `api.test.ts`, `page.test.tsx`, and `location-panel.test.tsx`. |
| 2 | NPCs do not reason or react as if every actor in the broader location has already been met. | ✓ VERIFIED | `backend/src/engine/npc-agent.ts` filters nearby entities through shared awareness/knowledge, `backend/src/engine/npc-offscreen.ts` keeps same-broad-location/out-of-scene actors off-screen, and `backend/src/routes/chat.ts` passes `currentSceneScopeId` into present-scene settlement. Covered by `npc-agent.test.ts`, `npc-offscreen.test.ts`, and `chat.test.ts`. |
| 3 | Scene-local knowledge and encounter context derive from proximity, presence, and perception rather than flat location membership. | ✓ VERIFIED | `backend/src/engine/scene-assembly.ts` builds awareness/hint output from the shared snapshot, and `backend/src/engine/prompt-assembler.ts` splits hidden/final prompt visibility by `clear`/`hint`/`none`. Covered by `prompt-assembler.test.ts` and `turn-processor.test.ts`. |

**Score:** 3/3 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
| --- | --- | --- | --- |
| `backend/src/engine/scene-presence.ts` | Shared resolver for encounter presence, awareness, and knowledge basis | ✓ VERIFIED | Exists, substantive, and consumed by scene assembly, prompt assembly, NPC routing, and `/world` scene payload. |
| `backend/drizzle/0008_dusty_tana_nile.sql` + `backend/src/db/schema.ts` | Additive durable scene-scope persistence | ✓ VERIFIED | Adds nullable `current_scene_location_id` for `players` and `npcs`; no table recreation. |
| `backend/src/engine/tool-executor.ts` + `backend/src/engine/turn-processor.ts` | Movement/arrival lifecycle keeps scene scope aligned | ✓ VERIFIED | Player travel and spawned NPC creation set `currentSceneLocationId`; turn processing backfills legacy nulls and persists destination scene scope. |
| `backend/src/engine/scene-assembly.ts` | Scene-local awareness and perceivable consequences | ✓ VERIFIED | Uses shared snapshot to build `presentNpcNames`, `clearNpcNames`, and `hintSignals`. |
| `backend/src/engine/prompt-assembler.ts` | Hidden/final prompt filtering keyed to encounter scope | ✓ VERIFIED | Hidden pass includes hint-band actors; final pass restricts to clear actors plus bounded hint signals. |
| `backend/src/engine/npc-agent.ts` + `backend/src/engine/npc-offscreen.ts` | Present/off-screen NPC routing keyed to scene scope | ✓ VERIFIED | Same-broad-location actors outside the immediate scene are kept off-screen; nearby entities include awareness and knowledge labels. |
| `backend/src/routes/campaigns.ts` | Explicit bounded `/world` `currentScene` payload | ✓ VERIFIED | Emits `currentScene`, `sceneNpcIds`, `clearNpcIds`, and awareness hints from the backend. |
| `backend/src/routes/__tests__/character.test.ts` | Explicit save-character route proof for start-of-play scene-scope initialization | ✓ VERIFIED | `/api/worldgen/save-character` now asserts that first save writes both `currentLocationId` and `currentSceneLocationId` to the chosen starting location. |
| `frontend/lib/api.ts` + `frontend/lib/api-types.ts` | Parser preserves scene-scoped payload and IDs | ✓ VERIFIED | `parseWorldCurrentScene()` and `parseWorldData()` carry `currentScene` and `sceneScopeId` into `WorldData`. |
| `frontend/app/game/page.tsx` + `frontend/components/game/location-panel.tsx` | `/game` shows immediate scene separately from broad location | ✓ VERIFIED | `People Here` derives from authoritative `currentScene`, while the panel still shows the broad location plus immediate-scene label and hint signals. |

### Key Link Verification

| From | To | Via | Status | Details |
| --- | --- | --- | --- | --- |
| `backend/src/db/schema.ts` | `backend/src/engine/scene-presence.ts` | `currentSceneLocationId ?? currentLocationId` fallback | ✓ WIRED | Resolver uses stored scene scope and legacy fallback through `resolveStoredSceneScopeId()`. |
| `backend/src/engine/tool-executor.ts` + `backend/src/engine/turn-processor.ts` | `backend/src/routes/chat.ts` | Hidden turn summary carries `currentSceneScopeId` into present-scene settlement | ✓ WIRED | `runLocalPresentSceneSettlement()` passes both broad location and scene scope into `tickPresentNpcs()`. |
| `backend/src/engine/scene-presence.ts` | `backend/src/engine/prompt-assembler.ts` | Awareness bands and present-actor filtering | ✓ WIRED | Prompt sections read the shared snapshot and observer awareness helpers. |
| `backend/src/engine/scene-presence.ts` | `backend/src/engine/npc-agent.ts` | Nearby-entity filtering and knowledge basis | ✓ WIRED | NPC prompts use `getObserverAwareness()` and `getObserverKnowledgeBasis()`. |
| `backend/src/engine/scene-presence.ts` | `backend/src/engine/npc-offscreen.ts` | Local-vs-off-screen split by scene scope | ✓ WIRED | Same broad-location actors whose `sceneScopeId` differs from the player stay off-screen. |
| `backend/src/routes/campaigns.ts` | `frontend/lib/api.ts` | `/world.currentScene` payload | ✓ WIRED | Backend emits bounded scene payload; parser preserves it. |
| `backend/src/routes/character.ts` | `backend/src/routes/__tests__/character.test.ts` | `/save-character` start-of-play `currentSceneLocationId` initialization | ✓ WIRED | The route writes `currentSceneLocationId: matchedLocation.id` on first save, and the route test now proves that scene-scope initialization stays aligned with the chosen starting location. |
| `frontend/lib/api.ts` | `frontend/app/game/page.tsx` | `WorldData.currentScene` | ✓ WIRED | `/game` uses parsed `currentScene` first and falls back only when absent. |
| `frontend/app/game/page.tsx` | `frontend/components/game/location-panel.tsx` | Scene panel data and `npcsHere` | ✓ WIRED | UI separates immediate-scene label/hints from broad location text. |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| --- | --- | --- | --- | --- |
| `backend/src/engine/scene-assembly.ts` | `snapshot`, `presentNpcNames`, `awareness.hintSignals` | DB player/NPC rows + `resolveScenePresence()` | Yes | ✓ FLOWING |
| `backend/src/routes/campaigns.ts` | `currentScene` | Live DB player/NPC/location rows + `buildWorldCurrentScene()` | Yes | ✓ FLOWING |
| `frontend/lib/api.ts` | `world.currentScene`, `player.sceneScopeId`, `npc.sceneScopeId` | `/api/campaigns/:id/world` JSON payload | Yes | ✓ FLOWING |
| `frontend/app/game/page.tsx` | `npcsHere`, `scenePanelData` | `worldData.currentScene` via parser, with bounded fallback only if absent | Yes | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| --- | --- | --- | --- |
| Backend encounter-scope smoke | `npm --prefix backend exec vitest run src/engine/__tests__/scene-presence.test.ts src/engine/__tests__/prompt-assembler.test.ts src/engine/__tests__/npc-agent.test.ts src/engine/__tests__/npc-offscreen.test.ts src/engine/__tests__/tool-executor.test.ts src/engine/__tests__/turn-processor.test.ts src/routes/__tests__/chat.test.ts` | `7 files passed, 141 tests passed` | ✓ PASS |
| Save-character start-of-play route proof | `npm --prefix backend exec vitest run src/routes/__tests__/character.test.ts` | Explicitly proves `/api/worldgen/save-character` initializes both `currentLocationId` and `currentSceneLocationId` on first save. | ✓ PASS |
| Frontend `/game` encounter-scope smoke | `npm --prefix frontend exec vitest run lib/__tests__/api.test.ts app/game/__tests__/page.test.tsx components/game/__tests__/location-panel.test.tsx` | `3 files passed, 49 tests passed` | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| --- | --- | --- | --- | --- |
| `SCEN-02` | `46-01` to `46-04` | Scene participation and knowledge follow encounter/perception scope, so large locations do not behave like one small room and NPCs do not over-know unseen actors. | ✓ SATISFIED | Shared resolver, persisted scene scope, prompt/NPC/off-screen rewiring, explicit `/world.currentScene` payload, and green backend/frontend phase smoke suites. |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| --- | --- | --- | --- | --- |
| None in phase-46 implementation files | — | No placeholder/TODO/stub patterns found in the verified phase files. | ℹ️ Info | No goal-blocking stub behavior detected. |

### Human Verification Required

### 1. Large Location Encounter Split

**Test:** Start from a large location containing multiple notable NPCs spread across different local scenes.
**Expected:** Scene text and `People Here` include only immediate-scene actors plus bounded hint signals for concealed nearby presence.
**Why human:** This needs live gameplay judgment across narration, scene assembly, and UI together.

### 2. Hidden Presence Without Identity Leak

**Test:** Create a scene where a concealed but nearby actor is in the same immediate scene.
**Expected:** The player gets indirect cues or consequences, not an early explicit identity reveal.
**Why human:** Tests confirm hint-band plumbing, but not the feel or quality of the final narration.

### 3. Knowledge Basis Feels Justified

**Test:** Trigger a scene where one NPC should know another only through perception, report, reputation, or prior relation.
**Expected:** Reaction text reflects that basis instead of unexplained omniscience.
**Why human:** Reasoning quality and prose plausibility are not fully machine-verifiable.

### Gaps Summary

No goal-blocking implementation gaps were found for `SCEN-02`; the encounter-scope contract is present, wired, and exercised by the phase smoke suites.

Residual risks and deferred items:
- Manual gameplay/UAT is still required for the three validation items above, but by milestone policy these checks are deferred to `v1.1` closeout instead of blocking the phase immediately.
- `npm --prefix backend run typecheck` is currently red for the repo, including one phase-touched file at `backend/src/engine/prompt-assembler.ts:630`; this did not invalidate the phase smoke suites, but it remains static-analysis debt outside the phase validation contract.
- GitNexus MCP resource reads worked, but `query`/`context`/`detect_changes` were temporarily unavailable because the local graph database at `.gitnexus/kuzu` was missing while stale `meta.json` still let plain `npx gitnexus analyze` report "Already up to date". Follow-up validation confirmed the index can be rebuilt on demand with `npx gitnexus analyze --force .`; source inspection and tests were used for the phase verdict itself.

---

_Verified: 2026-04-12T11:13:57.2978344Z_
_Verifier: Claude (gsd-verifier)_
