---
phase: 75-cross-phase-promise-audit-and-location-presence-reality-clos
verified: 2026-04-30T15:08:36Z
status: passed
score: 12/12 must-haves verified
head: 12dd7ce
release_ready: false
blocking_release_gate: "Active provider structured-output conformance from Phase 74 remains release-blocking outside Phase 75 deterministic location-presence scope."
overrides_applied: 0
---

# Phase 75 Verification

**Result:** PASS at `12dd7ce`.

Phase 75 closes the specific Phase 43/46 gap: generated/reviewed/saved worlds now carry explicit macro + persistent sublocation hierarchy, NPC broad + scene placement, player start scene scope, runtime scoped presence, prompt/frontend roster scope, and World Review regeneration round-trip. Review-fix artifacts are included; final focused review is clean.

This verifies deterministic code/tests. It does not claim live provider conformance or subjective live-play UAT.

## Requirements Coverage

| Requirement | Status | Evidence |
|---|---|---|
| P75-R1 | PASS | Audit artifacts and matrix classify completed promises against current code/tests. |
| P75-R2 | PASS | Dense location/presence collapse was prioritized over cosmetic drift. |
| P75-R3 | PASS | Generated and reviewed scaffolds preserve macro + persistent sublocation fields through save and persistence. |
| P75-R4 | PASS | NPC broad `locationName` and scoped `sceneLocationName` persist into broad/current-scene ids. |
| P75-R5 | PASS | `/world.currentScene`, SceneFrame, prompt assembler, and People Here consume scoped presence. |
| P75-R6 | PASS | Deterministic code maps explicit fields only; source/canon semantics remain artifact/model-owned. |
| P75-R7 | PASS | Dense fixture regression bundle passed across backend, frontend, typecheck, and lint. |
| P75-R8 | PASS | Remaining stale promises are classified as fixed, outside-scope gap, Phase 76 candidate, deprecated, or not active truth. |

## Must-Haves

| # | Truth | Status | Evidence |
|---|---|---|---|
| 1 | Promise audit and stale-claim classification exist | PASS | `75-PROMISE-AUDIT.md`, `75-REGRESSION-MATRIX.md`, `75-VALIDATION.md`; P75-R1..R8 complete in `.planning/REQUIREMENTS.md:197-204` and trace table `.planning/REQUIREMENTS.md:359-366`. |
| 2 | Dense fixture provides explicit macro/sublocation/NPC scene data | PASS | `backend/src/worldgen/__tests__/fixtures/dense-location-scaffold.ts:26-64`, `:66-210`. |
| 3 | Scaffold/save-edits contract preserves hierarchy and NPC scene placement | PASS | `backend/src/worldgen/types.ts:50-74`; `backend/src/routes/schemas.ts:749-781`, `:794-864`; `backend/src/routes/worldgen.ts:96-130`, `:690-700`. |
| 4 | World Review load/edit/save round-trip preserves hierarchy | PASS | `frontend/lib/world-data-helpers.ts:127-176`; `frontend/components/world-review/locations-section.tsx:154-199`, `:207-218`; `frontend/components/world-review/npcs-section.tsx:136-169`, `:674-716`. |
| 5 | Location generation asks for macro + persistent sublocations without name inference | PASS | `backend/src/worldgen/scaffold-steps/locations-step.ts:21-57`, `:185-200`. |
| 6 | NPC generation separates broad macro placement from scene placement | PASS | `backend/src/worldgen/scaffold-steps/npcs-step.ts:140-179`, `:416-429`, `:554-621`, `:817-837`; primary worldgen passes full locations at `backend/src/worldgen/scaffold-generator.ts:357-360`. |
| 7 | World Review NPC regeneration round-trip keeps full location hierarchy | PASS | Review page sends `locations: scaffold.locations` at `frontend/app/(non-game)/campaign/[id]/review/page.tsx:96-112`; backend schema/route accept and forward full locations at `backend/src/routes/schemas.ts:777-783` and `backend/src/routes/worldgen.ts:674-677`. |
| 8 | Persistence writes parented sublocations and broad+scene NPC ids | PASS | `backend/src/worldgen/scaffold-saver.ts:65-124`, `:144-213`, `:240-300`, `:353-405`. Invalid parent/scene/broad conflicts fail closed. |
| 9 | Player start stores broad macro plus concrete scene id | PASS | `backend/src/routes/character.ts:103-132`, `:360-424`. |
| 10 | `/world.currentScene` scopes NPCs by scene and excludes same-macro siblings | PASS | `backend/src/routes/campaigns.ts:65-145` uses `resolveScenePresence`, emits `sceneNpcIds` and `clearNpcIds`. |
| 11 | Runtime SceneFrame and prompt assembler consume scoped presence | PASS | `backend/src/engine/scene-frame.ts:408-467`, `:805-823`; `backend/src/engine/prompt-assembler.ts:740-824`, `:840-875`. |
| 12 | Frontend People Here uses authoritative current scene ids | PASS | `frontend/lib/api.ts:397-418`, `:474-478`; `frontend/app/game/page.tsx:105-155`, `:486-523`. |

## Review Fixes

| Finding | Prior Status | Current Status | Evidence |
|---|---|---|---|
| HI-01 / HI-RR-01: NPC broad placement and regeneration flattened hierarchy | Fixed | PASS | `75-REVIEW-FINAL.md` reports clean; code evidence in `npcs-step.ts`, `scaffold-saver.ts`, `review/page.tsx`, `routes/worldgen.ts`. |
| ME-01 / ME-RR-01: parentless/invalid persistent sublocation editor state | Fixed | PASS | `75-REVIEW-FINAL.md` reports clean; `locations-section.tsx:154-199` only offers persistent sublocation when macro parent exists; `:207-218` converts `None` to macro. |

## Verification Runs

| Command | Result |
|---|---|
| `npm --prefix backend run test -- src/routes/__tests__/schemas.test.ts src/routes/__tests__/worldgen.test.ts src/worldgen/__tests__/scaffold-resilience.test.ts src/worldgen/__tests__/npcs-step.test.ts src/worldgen/__tests__/scaffold-saver.test.ts src/worldgen/__tests__/starting-location.test.ts src/routes/__tests__/character.test.ts src/routes/__tests__/campaigns.test.ts src/routes/__tests__/campaigns.inventory-authority.test.ts src/engine/__tests__/scene-frame.test.ts src/engine/__tests__/prompt-assembler.test.ts` | PASS, 11 files, 440 tests. |
| `npm --prefix backend run typecheck` | PASS. |
| `npm --prefix frontend run test -- run lib/__tests__/api.test.ts app/game/__tests__/page.test.tsx lib/__tests__/world-data-helpers.test.ts components/world-review/__tests__/locations-section.test.tsx components/world-review/__tests__/npcs-section.test.tsx 'app/(non-game)/campaign/[id]/review/__tests__/page.test.tsx'` | PASS, 6 files, 114 tests. |
| `npm --prefix frontend run lint` | PASS. |
| `npx gitnexus status` | PASS, indexed commit and current commit both `12dd7ce`. |
| `gitnexus.detect_changes(compare, base_ref=9f0e3f4)` | CRITICAL blast radius across expected worldgen/review symbols; acceptable because this is the review-fix production scope and final review/tests cover it. |

## Anti-Pattern Scan

No blocker stubs found in Phase 75 changed source. Matches were expected test helpers (`buildPowerStatsStub`, `vi.stubGlobal`), UI placeholder strings, prior summary text, and a pre-existing explanatory `not available` comment in `prompt-assembler.ts`.

## Remaining Classified Items

| Item | Classification | Why not Phase 75 gap |
|---|---|---|
| Active provider structured-output conformance | Gap closure required outside Phase 75 | Separate Phase 74 release gate; deterministic Phase 75 chain does not depend on live provider success. |
| Live generated-world gameplay/UAT | Follow-up gate | Deterministic source-to-visible code path is covered; subjective live play requires human/provider run. |
| Richer ephemeral scene lifecycle and broader travel/crowd topology | Phase 76 candidate | Phase 75 fixes persistent generated sublocation chain and scoped presence, not full ephemeral-scene/travel design. |
| Full hierarchy authoring UX polish | Phase 76 candidate | Phase 75 now prevents flattening and invalid parentless states; richer UX is not required for closure. |
| Phase 63/64 evidence cleanup | Phase 76 candidate | Historical planning consistency, not live location-presence behavior. |

## Verdict

PASS. No obvious unclosed "planned but not wired" promise remains inside the Phase 75 location-presence closure scope.

---

_Verified: 2026-04-30T15:08:36Z_
_Verifier: Codex (gsd-verifier)_
