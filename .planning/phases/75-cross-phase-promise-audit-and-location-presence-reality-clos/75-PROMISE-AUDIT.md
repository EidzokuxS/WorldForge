# Phase 75 Promise Audit

This audit classifies material completed-phase promises against current evidence. It is intentionally focused on user-visible gameplay/worldgen behavior, not cosmetic documentation drift.

## Material Findings

| Phase Area | Promised Behavior | Current Evidence | Risk | Phase 75 Action |
|---|---|---|---|---|
| 43 / 46 / 55 | Large places should not behave as one small room; macro/sublocation/scene scope exists. | Schema supports hierarchy, but generated locations are still persisted as flat macro rows. | Critical | Fix in Phase 75. |
| 46 / 70 | NPCs participate only when sharing actual scene scope, not merely a broad location. | Runtime resolver supports this, but worldgen NPCs have no scene scope. | Critical | Fix in Phase 75. |
| 43 | Travel/location graph should preserve local scope and support local recent happenings. | Graph code exists, but generated worlds feed it only macro/default edges. | High | Cover generated-world hierarchy in Phase 75; richer topology can be Phase 76 if needed. |
| 46 frontend/world payload | People Here/current scene should reflect authoritative current scene. | UI/API can only reflect stored scope; generated worlds currently make scope equal macro fallback. | High | Add API/runtime regression; frontend check if cheap. |
| 55 | Gap-proof verification should prevent stale closed claims. | Previous matrices did not include generated scaffold -> saver -> `/world.currentScene` -> opening/turn proof for dense worlds. | High | Add `75-PROMISE-AUDIT.md` and regression matrix. |
| 73 / 74 | Structured output/provider readiness is observable before long flows are trusted. | Local deterministic gates are green; Phase 74 still records live provider readiness as release-blocking due active-role timeout/failures. | Medium/High | Keep as known release gate; do not block Phase 75 deterministic data fix. Candidate Phase 76 item. |
| 70 | ScenePlan is on the canonical runtime path. | Code/tests indicate runtime path is present. Residual risk is subjective live play quality after data fix. | Medium | Phase 76 live UAT after Phase 75. |
| 63 / 64 | Personality/backfill parity evidence is fully reconciled. | Historical artifact naming/status appears inconsistent in prior planning notes; not location-critical. | Low/Medium | Phase 76 reconciliation candidate unless current code audit finds live breakage. |
| 71 / 72 | Worldgen artifact owns premise/canon interpretation. | Current code appears aligned. Phase 75 must not regress this by inferring canon/source meaning from names. | Guardrail | Preserve authority boundary in implementation. |

## Phase 75 Must Fix

1. Generated location hierarchy data: worldgen scaffold and persistence must be able to represent persistent sublocations.
2. NPC scene placement: generated NPCs must write usable `currentSceneLocationId` when scoped evidence exists.
3. Player starting scene placement: starting player must align to the same broad/scene id model.
4. Runtime consumption proof: SceneFrame, `/world`, prompt assembly, and opening/turn behavior must be checked against generated-style scoped rows.

## Phase 76 Candidates

These are real follow-up candidates, but should not dilute the Phase 75 critical path unless implementation discovers an immediate live bug:

- Active role-model live conformance remains release-blocking from Phase 74.
- Live gameplay/UAT after scoped data exists.
- Ephemeral-scene lifecycle richness beyond the existing graph/schema support.
- Historical Phase 63/64 planning evidence cleanup if current code is already green.
- Richer macro-to-sublocation travel topology beyond minimal generated hierarchy.

## Audit Rule For Closeout

A promise is not `implemented` unless evidence proves the path from source data to user-visible behavior. Schema existence, helper existence, or a stale verification statement is insufficient.

