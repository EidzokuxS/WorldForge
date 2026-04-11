# Roadmap: WorldForge

## Milestones

- ✅ **v1.0 Living Sandbox** — phases `1-36`, shipped `2026-04-08`
  Archives: [roadmap](/R:/Projects/WorldForge/.planning/milestones/v1.0-ROADMAP.md), [requirements](/R:/Projects/WorldForge/.planning/milestones/v1.0-REQUIREMENTS.md), [audit](/R:/Projects/WorldForge/.planning/milestones/v1.0-MILESTONE-AUDIT.md)
- 🚧 **v1.1 Gameplay Fidelity** — phases `37-44`, planned `2026-04-08`

## Overview

v1.1 is a reconciliation milestone built from the [Phase 36 handoff](/R:/Projects/WorldForge/.planning/phases/36-gameplay-docs-to-runtime-reconciliation-audit/36-HANDOFF.md), not a new-feature brainstorm. The milestone repairs gameplay-runtime trust first: campaign-loaded transport, authoritative state, honest turn and simulation boundaries, and complete checkpoint restore. After the integrity seams are trustworthy, the remaining documented gameplay mechanics and docs are aligned to the live product contract.

## Phases

**Phase Numbering:**
- Integer phases continue from the archived v1.0 roadmap and start here at `37`.
- Decimal phases remain reserved for urgent insertions between planned integers.

- [x] **Phase 37: Campaign-Loaded Gameplay Transport** - Remove active-session coupling from gameplay routes. (completed 2026-04-08)
- [ ] **Phase 38: Authoritative Inventory & Equipment State** - Collapse runtime item truth onto one persistence model.
- [x] **Phase 39: Honest Turn Boundary, Retry & Undo** - Make the player-visible turn boundary match the authoritative rollback boundary. (completed 2026-04-09)
- [x] **Phase 40: Live Reflection & Progression Triggers** - Turn dormant reflection scaffolding into observable runtime behavior. (completed 2026-04-10)
- [x] **Phase 41: Checkpoint-Complete Simulation Restore** - Restore full campaign runtime state, including simulation metadata and post-turn world mutations. (completed 2026-04-11)
- [x] **Phase 42: Targeted Oracle & Start-Condition Runtime Effects** - Make target-aware rulings and structured starts mechanically real in live play. (completed 2026-04-11)
- [x] **Phase 43: Travel & Location-State Contract Resolution** - Implement or explicitly deprecate the remaining location/time gameplay promises. (completed 2026-04-11)
- [ ] **Phase 44: Gameplay Docs Baseline Alignment** - Rewrite gameplay docs into an honest planning baseline for the repaired runtime.

## Phase Details

### Phase 37: Campaign-Loaded Gameplay Transport
**Goal**: Players can use gameplay routes reliably after reload because route behavior is bound to the loaded campaign, not an active in-memory session.
**Depends on**: Phase 36
**Requirements**: RINT-01
**Success Criteria** (what must be TRUE):
  1. Player can reload the app, open an existing campaign, and fetch gameplay history without reactivating a hidden session first.
  2. Player can submit a new action after reload and receive a normal streamed turn for the loaded campaign.
  3. Player can use `retry`, `undo`, and `edit` on a reloaded campaign without route failures caused by missing active-session state.
**Plans**: 2 plans
Plans:
- [x] 37-01-PLAN.md — Make `/api/chat/*` gameplay transport campaign-addressed on the backend and scope in-memory snapshots by `campaignId`.
- [x] 37-02-PLAN.md — Rewire `/game` and frontend gameplay helpers to use explicit `campaignId` on every targeted gameplay request.

### Phase 38: Authoritative Inventory & Equipment State
**Goal**: Inventory and equipment use one authoritative persistence model across gameplay, prompts, restore flows, and player-facing reads.
**Depends on**: Phase 36
**Requirements**: RINT-04
**Success Criteria** (what must be TRUE):
  1. Player sees the same carried and equipped items before and after reload, with no fallback-only items appearing in prompts or gameplay state.
  2. Picking up, dropping, equipping, or unequipping an item updates one authoritative runtime state that later turns also read.
  3. Starting loadout, live inventory changes, checkpoints, and restored gameplay all reflect the same item truth instead of diverging models.
**Plans**: TBD

### Phase 39: Honest Turn Boundary, Retry & Undo
**Goal**: The turn the player sees as complete is the same authoritative world boundary used by retry and undo.
**Depends on**: Phase 37, Phase 38
**Requirements**: RINT-02, SIMF-02
**Success Criteria** (what must be TRUE):
  1. A turn is only presented as finished after all player-visible world updates for that turn have completed.
  2. Retrying a completed turn restores the same pre-turn world boundary instead of leaving behind simulation mutations from the abandoned result.
  3. Undo returns the campaign to the exact world state the player had before the last turn, including simulation-visible consequences.
**Plans**: 3 plans
Plans:
- [x] 39-01-PLAN.md — Move rollback-critical post-turn work inside the authoritative completion boundary and restore whole campaign rollback bundles.
- [x] 39-02-PLAN.md — Consume the honest completion contract in `/game` with explicit turn phases, buffered quick actions, and rollback-safe retry recovery.
- [x] 39-03-PLAN.md — Route backend-style retry SSE errors through the same `/game` rollback cleanup path and cover the real SSE regression.

### Phase 40: Live Reflection & Progression Triggers
**Goal**: Reflection and progression become live runtime mechanics that actually trigger during normal play.
**Depends on**: Phase 39
**Requirements**: SIMF-01
**Success Criteria** (what must be TRUE):
  1. Repeated important interactions can accumulate enough live runtime signal for an NPC to reflect during ordinary gameplay.
  2. After reflection fires, later turns show changed NPC beliefs, goals, relationships, or progression state that the player can observe.
  3. Reflection-driven progression happens through the normal gameplay loop instead of requiring manual repair steps or one-off scripts.
**Plans**: 3 plans
Plans:
- [x] 40-01-PLAN.md — Wire live reflection-budget accumulation onto authoritative gameplay, present-NPC, and off-screen episodic-event writes.
- [x] 40-02-PLAN.md — Lock threshold-crossed post-turn reflection in tests and harden the reflection agent toward structured-state-first outcomes.
- [x] 40-03-PLAN.md — Close the same-turn evidence handoff gap so reflection can read newly committed events before embeddings exist and auxiliary embedding reuses that shared queue for all writers.

### Phase 41: Checkpoint-Complete Simulation Restore
**Goal**: Checkpoints restore full campaign-authoritative runtime state and keep NPC/world simulation coherent across restore flows.
**Depends on**: Phase 39, Phase 40
**Requirements**: RINT-03, SIMF-03
**Success Criteria** (what must be TRUE):
  1. Saving and loading a checkpoint restores the same gameplay state, current tick, and other campaign runtime metadata present when the checkpoint was created.
  2. After checkpoint restore, later turns reflect the restored simulation state rather than mutations from the discarded timeline.
  3. Retry, undo, and checkpoint load keep NPC autonomy, reflection, and faction updates aligned with the same restored campaign boundary.
**Plans**: 2 plans
Plans:
- [x] 41-01-PLAN.md — Converge checkpoint and turn-boundary restore onto one config-inclusive authoritative bundle contract.
- [x] 41-02-PLAN.md — Clear discarded-timeline runtime state so checkpoint load, retry, and undo stay on the same restored simulation boundary.

### Phase 42: Targeted Oracle & Start-Condition Runtime Effects
**Goal**: Oracle rulings and early gameplay mechanics use real target context and structured start-condition state.
**Depends on**: Phase 37, Phase 38
**Requirements**: GSEM-01, GSEM-02
**Success Criteria** (what must be TRUE):
  1. Acting against a concrete target uses target-aware context and can produce different rulings than the same action without a target.
  2. Start conditions chosen during character setup have persistent mechanical effects in early gameplay instead of existing only as narration flavor.
  3. Reload, retry, and checkpoint restore preserve those target-aware and start-condition-driven mechanics.
**Plans**: 2 plans
Plans:
- [x] 42-01-PLAN.md — Resolve supported player-action targets into real Oracle context with honest fallback for unsupported cases.
- [x] 42-02-PLAN.md — Turn structured start conditions into bounded early-game runtime mechanics that survive restore flows.

### Phase 43: Travel & Location-State Contract Resolution
**Goal**: Travel/time and per-location recent-happenings promises are either real runtime mechanics or explicitly removed from the active product contract.
**Depends on**: Phase 41
**Requirements**: GSEM-03, GSEM-04
**Success Criteria** (what must be TRUE):
  1. If travel time remains in scope, moving between locations shows a consistent turn or tick cost the player can observe; otherwise the docs no longer claim that it exists.
  2. If per-location recent happenings remain in scope, revisiting a location exposes location-local state/history that matches recent events; otherwise the docs no longer claim that it exists.
  3. The chosen contract stays consistent with retry, undo, and checkpoint restore rather than existing only as prose.
**Plans**: 6 plans
Plans:
- [x] 43-01-PLAN.md — Define the shared location contract, normalized schema surface, and backend regressions for travel plus location-local history.
- [x] 43-02-PLAN.md — Implement authoritative graph traversal, travel-time cost, and shared player/NPC movement semantics.
- [x] 43-03-PLAN.md — Implement authoritative write-through location recent happenings and ephemeral-scene consequence retention.
- [x] 43-04-PLAN.md — Expose normalized path and location-history reads through backend world and prompt surfaces.
- [x] 43-05-PLAN.md — Parse and render the repaired travel and location-history contract on `/game`.
- [x] 43-06-PLAN.md — Close current-location travel/no-op handling and separate fresh-vs-legacy regression guardrails.

### Phase 44: Gameplay Docs Baseline Alignment
**Goal**: Gameplay docs become an honest planning baseline for the repaired runtime instead of a mixed set of stale and live claims.
**Depends on**: Phase 38, Phase 41, Phase 42, Phase 43
**Requirements**: DOCA-01, DOCA-02, DOCA-03
**Success Criteria** (what must be TRUE):
  1. Every Phase 36 Group B and Group C gameplay claim covered by this milestone is resolved as implemented behavior or explicit deprecation.
  2. Gameplay docs explain the live structured character and runtime model accurately, including where derived tags are shorthand instead of canonical state.
  3. Gameplay docs describe the real retrieval, memory, and prompt contracts accurately enough to serve as the next planning baseline without another reconciliation pass.
**Plans**: 3 plans
Plans:
- [x] 44-01-PLAN.md — Reframe high-level docs authority, setup/handoff wording, and top-level deprecations in `concept.md`, `tech_stack.md`, and the historical player-creation plan.
- [x] 44-02-PLAN.md — Rewrite `mechanics.md` into the normative gameplay baseline for canonical state, target-aware Oracle support, bounded opening effects, reflection, and travel/location semantics.
- [ ] 44-03-PLAN.md — Rewrite `memory.md` to the live runtime/retrieval contract and record a claim-by-claim resolution map for all elevated Phase 36 Group B/C items.

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 37. Campaign-Loaded Gameplay Transport | 2/2 | Complete   | 2026-04-08 |
| 38. Authoritative Inventory & Equipment State | 0/TBD | Not started | - |
| 39. Honest Turn Boundary, Retry & Undo | 3/3 | Complete    | 2026-04-09 |
| 40. Live Reflection & Progression Triggers | 3/3 | Complete   | 2026-04-10 |
| 41. Checkpoint-Complete Simulation Restore | 2/2 | Complete | 2026-04-11 |
| 42. Targeted Oracle & Start-Condition Runtime Effects | 2/2 | Complete   | 2026-04-11 |
| 43. Travel & Location-State Contract Resolution | 6/6 | Complete   | 2026-04-11 |
| 44. Gameplay Docs Baseline Alignment | 2/3 | In Progress|  |
