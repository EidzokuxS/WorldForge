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

- [ ] **Phase 37: Campaign-Loaded Gameplay Transport** - Remove active-session coupling from gameplay routes.
- [ ] **Phase 38: Authoritative Inventory & Equipment State** - Collapse runtime item truth onto one persistence model.
- [ ] **Phase 39: Honest Turn Boundary, Retry & Undo** - Make the player-visible turn boundary match the authoritative rollback boundary.
- [ ] **Phase 40: Live Reflection & Progression Triggers** - Turn dormant reflection scaffolding into observable runtime behavior.
- [ ] **Phase 41: Checkpoint-Complete Simulation Restore** - Restore full campaign runtime state, including simulation metadata and post-turn world mutations.
- [ ] **Phase 42: Targeted Oracle & Start-Condition Runtime Effects** - Make target-aware rulings and structured starts mechanically real in live play.
- [ ] **Phase 43: Travel & Location-State Contract Resolution** - Implement or explicitly deprecate the remaining location/time gameplay promises.
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
- [ ] 37-01-PLAN.md — Make `/api/chat/*` gameplay transport campaign-addressed on the backend and scope in-memory snapshots by `campaignId`.
- [ ] 37-02-PLAN.md — Rewire `/game` and frontend gameplay helpers to use explicit `campaignId` on every targeted gameplay request.

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
**Plans**: TBD

### Phase 40: Live Reflection & Progression Triggers
**Goal**: Reflection and progression become live runtime mechanics that actually trigger during normal play.
**Depends on**: Phase 39
**Requirements**: SIMF-01
**Success Criteria** (what must be TRUE):
  1. Repeated important interactions can accumulate enough live runtime signal for an NPC to reflect during ordinary gameplay.
  2. After reflection fires, later turns show changed NPC beliefs, goals, relationships, or progression state that the player can observe.
  3. Reflection-driven progression happens through the normal gameplay loop instead of requiring manual repair steps or one-off scripts.
**Plans**: TBD

### Phase 41: Checkpoint-Complete Simulation Restore
**Goal**: Checkpoints restore full campaign-authoritative runtime state and keep NPC/world simulation coherent across restore flows.
**Depends on**: Phase 39, Phase 40
**Requirements**: RINT-03, SIMF-03
**Success Criteria** (what must be TRUE):
  1. Saving and loading a checkpoint restores the same gameplay state, current tick, and other campaign runtime metadata present when the checkpoint was created.
  2. After checkpoint restore, later turns reflect the restored simulation state rather than mutations from the discarded timeline.
  3. Retry, undo, and checkpoint load keep NPC autonomy, reflection, and faction updates aligned with the same restored campaign boundary.
**Plans**: TBD

### Phase 42: Targeted Oracle & Start-Condition Runtime Effects
**Goal**: Oracle rulings and early gameplay mechanics use real target context and structured start-condition state.
**Depends on**: Phase 37, Phase 38
**Requirements**: GSEM-01, GSEM-02
**Success Criteria** (what must be TRUE):
  1. Acting against a concrete target uses target-aware context and can produce different rulings than the same action without a target.
  2. Start conditions chosen during character setup have persistent mechanical effects in early gameplay instead of existing only as narration flavor.
  3. Reload, retry, and checkpoint restore preserve those target-aware and start-condition-driven mechanics.
**Plans**: TBD

### Phase 43: Travel & Location-State Contract Resolution
**Goal**: Travel/time and per-location recent-happenings promises are either real runtime mechanics or explicitly removed from the active product contract.
**Depends on**: Phase 41
**Requirements**: GSEM-03, GSEM-04
**Success Criteria** (what must be TRUE):
  1. If travel time remains in scope, moving between locations shows a consistent turn or tick cost the player can observe; otherwise the docs no longer claim that it exists.
  2. If per-location recent happenings remain in scope, revisiting a location exposes location-local state/history that matches recent events; otherwise the docs no longer claim that it exists.
  3. The chosen contract stays consistent with retry, undo, and checkpoint restore rather than existing only as prose.
**Plans**: TBD

### Phase 44: Gameplay Docs Baseline Alignment
**Goal**: Gameplay docs become an honest planning baseline for the repaired runtime instead of a mixed set of stale and live claims.
**Depends on**: Phase 38, Phase 41, Phase 42, Phase 43
**Requirements**: DOCA-01, DOCA-02, DOCA-03
**Success Criteria** (what must be TRUE):
  1. Every Phase 36 Group B and Group C gameplay claim covered by this milestone is resolved as implemented behavior or explicit deprecation.
  2. Gameplay docs explain the live structured character and runtime model accurately, including where derived tags are shorthand instead of canonical state.
  3. Gameplay docs describe the real retrieval, memory, and prompt contracts accurately enough to serve as the next planning baseline without another reconciliation pass.
**Plans**: TBD

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 37. Campaign-Loaded Gameplay Transport | 0/TBD | Not started | - |
| 38. Authoritative Inventory & Equipment State | 0/TBD | Not started | - |
| 39. Honest Turn Boundary, Retry & Undo | 0/TBD | Not started | - |
| 40. Live Reflection & Progression Triggers | 0/TBD | Not started | - |
| 41. Checkpoint-Complete Simulation Restore | 0/TBD | Not started | - |
| 42. Targeted Oracle & Start-Condition Runtime Effects | 0/TBD | Not started | - |
| 43. Travel & Location-State Contract Resolution | 0/TBD | Not started | - |
| 44. Gameplay Docs Baseline Alignment | 0/TBD | Not started | - |
