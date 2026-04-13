# Roadmap: WorldForge

## Milestones

- ✅ **v1.0 Living Sandbox** — phases `1-36`, shipped `2026-04-08`
  Archives: [roadmap](/R:/Projects/WorldForge/.planning/milestones/v1.0-ROADMAP.md), [requirements](/R:/Projects/WorldForge/.planning/milestones/v1.0-REQUIREMENTS.md), [audit](/R:/Projects/WorldForge/.planning/milestones/v1.0-MILESTONE-AUDIT.md)
- 🚧 **v1.1 Gameplay Fidelity** — phases `37-55`, extended `2026-04-13`

## Overview

v1.1 started as a reconciliation milestone built from the [Phase 36 handoff](/R:/Projects/WorldForge/.planning/phases/36-gameplay-docs-to-runtime-reconciliation-audit/36-HANDOFF.md), not a new-feature brainstorm. The first tranche repaired gameplay-runtime trust: campaign-loaded transport, authoritative state, honest turn and simulation boundaries, complete checkpoint restore, and docs alignment. Live gameplay then surfaced a second tranche of work around scene authority, encounter scope, storyteller quality, character fidelity, research grounding, and text readability. A later milestone audit found remaining route-matrix gaps and closeout-proof drift, so the milestone now includes explicit gap-closure phases `53-55`. The milestone stays open until baseline gameplay feel is acceptable and the audited gaps are closed, not merely until the original reconciliation checklist is exhausted.

## Phases

**Phase Numbering:**
- Integer phases continue from the archived v1.0 roadmap and start here at `37`.
- Decimal phases remain reserved for urgent insertions between planned integers.

- [x] **Phase 37: Campaign-Loaded Gameplay Transport** - Remove active-session coupling from gameplay routes. (completed 2026-04-08)
- [x] **Phase 38: Authoritative Inventory & Equipment State** - Collapse runtime item truth onto one persistence model. (completed 2026-04-12)
- [x] **Phase 39: Honest Turn Boundary, Retry & Undo** - Make the player-visible turn boundary match the authoritative rollback boundary. (completed 2026-04-09)
- [x] **Phase 40: Live Reflection & Progression Triggers** - Turn dormant reflection scaffolding into observable runtime behavior. (completed 2026-04-10)
- [x] **Phase 41: Checkpoint-Complete Simulation Restore** - Restore full campaign runtime state, including simulation metadata and post-turn world mutations. (completed 2026-04-11)
- [x] **Phase 42: Targeted Oracle & Start-Condition Runtime Effects** - Make target-aware rulings and structured starts mechanically real in live play. (completed 2026-04-11)
- [x] **Phase 43: Travel & Location-State Contract Resolution** - Implement or explicitly deprecate the remaining location/time gameplay promises. (completed 2026-04-11)
- [x] **Phase 44: Gameplay Docs Baseline Alignment** - Rewrite gameplay docs into an honest planning baseline for the repaired runtime. (completed 2026-04-11)
- [x] **Phase 45: Authoritative Scene Assembly & Start-of-Play Runtime** - Make turn output single-pass, runtime-driven, and grounded in actual opening/location state instead of duplicated or premise-dump narration. (completed 2026-04-12)
- [x] **Phase 46: Encounter Scope, Presence & Knowledge Boundaries** - Stop treating large locations like one tiny room and constrain scene knowledge to actual encounter/perception scope. (completed 2026-04-12)
- [x] **Phase 47: Storyteller Output Quality & Anti-Slop Prompting** - Research and tune storyteller prompting/model settings for materially better RP writing quality. (completed 2026-04-12)
- [x] **Phase 48: Character Identity Fidelity & Canonical Modeling** - Preserve distinctive identity/personality details in runtime character modeling, especially for imported and canonical characters. (completed 2026-04-12)
- [x] **Phase 49: Search Grounding & In-Game Research Semantics** - Make worldgen and live-game research ask for the right facts with focused retrieval intent. (completed 2026-04-12)
- [x] **Phase 50: Gameplay Text Presentation & Rich Readability** - Improve gameplay text rendering, typography, and rich-text affordances for both input and narration. (completed 2026-04-13)
- [x] **Phase 51: Persistent Worldgen Research Frame & DNA-Aware Retrieval** - Persist worldgen research intent once and steer follow-up canon lookup from DNA/task context instead of rebuilding blended searches from raw user prose. (completed 2026-04-13)
- [x] **Phase 52: Advanced Character Inspector & Full Record Visibility** - Expose the full character record in authoring/review UI so grounding, power, continuity, and provenance are inspectable without manual DB access. (completed 2026-04-13)
- [x] **Phase 53: Gameplay Route Convergence & Reload-Stable Research Log** - Close remaining alternate gameplay route bypasses and make explicit lookup/compare replies survive history reload. (completed 2026-04-13)
- [ ] **Phase 54: Draft-Backed NPC Edit Persistence & Review Convergence** - Make World Review edits to draft-backed NPCs persist through save/load instead of silently losing top-level changes.
- [ ] **Phase 55: Gap-Proof Verification Matrix & Closeout Truth Alignment** - Close the remaining route-matrix blind spots and make milestone closeout artifacts reflect the actual late-phase defect history.

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
**Plans**: 3 plans
Plans:
- [x] 38-01-PLAN.md — Define authoritative item-row equipment metadata, legacy backfill, and reload/restore migration tests.
- [x] 38-02-PLAN.md — Rewire backend prompt, world, and compatibility readers to the shared authoritative inventory seam.
- [x] 38-03-PLAN.md — Rewire frontend world parsing and `/game` inventory/equipment rendering to the authoritative backend contract.

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
- [x] 44-03-PLAN.md — Rewrite `memory.md` to the live runtime/retrieval contract and record a claim-by-claim resolution map for all elevated Phase 36 Group B/C items.

### Phase 45: Authoritative Scene Assembly & Start-of-Play Runtime
**Goal**: Make player-visible turn text a single runtime-grounded scene output instead of duplicated prose, premise dumps, or narration emitted before authoritative local changes settle.
**Depends on**: Phase 39, Phase 41, Phase 42, Phase 43
**Requirements**: SCEN-01
**Success Criteria** (what must be TRUE):
  1. Generated turn output no longer repeats scene blocks or restarts the same beat mid-response.
  2. Start-of-play text is derived from actual start location, start conditions, and immediate local events instead of echoing the premise as the opening message.
  3. The final narrated turn is assembled after authoritative local world/NPC changes for the perceivable scene, not as a parallel pre-simulation guess.
**Plans**: 0 plans
Plans:
- [ ] TBD (run `$gsd-plan-phase 45` to break down)

### Phase 46: Encounter Scope, Presence & Knowledge Boundaries
**Goal**: Constrain scene participation and knowledge to actual encounter/perception scope so big locations stop behaving like one tiny room.
**Depends on**: Phase 43, Phase 45
**Requirements**: SCEN-02
**Success Criteria** (what must be TRUE):
  1. Large locations no longer imply universal co-presence; only actually present or perceivable entities enter the live scene.
  2. NPCs do not reason or react as if every actor in the broader location has already been met.
  3. Scene-local knowledge and encounter context derive from proximity, presence, and perception rather than flat location membership.
**Plans**: 4 plans
Plans:
- [x] 46-01-PLAN.md — Lock the encounter-scope contract in failing backend and `/game` regressions before changing runtime behavior.
- [x] 46-02-PLAN.md — Add the shared scene-scope seam, durable local-scope state, and authoritative lifecycle sync on movement/arrival paths.
- [x] 46-03-PLAN.md — Rewire scene assembly, prompts, present-NPC settlement, and off-screen routing to shared presence/awareness/knowledge truth.
- [x] 46-04-PLAN.md — Expose scene-scoped world reads and rewire `/game` to immediate-scene participants instead of broad-location membership.

### Phase 47: Storyteller Output Quality & Anti-Slop Prompting
**Goal**: Lift live RP writing quality through research-backed storyteller prompting, model settings, and anti-slop controls.
**Depends on**: Phase 45, Phase 46
**Requirements**: WRIT-01
**Success Criteria** (what must be TRUE):
  1. Storyteller output materially reduces purple prose, generic AI smell, and empty dramatic inflation during normal play.
  2. Prompting and presets are grounded in explicit research on working RP patterns for current target models, especially `GLM-5`.
  3. Higher writing quality does not regress engine truthfulness, action clarity, or runtime determinism.
**Plans**: 3 plans
Plans:
- [x] 47-01-PLAN.md — Create the backend-owned storyteller preset layer, contract assembly, and bounded GLM storyteller model seam.
- [x] 47-02-PLAN.md — Wire the preset layer into prompt assembly and live storyteller runtime calls without adding a rewrite stack.
- [x] 47-03-PLAN.md — Add only the evidence-backed final-visible quality guard and close the phase with live GLM smoke verification.

### Phase 48: Character Identity Fidelity & Canonical Modeling
**Goal**: Rebuild runtime character modeling so native, imported, and canonical characters preserve the details that actually make them behave distinctly.
**Depends on**: Phase 42, Phase 47
**Requirements**: CHARF-01
**Success Criteria** (what must be TRUE):
  1. Key/canonical characters retain distinctive personality, motives, and behavioral constraints instead of flattening into generic summaries.
  2. Imported/card-based characters preserve salient identity details that later influence goals, planning, and reactions.
  3. Runtime character structure captures the information needed for believable behavior, not just creation-time flavor.
**Plans**: 4 plans
Plans:
- [x] 48-01-PLAN.md — Extend the shared character lane with richer identity layers, route schema/materialization contracts, and compatibility-safe hydration.
- [x] 48-02-PLAN.md — Rebuild generation/import/template seams and lock parse/save/load/world payload character contracts to the richer identity model.
- [x] 48-03-PLAN.md — Rewire prompt assembly, NPC runtime, and reflection to consume richer identity truth with continuity boundaries.
- [x] 48-04-PLAN.md — Preserve richer identity through bounded frontend draft/editor seams without a major UI redesign.

### Phase 49: Search Grounding & In-Game Research Semantics
**Goal**: Make worldgen and live gameplay research ask for the right facts with focused retrieval intent rather than vague blended searches.
**Depends on**: Phase 47, Phase 48
**Requirements**: RES-01
**Success Criteria** (what must be TRUE):
  1. Search/query generation decomposes mixed-premise asks into narrow, retrievable information needs.
  2. Live gameplay can ground fact lookups, power comparisons, or event clarification without contaminating scenes with unfocused research blobs.
  3. Search-grounded context improves relevance and usefulness for both worldgen and runtime play.
**Plans**: 3 plans
Plans:
- [x] 49-01-PLAN.md — Add explicit worldgen retrieval-intent planning and keep world canon on the existing `ipContext` reuse lane.
- [x] 49-02-PLAN.md — Attach durable grounded character and power profiles to the existing Phase 48 character record lane.
- [x] 49-03-PLAN.md — Add bounded gameplay lookup semantics and align research settings copy with the broadened grounding scope.

### Phase 50: Gameplay Text Presentation & Rich Readability
**Goal**: Make gameplay text surfaces materially easier to read and scan through better formatting, typography, and rich-text affordances.
**Depends on**: Phase 45, Phase 47
**Requirements**: UX-01
**Success Criteria** (what must be TRUE):
  1. Generated narration and player input render with improved readability rather than dense hard-to-scan plain blocks.
  2. Rich-text affordances improve emphasis and structure without obscuring stream behavior or gameplay state.
  3. Presentation changes stay consistent across `/game` and preserve correctness of gameplay updates.
**Plans**: 4 plans
Plans:
- [x] 50-01-PLAN.md — Build the bounded rich-text renderer, safe RP formatting helpers, and role-aware gameplay log blocks.
- [x] 50-02-PLAN.md — Apply the hybrid concept shell, sticky input, and panel readability treatment to `/game`.
- [x] 50-03-PLAN.md — Add the persisted `ui.showRawReasoning` settings contract and dedicated Gameplay toggle UI.
- [x] 50-04-PLAN.md — Add separate reasoning transport and the optional `/game` disclosure rendering for provider reasoning.

### Phase 51: Persistent Worldgen Research Frame & DNA-Aware Retrieval
**Goal**: Stop rebuilding worldgen research intent from raw user prose on every step by persisting one campaign/worldgen research frame and using it to steer DNA-aware follow-up canon lookup.
**Depends on**: Phase 49
**Requirements**: RES-02
**Success Criteria** (what must be TRUE):
  1. Raw `knownIP` input is treated as a hint and canonicalized before worldgen research, so user prose does not become the franchise key or search subject verbatim.
  2. Worldgen generation/regeneration persists one research frame derived from canon, divergence, and chosen World DNA, then reuses it for step-specific sufficiency checks.
  3. Targeted worldgen follow-up research asks for concise missing canon facts shaped by the active DNA/task context instead of rebuilding a blended world query on every step.
**Plans**: 2 plans
Plans:
- [x] 51-01-PLAN.md — Persist a worldgen research frame in campaign config and thread it through generate/regenerate worldgen seams.
- [x] 51-02-PLAN.md — Make sufficiency and retrieval planning DNA-aware while keeping follow-up jobs concise and canonical.

### Phase 52: Advanced Character Inspector & Full Record Visibility
**Goal**: Surface the full structured character record in review/authoring UI so NPC fidelity, grounding, and power semantics are inspectable without direct database queries.
**Depends on**: Phase 48, Phase 49, Phase 50
**Requirements**: UX-02
**Success Criteria** (what must be TRUE):
  1. World Review NPC cards expose the richer identity, grounding, power, source, continuity, and provenance data already stored on the shared character record.
  2. The advanced inspector reads the same `draft` / `characterRecord` truth already returned by backend world payloads instead of inventing a parallel frontend model.
  3. The inspector remains additive and read-only, so world save/edit flows keep their existing scaffold contract.
**Plans**: 1 plan
Plans:
- [x] 52-01-PLAN.md — Preserve full record metadata through the editable scaffold and render a read-only advanced inspector on NPC review cards.

### Phase 53: Gameplay Route Convergence & Reload-Stable Research Log
**Goal**: Remove the remaining legacy gameplay-route bypasses and make explicit grounded research behave like a real, reload-stable part of the game log.
**Depends on**: Phase 45, Phase 47, Phase 49
**Requirements**: SCEN-01, WRIT-01, RES-01
**Gap Closure:** Closes milestone-audit gaps around the legacy plain-text `/api/chat` bypass and non-persisted `/lookup` / `/compare` replies.
**Success Criteria** (what must be TRUE):
  1. No live gameplay route can bypass the authoritative scene-assembly and storyteller-quality seams that Phases 45 and 47 established.
  2. `/lookup` and `/compare` replies survive history reload and remain separate from ordinary scene-turn narration.
  3. The gameplay route matrix explicitly proves action, retry, opening, and lookup behavior across stream plus reload boundaries.
**Plans**: 2 plans
Plans:
- [x] 53-01-PLAN.md — Retire the legacy `/api/chat` bypass and persist factual lookup exchanges on the authoritative chat-history lane.
- [x] 53-02-PLAN.md — Rehydrate persisted lookup/compare entries on `/game` and close the stream-plus-reload route matrix.

### Phase 54: Draft-Backed NPC Edit Persistence & Review Convergence
**Goal**: Make World Review edits converge onto one authoritative draft/scaffold lane so generated, imported, and researched NPCs do not silently lose manual edits on save/load.
**Depends on**: Phase 48, Phase 49, Phase 52
**Requirements**: UX-02
**Gap Closure:** Closes milestone-audit gaps around draft-backed NPC edit loss in authoring/review flows.
**Success Criteria** (what must be TRUE):
  1. Editing name, persona, tags, and goals for a draft-backed NPC survives save/load and matches what the user last saw in World Review.
  2. Save-edits and scaffold persistence use one converged truth for draft-backed NPCs instead of preferring stale draft payloads over visible edits.
  3. The advanced inspector remains additive and read-only while normal authoring/review save flows stay trustworthy.
**Plans**: 2 plans
Plans:
- [ ] 54-01-PLAN.md — Converge the backend draft-backed NPC save boundary and prove the route -> save -> load -> world-payload round-trip.
- [ ] 54-02-PLAN.md — Prove the repaired backend truth lands in World Review reload without reopening inspector/editor scope.

### Phase 55: Gap-Proof Verification Matrix & Closeout Truth Alignment
**Goal**: Close the remaining verification blind spots and make milestone closeout/state artifacts accurately describe the actual fixed product.
**Depends on**: Phase 46, Phase 47, Phase 48, Phase 50, Phase 51, Phase 52, Phase 53, Phase 54
**Requirements**: SCEN-02, WRIT-01, DOCA-03
**Gap Closure:** Closes milestone-audit blind spots around save-character scene-scope proof, opening-scene storyteller smoke, and stale milestone/phase verification records.
**Success Criteria** (what must be TRUE):
  1. The save-character start-of-play path is explicitly covered in the encounter-scope verification matrix.
  2. Storyteller live smoke and milestone closeout include opening-scene prose, not only ordinary turn categories.
  3. ROADMAP, STATE, closeout checklist, and late-phase verification artifacts reflect the real defect history and current semantics instead of stale intermediate states.
**Plans**: 0 plans
Plans:
- [ ] TBD (run `$gsd-plan-phase 55` to break down)

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 37. Campaign-Loaded Gameplay Transport | 2/2 | Complete | 2026-04-08 |
| 38. Authoritative Inventory & Equipment State | 3/3 | Complete | 2026-04-12 |
| 39. Honest Turn Boundary, Retry & Undo | 3/3 | Complete | 2026-04-09 |
| 40. Live Reflection & Progression Triggers | 3/3 | Complete | 2026-04-10 |
| 41. Checkpoint-Complete Simulation Restore | 2/2 | Complete | 2026-04-11 |
| 42. Targeted Oracle & Start-Condition Runtime Effects | 2/2 | Complete | 2026-04-11 |
| 43. Travel & Location-State Contract Resolution | 6/6 | Complete | 2026-04-11 |
| 44. Gameplay Docs Baseline Alignment | 3/3 | Complete | 2026-04-11 |
| 45. Authoritative Scene Assembly & Start-of-Play Runtime | 3/3 | Complete    | 2026-04-12 |
| 46. Encounter Scope, Presence & Knowledge Boundaries | 4/4 | Complete   | 2026-04-12 |
| 47. Storyteller Output Quality & Anti-Slop Prompting | 3/3 | Complete | 2026-04-12 |
| 48. Character Identity Fidelity & Canonical Modeling | 4/4 | Complete    | 2026-04-12 |
| 49. Search Grounding & In-Game Research Semantics | 4/4 | Complete    | 2026-04-12 |
| 50. Gameplay Text Presentation & Rich Readability | 4/4 | Complete   | 2026-04-13 |
| 51. Persistent Worldgen Research Frame & DNA-Aware Retrieval | 2/2 | Complete | 2026-04-13 |
| 52. Advanced Character Inspector & Full Record Visibility | 1/1 | Complete | 2026-04-13 |
| 53. Gameplay Route Convergence & Reload-Stable Research Log | 2/2 | Complete | 2026-04-13 |
| 54. Draft-Backed NPC Edit Persistence & Review Convergence | 0/0 | Pending |  |
| 55. Gap-Proof Verification Matrix & Closeout Truth Alignment | 0/0 | Pending |  |
