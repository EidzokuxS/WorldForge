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
- [x] **Phase 54: Draft-Backed NPC Edit Persistence & Review Convergence** - Make World Review edits to draft-backed NPCs persist through save/load instead of silently losing top-level changes. (completed 2026-04-13)
- [x] **Phase 55: Gap-Proof Verification Matrix & Closeout Truth Alignment** - Close the remaining route-matrix blind spots and make milestone closeout artifacts reflect the actual late-phase defect history. (completed 2026-04-13)
- [x] **Phase 56: Fail-Closed Runtime & Worldgen Fallback Removal** - Remove semantic fallback paths that substitute synthetic content, backup providers, or surrogate runtime behavior where the game should instead fail closed or surface explicit absence. Late hardening on `2026-04-14` also closed the real known-IP worldgen replacement path and removed magic-number output caps from live worldgen/research runtime calls. (completed 2026-04-13, hardened 2026-04-14)

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
- [x] 48-04-PLAN.md ��� Preserve richer identity through bounded frontend draft/editor seams without a major UI redesign.

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
- [x] 50-03-PLAN.md ��� Add the persisted `ui.showRawReasoning` settings contract and dedicated Gameplay toggle UI.
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
- [x] 54-01-PLAN.md — Converge the backend draft-backed NPC save boundary and prove the route -> save -> load -> world-payload round-trip.
- [x] 54-02-PLAN.md — Prove the repaired backend truth lands in World Review reload without reopening inspector/editor scope.

### Phase 55: Gap-Proof Verification Matrix & Closeout Truth Alignment
**Goal**: Close the remaining verification blind spots and make milestone closeout/state artifacts accurately describe the actual fixed product.
**Depends on**: Phase 46, Phase 47, Phase 48, Phase 50, Phase 51, Phase 52, Phase 53, Phase 54
**Requirements**: SCEN-02, WRIT-01, DOCA-03
**Gap Closure:** Closes milestone-audit blind spots around save-character scene-scope proof, opening-scene storyteller smoke, and stale milestone/phase verification records.
**Success Criteria** (what must be TRUE):
  1. The save-character start-of-play path is explicitly covered in the encounter-scope verification matrix.
  2. Storyteller live smoke and milestone closeout include opening-scene prose, not only ordinary turn categories.
  3. ROADMAP, STATE, closeout checklist, and late-phase verification artifacts reflect the real defect history and current semantics instead of stale intermediate states.
**Plans**: 2 plans
Plans:
- [x] 55-01-PLAN.md — Close the missing proof chain for save-character scene-scope initialization and opening-scene storyteller smoke coverage.
- [x] 55-02-PLAN.md — Align roadmap/state/closeout and late-phase verification artifacts to the actual defect history and current semantics.

### Phase 56: Fail-Closed Runtime & Worldgen Fallback Removal
**Goal**: Remove semantic fallback behavior so runtime and worldgen either produce the intended grounded result or surface explicit absence/error instead of silently substituting surrogate output.
**Depends on**: Phase 48, Phase 49, Phase 50, Phase 51, Phase 55
**Requirements**: TRUTH-01
**Success Criteria** (what must be TRUE):
  1. Canonical/worldgen NPCs no longer receive synthetic draft-derived grounding or power profiles that masquerade as researched truth.
  2. Storyteller, Oracle, and worldgen no longer silently fail over to backup providers/models or server-side surrogate content when the intended path fails or omits data.
  3. Settings and UI stop advertising semantic fallback behavior and instead expose only honest controls and states.
**Plans**: 0 plans
Plans:
- [ ] TBD (post-55 gap phase; planned and executed inline for this fix)

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
| 54. Draft-Backed NPC Edit Persistence & Review Convergence | 2/2 | Complete   | 2026-04-13 |
| 55. Gap-Proof Verification Matrix & Closeout Truth Alignment | 2/2 | Complete    | 2026-04-13 |
| 56. Fail-Closed Runtime & Worldgen Fallback Removal | 1/1 | Complete | 2026-04-14 |
| 57. Power Scaling & Character Profile Redesign | 5/5 | Complete    | 2026-04-16 |
| 61. Character Ingestion Frontend UI | 4/4 | Complete | 2026-04-17 |
| 64. NPC Personality Regeneration Parity | 5/5 | Complete   | 2026-04-19 |
| 65. Supporting NPC power stats and review payload parity | 4/4 | Complete | 2026-04-19 |
| 66. Combat Envelope and Oracle Context | 4/4 | Complete | 2026-04-19 |

### Phase 57: Power Scaling & Character Profile Redesign

**Goal:** Replace the bloated grounding/power/continuity system (phases 48-49 output) with a VS Battles-based power scaling system, compact actionable character profiles, and structured hax abilities. Remove SourceBundle, ContinuityPolicy, and CharacterGroundingProfile entirely.
**Requirements**: SC-1, SC-2, SC-3, SC-4, SC-5, SC-6, SC-7
**Depends on:** Phase 56
**Success Criteria** (what must be TRUE):
  1. Every known-IP character has structured power stats (AP, Speed, Durability, Intelligence) using condensed VS Battles tiers + 1-10 rank.
  2. Hax abilities are stored as structured objects (name, type, bypass tier, limitations) — not free text.
  3. Character profiles contain compact personality/appearance/behavior data without duplication across fields.
  4. CharacterGroundingProfile, PowerProfile (old), SourceBundle, and ContinuityPolicy types are removed from shared/backend/frontend.
  5. grounded-lookup.ts uses new power stats for character comparisons.
  6. NPC agent and reflection prompts work without continuity fields.
  7. Frontend character card shows main info + Advanced tab with power stats table, abilities, vulnerabilities (radar/spider chart deferred to future phase).
**Plans:** 5/5 plans complete

Plans:
- [x] 57-01-PLAN.md — Additive-only: define new VS Battles power types, tier comparison + normalization utilities, and new route Zod schemas with coercion.
- [x] 57-02-PLAN.md — Fail-closed migration adapter, rewrite character pipeline (known-IP, archetype, generators, routes) for PowerStats, remove old schemas.
- [x] 57-03-PLAN.md — Rewrite engine consumers (grounded-lookup, prompt-assembler, npc-agent, reflection) with clean profile surfaces and no scope-creep thresholds.
- [x] 57-04-PLAN.md — Delete old types/files, redesign frontend inspector, clean frontend drafts, entry-path verification matrix.

### Phase 58: Pipeline Observability Logging

**Goal:** Instrument the entire turn pipeline with structured JSONL logs correlated by turn ID so Claude (and humans) can inspect end-to-end data flow without attaching a debugger or requesting user screenshots. Log player input, Oracle deterministic outcome, Judge tool calls and results, assembled prompts (runtime identity lines, PowerStats, relationships, scene), Storyteller streams (visible + hidden pass), state mutations (SQLite writes, LanceDB embeddings), and SSE events dispatched to the frontend. Persist per turn at `campaigns/{id}/logs/turn-{tick}.jsonl` plus a pretty console tail. Verbose toggle per role (Judge, Storyteller, Oracle, NPC agent, reflection, embedder). Truncate payloads >10KB with hash reference. Never log secrets. Reference: `memory/project_pipeline_observability.md`.
**Requirements**: Foundation for all future debugging; enables partial UAT item from Phase 57 Test 6 to be fully verified.
**Depends on:** Phase 57
**Plans:** 4/4 plans complete

Plans:
- [x] 58-01-PLAN.md — Logger core rewrite: pino + AsyncLocalStorage + redaction + 10KB truncation + ObservabilityConfig in Settings (Wave 0)
- [x] 58-02-PLAN.md — Instrument 14 engine/vector/ai pipeline seams with structured log.event calls + withRole wrappers (Wave 1)
- [x] 58-03-PLAN.md — Route-level runWithTurnContext wrap + turn.begin/turn.end/sse.emit seams + dumpFullPrompts side-car (Wave 2)
- [x] 58-04-PLAN.md — Integration tests: single-turn 18-seam coverage, concurrent-turn isolation, SSE stream-safety, VALIDATION.md (Wave 3)

### Phase 59: Game Shell and Layout Fix

**Goal:** Rewrite the game page shell so the viewport stays locked and each panel scrolls internally, matching the concept in `docs/ui_concept_hybrid.html`. Replace `min-h-screen` with `h-screen` on the shell, remove grid `xl:items-start` (or convert to horizontal flex-row of fixed-width asides like the concept), give both LocationPanel / LorePanel / CharacterPanel a `flex flex-col overflow-hidden` outer wrapper and `flex-1 overflow-y-auto` inner scroll region, and ensure the middle reader column plus sticky action dock always remain within viewport. Clean up Phase 46 typecheck red (`prompt-assembler.ts:630`) and any other static-analysis debt introduced by Phase 57 refactor. Cross-browser smoke test.
**Requirements**: Unblocks Phase 57 Test 7 (`/lookup power_profile`) and in-game UAT items on Phases 37, 40, 48, 49, 50 — all currently blocked because the action bar is pushed below the viewport fold.
**Depends on:** Phase 58
**Plans:** 2 plans

Plans:
- [ ] 59-01-PLAN.md — Rewrite /game shell to viewport-locked h-screen + flex-row tri-column, align LorePanel outer wrapper, add DOM regression tests.
- [ ] 59-02-PLAN.md — Fix prompt-assembler.ts:786 + target-context.ts:198 null-narrowing TS errors, PinchTab live-browser smoke, fill 59-VALIDATION.md.

### Phase 60: Character Ingestion Backend Pipeline

**Goal:** Redesign the character ingestion pipeline so V2/V3 cards, free-text descriptions, archetype research, and AI generation all feed a single unified backend flow for both player and NPC creation. V2 card becomes INPUT to the pipeline, never a direct field map. Introduce an explicit user-override text field whose directives take priority over card data, which in turn overrides web research (priority chain: user override > card > research > LLM inference). Original characters extract powers from card lore or infer them; canon characters run archetype research + VS Battles PowerStats assessment. Ensure merge produces a complete `CharacterRecord` with full `PowerStats` (attackPotency, durability, speed, intelligence, hax, vulnerabilities) plus grounded profile, provenance, motivations, and loadout. No fallbacks — failure retries or fails loudly (per `feedback_no_fallbacks_v2.md`). Unified for `parse-character`, `generate-character`, `research-character`, `import-v2-card`, `parse-npc`, `generate-npc`, `import-npc` endpoints. Reference: `memory/project_v2_import_pipeline.md`.
**Requirements**: P60-R1, P60-R2, P60-R3, P60-R4, P60-R5, P60-R6, P60-R7, P60-R8, P60-R9 — prerequisite for Phase 61 UI. Directly addresses the V2 import design gap recorded after Phase 57 UAT.
**Depends on:** Phase 59
**Plans:** 4/4 plans complete

Plans:
- [x] 60-01-PLAN.md — Foundation: ingestion directory scaffold, types, retry, extractor, classifier, overrideText schema plumbing, docs housekeeping.
- [x] 60-02-PLAN.md — Synthesizer: priority-merge LLM synthesis stage with mocked tests.
- [x] 60-03-PLAN.md — Power Assessor: canon branch (enrichKnownIpWorldgenNpcDraft + overrideText) + original branch (assessOriginalCharacterPowerStats, no web search).
- [x] 60-04-PLAN.md — Route refactor: ingestCharacterDraft orchestrator, 4 routes delegate, delete mapV2Card* and synthesizeArchetypePowerStats.

### Phase 61: Character Ingestion Frontend UI

**Goal:** Ship human-friendly character ingestion UI for both the player-character creation page and the world-review NPC tab, built on the Phase 60 backend. Add a Power Stats section (tier+rank table, hax list with bypass badges, vulnerabilities with severity) to CharacterCard / CharacterForm on `/campaign/[id]/character` so the same inspector surface exists at creation time as in world-review. Add a visible "override text" field that feeds the Phase 60 priority merge so the user can type instructions like "her eyes are red not blue" or "she is weaker than canon" at import time. Unify the NPC creation tab UX with the player creation UX — same modes (describe / import V2 / AI generate / research archetype), same override field, same preview inspector. Clear error states (no silent degradation) when pipeline steps fail; real retry buttons. Match `docs/ui_concept_hybrid.html` aesthetic.
**Requirements**: P61-R1, P61-R2, P61-R3, P61-R4, P61-R5. Unblocks Phase 57 Tests 2 and 3. Closes the character-creation UI gap recorded in Phase 57 UAT as a major issue.
**Depends on:** Phase 60
**Plans:** 4/4 plans executed — **COMPLETE 2026-04-17**

Plans:
- [x] 61-01-PLAN.md — Foundation atoms (PowerStatsSection, OverrideTextField, CreationModes, PipelineErrorBanner) + IngestionError + API transport + docs housekeeping.
- [x] 61-02-PLAN.md — Player creation page rewrite: 4-mode UX, overrideText threading, top-level PowerStats on CharacterCard, PipelineErrorBanner retry closure.
- [x] 61-03-PLAN.md — NPC tab rewrite: consume shared atoms, add AI-generate mode, top-level PowerStats on NPC cards, rewire inspector to shared source.
- [x] 61-04-PLAN.md — Integration verification: typecheck green, full Vitest suite passing, lint clean, PinchTab programmatic smoke, Phase 61 SUMMARY.

### Phase 62: Advanced Character Inspector Complement Redesign

**Goal:** Rework the Advanced panel (`CharacterRecordInspector`) in the world-review NPC tab so it is strictly complementary to the basic NPC card. Remove every field duplicated by the basic card (displayName, currentLocationName, factionName, personaSummary, PowerStats table + hax + vulnerabilities, activeGoals / shortTermGoals / longTermGoals) and surface the uncovered `CharacterDraft` fields (biography, profile details, trimmed live dynamics, capabilities, runtime state, loadout including currencyNotes, full starting conditions, dedicated provenance, raw JSON) in the 10-section order locked in 62-CONTEXT.md. Preserve component signature, empty-state fallback renders `No additional data`, basic NPC card markup is not touched.
**Requirements**: P62-R1, P62-R2, P62-R3, P62-R4, P62-R5
**Depends on:** Phase 61
**Plans:** 4/4 plans complete

Plans:
- [x] 62-01-PLAN.md — Rewrite `CharacterRecordInspector` with 10 locked sections and empty-state fallback; remove duplicates and `PowerStatsSection` import.
- [x] 62-02-PLAN.md — Rewrite `character-record-inspector.test.tsx` to lock the new contract with original-world fixtures (no IP names).
- [x] 62-03-PLAN.md — Verification pass: typecheck, lint, targeted Vitest, full frontend Vitest, diff-scope check, PinchTab browser smoke, `62-VALIDATION.md` evidence bundle.

### Phase 63: Personality Interiority Model

**Goal:** Replace the flat behavioral model (`behavioralCore.motives/taboos/pressureResponses` + `capabilities.traits/flaws` + `provenance.legacyTags`) with a V2-SillyTavern-style personality interiority block (`summary / voice / decisionStyle / worldview / internalContradictions / personalMythology / sampleLines`) on every `CharacterIdentityDraft`. The block flows through all 4 ingestion paths (parse / generate / research / V2 import — including `mes_example` → `sampleLines`), replaces a specific region of the runtime prompt assembler + npc-agent + npc-offscreen + reflection prompts, surfaces in the basic NPC card (always-visible summary+voice + collapsible details) and the player CharacterCard, drops the deprecated fields from the advanced inspector + character form, and an LLM-packed backfill script populates pre-existing characters. Deprecated INNER fields stay `.optional()` for one phase window for backward read (wrappers stay defaulted); final removal is a follow-up cleanup phase.
**Requirements**: P63-R1, P63-R2, P63-R3, P63-R4, P63-R5, P63-R6, P63-R7, P63-R8
**Depends on:** Phase 62
**Plans:** 5/6 plans executed

Plans:
- [x] 63-01-foundation-PLAN.md — Shared types + Zod (inner-field .optional() only; wrapper stays defaulted) + record-adapter normalizers + mes-example-parser (V2+V3 coverage) + REQUIREMENTS/ROADMAP/docs housekeeping + backend/src/scripts/ directory.
- [x] 63-02-ingestion-pipeline-PLAN.md — richCharacterSchema personality flat-keys, buildFlatOutputStrategy, synthesizer prompt, all 4 route prompts, V2/V3 mesExample threading + parser integration, prompt-contract rule strings + pinned tests (atomic with schema), persona-template merge, synthesizer + integration tests.
- [x] 63-03-engine-consumers-PLAN.md — prompt-assembler `Personality:` block, npc-agent / npc-offscreen / reflection-agent / reflection-tools rewrites, liveDynamics.attachments migration with read-time fallback from behavioralCore.attachments, snapshot tests for each.
- [x] 63-04-ui-PLAN.md — `PersonalitySection` shared atom, basic NPC card insertion, player CharacterCard integration, advanced inspector cleanup (drop motives/traits/flaws/legacyTags + entire Provenance section, drop section count 10 → 9), character-form trait/flaw editor removal, all associated test updates.
- [x] 63-05-backfill-PLAN.md — `backend/src/scripts/backfill-personality.ts` with --dry-run + --campaign + --batch-size + per-campaign connectDb/closeDb loop + withPipelineRetry + re-read-before-write safeguard + attachments carry-forward + per-row backup file (real-run only, not dry-run) + Phase 58 structured logging + idempotency Vitest, npm script wiring.
- [ ] 63-06-verification-PLAN.md — Full backend + frontend Vitest suites, real-path verification for all 4 ingestion modes (parse/generate/research/V2 import), PinchTab smoke with HTTP fallback path on basic NPC card PERSONALITY rendering, manual backfill run on dev campaign, `63-VALIDATION.md` sign-off, gitnexus_detect_changes report, Phase 62 P62-R2 section-order test updated 10 → 9.

### Phase 64: NPC Personality Regeneration Parity

**Goal:** Make worldgen and regenerate NPC paths produce the full structured `identity.personality` block expected by the richer Phase 63 model/UI instead of collapsing regenerated records back to `summary`-only personality output.
**Requirements**: P64-R1, P64-R2, P64-R3, P64-R4, P64-R5, P64-R6, P64-R7, P64-R8
**Gap Closure:** Closes the remaining Phase 63 parity gap where worldgen-emitted NPCs (initial scaffold + regenerate-section) failed to repopulate `voice`, `decisionStyle`, `worldview`, `internalContradictions`, `personalMythology`, and `sampleLines`. Includes a narrow repair path for legacy summary-only NPCs created before the runtime fix landed.
**Depends on:** Phase 63
**Plans:** 5/5 plans complete

Plans:
- [x] 64-01-personality-schema-foundation-PLAN.md — Shared Zod fragment + flat→nested mapper; drift-free reuse across worldgen npcs-step and npc-generator.
- [x] 64-02-worldgen-npcs-step-fix-PLAN.md — Extend `npcs-step.ts` schema + prompt + mapping after `fromLegacyScaffoldNpc`, add bounded sample-line repair with failure fallback, and migrate `npc-generator.ts` to the shared helper.
- [x] 64-03-regenerate-integration-test-PLAN.md — Real-step integration test on `/api/worldgen/regenerate-section` `section="npcs"` that mocks only the LLM seam and proves personality round-trips through HTTP.
- [x] 64-04-backfill-incomplete-pack-PLAN.md — `backfill-personality.ts --mode=incomplete-pack` with a tightened legacy-summary-only predicate that excludes valid empty `sampleLines` / `internalContradictions` cases while preserving all Phase 63 safety guards.
- [x] 64-05-verification-gate-PLAN.md — Backend-only full-suite gate, Phase 63 engine personality regressions, validation closeout, and roadmap/requirements updates.

### Phase 65: Supporting NPC power stats and review payload parity

**Goal:** Close the remaining review/runtime gap where supporting NPCs lose visible power stats — worldgen `npcs-step` and the `/api/worldgen/regenerate-section` handler both enrich every NPC (key + supporting) in both worlds (known-IP + original) via a shared `enrichNpcsBatch` helper that delegates to the existing `assessPowerStats` dispatcher, fails closed on retry exhaustion, and preserves `draft.powerStats` through the review creation envelope so the PowerStatsSection renders for freshly-created supporting NPCs.
**Requirements**: P65-R1, P65-R2, P65-R3, P65-R4, P65-R5, P65-R6, P65-R7, P65-R8, P65-R9, P65-R10
**Gap Closure:** Closes the remaining scaffold/runtime gap where `generateNpcsStep` only enriched known-IP key NPCs and the World Review creation handlers dropped the authoritative `draft` envelope, which hid `draft.powerStats` for supporting NPCs even when the backend had already computed them.
**Depends on:** Phase 64
**Plans:** 4/4 plans executed

Plans:
- [x] 65-01-enrich-npcs-batch-helper-PLAN.md — Shared `enrichNpcsBatch` module delegates every NPC to the existing `assessPowerStats` dispatcher with bounded parallel batching and no outer retry wrapper.
- [x] 65-02-worldgen-npcs-step-integration-PLAN.md — Replace the line-679 gate with a single post-loop enrichNpcsBatch call covering every NPC; integration tests assert both tiers in both worlds.
- [x] 65-03-regenerate-saver-envelope-PLAN.md — Real-step HTTP integration tests on /regenerate-section, scaffold-saver supporting-tier round-trip regression (D-07 zero code change), 4-handler frontend envelope fix (Option A), PowerStatsSection render regression (D-09).
- [x] 65-04-verification-gate-PLAN.md — Backend full suite + typecheck + frontend component + scoped-eslint green; Phase 60/63/64 regressions intact; `65-VALIDATION.md` + `65-SUMMARY.md` written; closeout explicitly absorbed and verified the adjacent `record-adapters.ts` save-edits personality compatibility fix instead of treating it as external drift.

### Phase 66: Combat Envelope and Oracle Context

**Goal:** Make `powerStats`, `hax`, and `vulnerabilities` mechanically meaningful for Oracle adjudication by introducing a deterministic backend-owned `CombatEnvelope`, without widening into storyteller or persistence changes.
**Requirements**: P66-R1, P66-R2, P66-R3, P66-R4, P66-R5, P66-R6, P66-R7, P66-R8
**Depends on:** Phase 65
**Plans:** 4/4 plans complete

Plans:
- [x] 66-01-combat-envelope-foundation-PLAN.md — Pure backend-local `CombatEnvelope` builder, hostile-action gate, and unit coverage.
- [x] 66-02-target-context-combat-snapshot-PLAN.md — Additive character-target combat snapshot in `target-context` with honest no-fake-data behavior.
- [x] 66-03-oracle-combat-envelope-contract-PLAN.md — Optional `combatEnvelope` Oracle payload/prompt contract with pinned no-bypass clamp wording.
- [x] 66-04-hostile-action-integration-and-verification-PLAN.md — Player/NPC hostile-path wiring, observability, full backend verification gate, and closeout artifacts.

### Phase 67: Narrative Outcome Ceilings and NPC Combat Posture

**Goal:** Make combat narration and NPC hostile-choice posture respect the deterministic Phase 66 matchup truth by deriving backend-authored narrative outcome bounds and tick-local NPC combat posture from `CombatEnvelope`, without adding persistence, runtime tags, or hard combat math.
**Requirements**: P67-R1, P67-R2, P67-R3, P67-R4, P67-R5, P67-R6, P67-R7, P67-R8, P67-R9
**Depends on:** Phase 66
**Plans:** 4/4 plans complete

Plans:
- [x] 67-01-combat-bounds-and-posture-foundation-PLAN.md — Pure backend-local `NarrativeOutcomeBounds` and `NpcCombatPosture` helpers plus regression coverage.
- [x] 67-02-player-storyteller-outcome-bounds-PLAN.md — Hidden plus final visible narration prompt injection, no-envelope parity, and bounded `combat.bounds.derived` observability.
- [x] 67-03-npc-agent-combat-posture-PLAN.md — Tick-local primary-target posture derivation, `[COMBAT POSTURE]` prompt block, and bounded `combat.posture.derived` observability.
- [x] 67-04-verification-and-closeout-PLAN.md — Focused regressions, full backend suite, backend typecheck, scope-gate proof, and closeout artifacts.

### Phase 68: World Brain Hidden Adjudication and Scene Direction

**Goal:** Introduce a bounded judge-owned world-brain scene-direction seam for opening scenes and normal player turns so final visible narration consumes authoritative causal framing instead of inventing why actors are present from raw scene lists.
**Requirements**: P68-R1, P68-R2, P68-R3, P68-R4, P68-R5, P68-R6, P68-R7, P68-R8, P68-R9
**Depends on:** Phase 67
**Plans:** 4/4 plans complete

**Success Criteria** (what must be TRUE):
  1. Opening scenes and normal player turns both run a bounded backend-owned world-brain pass before visible narration.
  2. Final visible narration consumes authoritative, player-perceivable scene-direction facts and settled scene effects instead of inventing scene purpose or co-presence from raw lists.
  3. The existing hidden tool-driving pass remains in place but consumes world-brain direction as an additive bridge; full ownership migration remains deferred to Phase 69.
  4. Compact observability proves when the world-brain seam ran and how large the bounded causal packet was without dumping raw prompt bodies.

Plans:
- [x] 68-01-PLAN.md — Lock the bounded `WorldBrainSceneDirection` contract, caps, and formatter surface.
- [x] 68-02-PLAN.md — Wire the judge-owned world-brain seam into normal turns and SceneAssembly as an additive bridge.
- [x] 68-03-PLAN.md — Adopt the same world-brain seam for opening scenes and feed only perceivable direction into final narration.
- [x] 68-04-PLAN.md — Add compact world-brain observability, full backend verification, and validation evidence.

### Phase 69: Judge-Owned Hidden Pass Migration and Narrator-Only Runtime

**Goal:** Migrate the normal player-turn hidden adjudication path from storyteller-owned tool-driving to judge-owned structured planning plus deterministic backend execution, leaving storyteller as prose-only final narration.
**Requirements**: P69-R1, P69-R2, P69-R3, P69-R4, P69-R5, P69-R6, P69-R7, P69-R8, P69-R9
**Depends on:** Phase 68
**Plans:** 4/4 plans complete - **COMPLETE 2026-04-20**

**Success Criteria** (what must be TRUE):
  1. Normal player turns no longer let storyteller hidden passes decide world mutations directly; a judge-owned structured plan decides them first.
  2. Backend executes the ordered hidden adjudication deterministically, preserving turn-event semantics and failing loudly on invalid or failed actions.
  3. Final visible narration remains storyteller-only prose over settled authoritative scene state.
  4. Opening scenes remain on the Phase 68 path and observability proves the new judge-owned hidden seam ran.

Plans:
- [x] 69-01-PLAN.md — Define bounded `AdjudicationPlan` contract, shared tool-input schemas, and deterministic execution bridge.
- [x] 69-02-PLAN.md — Replace the player hidden storyteller pass with judge plan generation plus backend execution while preserving turn-event semantics.
- [x] 69-03-PLAN.md — Add a dedicated judge adjudication prompt surface and keep storyteller final-visible only.
- [x] 69-04-PLAN.md — Add observability, regression proof, and Phase 69 closeout artifacts.

### Phase 70: Reactive Scene Resolution and Canonical Event Flow

**Goal:** Introduce a local Scene Planner of Record so normal player-visible turns resolve as one coherent canonical scene step: keep Oracle as bounded outcome authority for this phase, replace separate world-brain direction, hidden adjudication planning, and present-NPC mini-rounds on the visible critical path with one structured `ScenePlan`, let the backend validate and commit only allowed state changes, and give the storyteller only the player-perceivable committed packet for final prose.
**Requirements**: P70-R1, P70-R2, P70-R3, P70-R4, P70-R5, P70-R6, P70-R7, P70-R8
**Depends on:** Phase 69
**Plans:** 9/9 plans complete - **COMPLETE 2026-04-25**

Plans:
- [x] 70-01-PLAN.md — Wave 0 contracts and tests for SceneFrame, ScenePlan, validation, execution, NarratorPacket, and ordering.
- [x] 70-02-PLAN.md — Deterministic SceneFrame builder from existing scene, presence, target, movement, Oracle context, and tool seams.
- [x] 70-03-PLAN.md — Strict ScenePlan schema and judge-lane safeGenerateObject repair path while keeping Oracle separate.
- [x] 70-04-PLAN.md — ScenePlan validator and deterministic executor through existing runtime tool schemas/executor.
- [x] 70-05-PLAN.md — NarratorPacket and final prompt contract for player-perceivable committed facts only.
- [x] 70-06-PLAN.md — Turn processor migration to SceneFrame -> Oracle -> ScenePlan -> validate -> execute -> packet -> final prose.
- [x] 70-07-PLAN.md — Chat route cutover removing present-NPC mini-rounds from action/retry critical path while preserving rollback.
- [x] 70-08-PLAN.md — Regression matrix, validation evidence, and engine-vs-LLM boundary documentation.

### Phase 71: Repair worldgen research authority boundary so LLM owns premise interpretation and backend only stores raw premise, source plan, search results, and approved/generated research artifacts

**Goal:** Remove backend-owned semantic canon decisions from worldgen research. User premise interpretation, source selection intent, and primary-vs-overlay meaning must be authored by LLM research/planning output; backend code only stores raw premise, validates artifact shape, executes searches/tool calls, persists cited research artifacts, and passes approved/generated context forward without reclassifying it as deterministic truth.
**Requirements**: P71-R1, P71-R2, P71-R3, P71-R4, P71-R5
**Depends on:** Phase 70
**Plans:** 9/9 plans complete - COMPLETE 2026-04-26

Plans:
- [x] 71-01-PLAN.md - Define the v2 research artifact contract, schema, formatter, and Wave 0 artifact tests.
- [x] 71-02-PLAN.md - Add compatibility-safe campaign persistence for v2 research artifacts.
- [x] 71-03-PLAN.md - Replace backend-owned franchise detection authority with LLM-authored research artifacts.
- [x] 71-04-PLAN.md - Wire suggest/generate/regenerate routes to persist and pass v2 artifacts.
- [x] 71-05-PLAN.md - Rewire seed and premise prompts to artifact source usage rules.
- [x] 71-06-PLAN.md - Rewire locations, factions, and NPC scaffold prompts to artifact source usage rules.
- [x] 71-07-PLAN.md - Complete artifact use in scaffold orchestration, regeneration, lore, and sufficiency enrichment.
- [x] 71-08-PLAN.md - Run full verification, GitNexus scope proof, and closeout evidence.
- [x] 71-09-PLAN.md - Close verifier-found route handoff gaps so artifact-backed generate/regenerate/save-edits/suggest-seed flows do not mix with legacy research lanes.

### Phase 72: Worldgen authority propagation regression audit

**Goal:** Audit the post-Phase 71 worldgen research artifact authority boundary end to end and add focused regression coverage so artifact-backed canon/source-role decisions cannot silently fall back to legacy backend-owned interpretation, lenient schema crashes, or original-character power scaling.
**Requirements**: P72-R1, P72-R2, P72-R3, P72-R4, P72-R5, P72-R6, P72-R7
**Depends on:** Phase 71
**Plans:** 5/5 plans complete - COMPLETE 2026-04-26

Plans:
- [x] 72-01-PLAN.md - Build authority inventory and shared mixed-premise artifact fixtures.
- [x] 72-02-PLAN.md - Harden provider/schema payload boundaries and `/generate` nullable artifact semantics.
- [x] 72-03-PLAN.md - Lock scaffold prompt lane isolation and NPC canonical power dispatch.
- [x] 72-04-PLAN.md - Preserve artifact authority through frontend transport, review payloads, and generic ingestion adjacency decisions.
- [x] 72-05-PLAN.md - Close with verification matrix, negative scans, and GitNexus scope proof.

### Phase 73: Structured output stability and provider conformance

**Goal:** Make WorldForge structured-output calls stable by moving shared object generation to provider-native schema/tool mechanisms where available, keeping deterministic backend validation as final authority, and adding provider conformance gates so long-running worldgen/action flows do not discover model/schema incompatibility after user-visible minutes.
**Requirements**: P73-R1, P73-R2, P73-R3, P73-R4, P73-R5, P73-R6, P73-R7
**Depends on:** Phase 72
**Plans:** 5/5 plans complete - COMPLETE 2026-04-28

Plans:
- [x] 73-01-PLAN.md - Inventory and provider/model capability foundation.
- [x] 73-02-PLAN.md - Native-first `safeGenerateObject` with explicit fallback and strategy traces.
- [x] 73-03-PLAN.md - Semantic ScenePlan contract mapped into strict backend authority.
- [x] 73-04-PLAN.md - Non-mutating provider conformance harness and env-gated live script.
- [x] 73-05-PLAN.md - Worldgen regressions, final verification matrix, and closeout summary.

### Phase 74: Structured prompt contracts and model-facing schema hardening across all structured outputs

**Goal:** Audit every structured-output model call and make the model-facing prompt contract explicit enough that models are asked for the exact schema/tool shape before repair, while backend validation remains the final deterministic authority.
**Requirements**: P74-R1, P74-R2, P74-R3, P74-R4, P74-R5, P74-R6
**Depends on:** Phase 73
**Plans:** 15/15 plans complete
**Verification note:** Local deterministic gates are complete. Active OpenCode role-model conformance is release-blocking; see `74-VERIFICATION-MATRIX.md`.

Plans:
- [x] 74-01 — Prompt-contract audit and static coverage
- [x] 74-02 — ScenePlanner and hidden adjudication nested tool contracts
- [x] 74-03 — Remaining P0 gameplay classifier contracts
- [x] 74-04 — Worldgen research artifact and generatedContext contracts
- [x] 74-05 — Character, NPC, power, and ingestion prompt contracts
- [x] 74-06 — Worldbook, import, and script seam contracts
- [x] 74-07 — Core worldgen scaffold and regeneration contracts
- [x] 74-08 — Auxiliary worldgen P1 source coverage contracts
- [x] 74-09 — NPC offscreen and context-compression contracts
- [x] 74-10 — Repair policy and real failure fixture corpus
- [x] 74-11 — Prompt-contract conformance and final verification matrix
- [x] 74-12 — Runtime tool contract example filtering
- [x] 74-13 — Strict power-stat rank parsing
- [x] 74-14 — NPC offscreen schema caps and dynamic update count
- [x] 74-15 — Verification matrix and requirement reconciliation

### Phase 75: Location-Presence Reality Closure

**Goal:** Close the deterministic generated-world location/presence gap: dense worlds must create/use scoped sublocations and distribute NPC presence instead of collapsing everyone into one macro location.
**Requirements**: P75-R1, P75-R2, P75-R3, P75-R4, P75-R5, P75-R6, P75-R7, P75-R8
**Depends on:** Phase 74
**Plans:** 7/7 plans complete - COMPLETE 2026-04-30
**Verification note:** Deterministic dense-location chain is verified end to end; active provider structured-output conformance remains a separate release-blocking gate from Phase 74. Phase 76 owns the broader historical promise audit correction.

Plans:
- [x] 75-01-PLAN.md - Promise audit validation contract and dense regression fixture
- [x] 75-02-PLAN.md - Scaffold hierarchy type contract, save-edits normalization, and World Review round-trip preservation
- [x] 75-03-PLAN.md - Location and NPC prompt contracts for hierarchy and scene placement
- [x] 75-04-PLAN.md - Deterministic scaffold persistence bridge for sublocations and NPC scope
- [x] 75-05-PLAN.md - Player start placement and `/world.currentScene` scoped API proof
- [x] 75-06-PLAN.md - SceneFrame and prompt assembler scoped runtime proof
- [x] 75-07-PLAN.md - Frontend People Here proof and final Phase 76/gap closeout

### Phase 76: Exhaustive historical phase promise audit and de-jure/de-facto gap closure

**Goal:** Complete the corrective audit across archived v1.0 through Phase 75 for de jure/de facto drift, TODOs, cut corners, quick wins, unwired promises, stale claims, superseded claims, and explicit follow-up/gap candidates. Each expected phase key must have an evidence-backed row before the audit can close.
**Requirements**: P76-R1, P76-R2, P76-R3, P76-R4, P76-R5, P76-R6
**Depends on:** Phase 75
**Plans:** 6/6 plans complete

Plans:
- [x] 76-01-PLAN.md - Corpus inventory, audit schema, and validator
- [x] 76-02-PLAN.md - v1.0 and archived legacy phase audit slice
- [x] 76-03-PLAN.md - v1.1 phases 37-55 audit slice
- [x] 76-04-PLAN.md - v1.1 phases 56-69 audit slice
- [x] 76-05-PLAN.md - Recent phases 70 through 75 and prior-phase correction slice
- [x] 76-06-PLAN.md - Final audit synthesis, gap ledger, validation, and planning truth reconciliation

### Phase 77: Scene-first VN/RPG play surface and weekend playable UX slice

**Goal:** Turn `/game` from a debug-heavy document/three-column panel surface into a weekend-playable scene-first solo RPG/VN shell: visible place first, staged latest beat second, player input third, with `Next`/`Auto`/`Log` cadence, first-class `Continue`, actor presence, drawers/widgets for map/inventory/journal/inspect, and acceptance gates that prove a 10-turn session feels like play rather than administration. Use `.planning/research/worldforge-screen-flow-contract.md`, `.planning/research/worldforge-visual-target-contract.md`, `.planning/research/worldforge-design-agent-brief.md`, and `.planning/research/worldforge-design-lab-results.md` as the design baseline. Opus screen-flow topology is useful; its warm paper visual palette is not the target.
**Requirements**: P77-R1, P77-R2, P77-R3, P77-R4, P77-R5, P77-R6, P77-R7, P77-R8
**Depends on:** Phase 76
**Plans:** 6/6 plans complete - COMPLETE 2026-05-03

Plans:
- [x] 77-01-PLAN.md - Foundation contracts, DisplayBeat adapter, and campaign draft persistence tests.
- [x] 77-02-PLAN.md - Scene shell, dark backdrop/HUD, and local NarrationDock cadence controls.
- [x] 77-03-PLAN.md - First `/game` vertical slice with ActionDock, Continue Scene, and draft wiring.
- [x] 77-04-PLAN.md - Widget rail and drawer migration for Log, World, Inventory, Journal, Character, Inspect, and Saves.
- [x] 77-05-PLAN.md - Honest actor presence bands plus fiction-facing mechanic beats and Inspect containment.
- [x] 77-06-PLAN.md - Responsive/mobile hardening, screenshot QA, and deterministic or live 10-turn playtest gate.

### Phase 78: GM-first turn orchestration and Oracle-on-demand

**Goal:** Replace backend semantic pre-interpretation of `/action` turns with a GM-first orchestration loop: backend supplies neutral state, evidence, rulebook constraints, candidate IDs/names, and legal tool affordances; the GM/Judge interprets raw player text and chooses direct resolution, roll/Oracle, tool call, combat transition, clarification, or Continue; backend remains deterministic rulebook/world-truth validator for all persisted state and legal transitions.
**Requirements**: P78-R1, P78-R2, P78-R3, P78-R4, P78-R5, P78-R6, P78-R7
**Depends on:** Phase 77
**Plans:** 6/6 plans complete - COMPLETE 2026-05-03

Plans:
- [x] 78-01-PLAN.md - Structured-output inventory and GM decision contract baseline.
- [x] 78-02-PLAN.md - Neutral SceneFrame packet and backend pre-interpretation removal.
- [x] 78-03-PLAN.md - GM/Judge decision seam for direct, roll, tool, combat, clarification, and continue turns.
- [x] 78-04-PLAN.md - Chat route and turn-processor orchestration through GM-first decisions.
- [x] 78-05-PLAN.md - Concrete tool/combat validation and deterministic backend execution.
- [x] 78-06-PLAN.md - /game compatibility, no-stale mechanics, and full-suite phase gate.

### Phase 79: GM epistemic context and tool grounding

**Goal:** Fix the GM data-flow boundary so local turns are planned from the same information a human GM should use: current scene truth, player-known facts, explicit local candidates, and rulebook affordances, while offscreen/background simulation remains separated until surfaced. Runtime tools must be grounded in backend-approved refs/candidates instead of free-text world names, and the Forest Outpost-style wrong-location spawn must become impossible through both prompt/context design and deterministic validation.
**Requirements**: P79-R1, P79-R2, P79-R3, P79-R4, P79-R5, P79-R6
**Depends on:** Phase 78
**Plans:** 4/4 plans complete - COMPLETE 2026-05-03

Plans:
- [x] 79-01-PLAN.md - Model-facing scene packet and prompt leak harness.
- [x] 79-02-PLAN.md - Tool grounding context and remote spawn rejection.
- [x] 79-03-PLAN.md - Durable event discipline and narrator consequence isolation.
- [x] 79-04-PLAN.md - End-to-end turn guardrails and observability.

### Phase 80: Forecast-led GM beat planning

**Goal:** Add an explicit GM planning layer before tools and narration: maintain a bounded world forecast for where NPCs/factions/threads are likely to move if the player does not intervene, derive a per-turn beat plan from the local scene plus forecast, execute only approved state changes through backend tools, and give the storyteller a settled player-facing beat packet. The LLM should behave like a GM with an agenda, uncertainty, and rulebook constraints instead of producing disconnected structured blocks.
**Requirements**: P80-R1, P80-R2, P80-R3, P80-R4, P80-R5, P80-R6
**Depends on:** Phase 79
**Plans:** 6/6 plans complete - COMPLETE 2026-05-03

Plans:
- [x] 80-01-PLAN.md - Forecast contract and advisory storage.
- [x] 80-02-PLAN.md - Forecast refresh, scope metadata, and invalidation.
- [x] 80-03-PLAN.md - Scoped forecast excerpts for GM prompts.
- [x] 80-04-PLAN.md - GM BeatPlan contract and generation.
- [x] 80-05-PLAN.md - Turn processor and ScenePlan integration.
- [x] 80-06-PLAN.md - Narrator packet, rollback, and phase verification.

### Phase 81: GM turn orchestration loop and settled tool execution

**Goal:** Replace the fragmented GM turn runtime with a justified, inspectable orchestration loop: build one compact GM Read from scene state and scoped forecast, skip action planning for direct/continue/clarification turns, create a bounded GM Action Checklist only for mutating/combat turns, execute each needed mutation through small backend-validated tool steps, and narrate only from settled post-execution truth. This phase corrects Phase 80's over-broad BeatPlan direction without turning the GM into one giant all-in-one JSON schema.
**Requirements**: P81-R1, P81-R2, P81-R3, P81-R4, P81-R5, P81-R6, P81-R7, P81-R8
**Depends on:** Phase 80
**Plans:** 7/7 plans complete - COMPLETE 2026-05-04

Plans:
- [x] 81-00-PLAN.md - Baseline preflight and cross-AI review incorporation. COMPLETE 2026-05-03
- [x] 81-01-PLAN.md - GM Read contract and player-turn world-brain/decision consolidation. COMPLETE 2026-05-03
- [x] 81-02-PLAN.md - Turn path gating for direct, continue, and clarification. COMPLETE 2026-05-03
- [x] 81-03-PLAN.md - GM Action Checklist contract for mutating/combat turns. COMPLETE 2026-05-03
- [x] 81-04-PLAN.md - Validated tool-step execution with done/skipped/revised statuses. COMPLETE 2026-05-04
- [x] 81-05-PLAN.md - Settled narrator packet and narration handoff. COMPLETE 2026-05-04
- [x] 81-06-PLAN.md - Integration verification and fresh-campaign live playability. COMPLETE 2026-05-04

### Phase 82: GM dynamic scene expansion and agentic tool harness

**Goal:** Make the GM confident at using dynamic local scene tools when fiction calls for them: create anchored ephemeral sublocations under broad or persistent locations, spawn support/temporary NPCs into the correct broad/current-scene scope, retire or promote ephemeral scenes/support NPCs intentionally, and run these mutations through a small sequential tool harness with structured observations, concrete per-turn repeat-call protection, semantic budgets, and player-facing progress events. This phase must not become another monolithic planning schema; the model remains the GM, backend remains the rulebook/world truth, and every state change goes through validated tools.
**Requirements**: P82-R1, P82-R2, P82-R3, P82-R4, P82-R5, P82-R6, P82-R7, P82-R8
**Depends on:** Phase 81
**Plans:** 0/5 plans complete - PLANNED 2026-05-05

Plans:
- [x] 82-01-PLAN.md - Baseline regressions, tool affordance contract, and review incorporation. COMPLETE 2026-05-05
- [x] 82-02-PLAN.md - Anchored ephemeral sublocation lifecycle and scene-scope evidence. COMPLETE 2026-05-05
- [x] 82-03-PLAN.md - Support NPC spawn, retirement, promotion, and broad/current-scene correctness. COMPLETE 2026-05-05
- [x] 82-04-PLAN.md - Agentic GM tool harness observations, metadata, budgets, and progress events. COMPLETE 2026-05-05
- [x] 82-05-PLAN.md - Integrated live play gate with dynamic scenes, support NPCs, cleanup, and no-spam proof. COMPLETE 2026-05-05

### Phase 83: WorldForge V4 full visual migration

**Goal:** Migrate the real frontend to the approved `docs/WorldForge-v4` visual direction across product shell, creation/review/settings/library flows, and `/game` without treating the prototype as fake product truth. This phase is full visual transfer, not a minimal copy: real routes must carry the V4 design system, layout rhythm, stage/dock language, drawers, responsive behavior, and screenshot QA while preserving current backend-backed behavior and removing prototype-only controls that fail the reality audit.
**Requirements**: P83-R1, P83-R2, P83-R3, P83-R4, P83-R5, P83-R6, P83-R7, P83-R8
**Depends on:** Phase 82
**Plans:** 5/5 plans complete - VERIFIED 2026-05-05

Plans:
- [x] 83-01-PLAN.md - V4 tokens, shell, and navigation. COMPLETE 2026-05-05
- [x] 83-02-PLAN.md - Launcher and real product surfaces. COMPLETE 2026-05-05
- [x] 83-03-PLAN.md - Creation, DNA, library, settings, review. COMPLETE 2026-05-05
- [x] 83-04-PLAN.md - Game stage, dock, and drawers. COMPLETE 2026-05-05
- [x] 83-05-PLAN.md - Responsive UX/UI verification. COMPLETE 2026-05-05

### Phase 84: RP prompt architecture and model-facing GM/storyteller optimization

**Goal:** Rebuild WorldForge's gameplay prompt architecture as a playable RP/GM contract, not just a structured-output contract. The phase must research current WorldForge prompt surfaces, active SillyTavern-style RP presets from `X:\Models\templates`, Marinara/RP/VN prompt references, and cross-AI reviewer advice; then turn that evidence into compact model-facing prompts that tell each model exactly what job it has: GM scene interpretation, optional sequential tool use, world-state respect, character performance, and final narration from settled truth. This must preserve the WorldForge boundary where the LLM is the GM/storyteller and the backend is the rulebook/world-truth authority, while avoiding one giant prompt, inactive-preset cargo culting, and schema bureaucracy on non-executable writing tasks.
**Requirements**: P84-R1, P84-R2, P84-R3, P84-R4, P84-R5, P84-R6, P84-R7, P84-R8, P84-R9, P84-R10
**Depends on:** Phase 82
**Plans:** 3/3 plans complete - VERIFIED 2026-05-05

Plans:
- [x] 84-01-PLAN.md - Prompt surface inventory and RP corpus. COMPLETE 2026-05-05
- [x] 84-02-PLAN.md - Compact role-specific prompt contracts. COMPLETE 2026-05-05
- [x] 84-03-PLAN.md - RP quality gates and branchy playtests. COMPLETE 2026-05-05

### Phase 85: Narrator prose quality and anti-slop style contract

**Goal:** Add a compact final-Narrator prose contract that teaches good scene writing instead of only banning bad phrasing. The narrator should convert settled backend truth into readable RPG/VN prose with concrete local action, actor-performable detail, mundane-specific beats, NPC voice, and player agency, while avoiding AI-slop patterns like recap, announcement openers, generic tension, binary contrast, exposition kiosks, and decorative intensity. Scope is final visible narration only; GM Read, forecast, and runtime tool loops must not inherit prose bloat.
**Requirements**: P85-R1, P85-R2, P85-R3, P85-R4, P85-R5
**Depends on:** Phase 84
**Plans:** 1/1 plans complete - VERIFIED 2026-05-06

Plans:
- [x] 85-01-PLAN.md - Research-backed final Narrator prose contract and deterministic prompt quality tests. COMPLETE 2026-05-06

### Phase 86: Exhaustive live playtest matrix and findings ledger

**Goal:** Run an evidence-backed overnight playtest campaign matrix against the post-81 through post-85 GM/tool/prose/runtime stack using the active MIMO Pro 2.5 role models. The phase must cover four distinct campaign settings, five route types per campaign, and about twenty player turns per route where feasible. It must capture GM Read/tool-loop behavior, narrator prose quality, world mutation, living-world pressure, location graph coherence, combat/power-level handling, and V4 UI/effects evidence. The output is not a vague vibe report: it is a per-turn artifact corpus plus a severity-ranked findings ledger that Phase 87 can burn down.
**Requirements**: P86-R1, P86-R2, P86-R3, P86-R4, P86-R5, P86-R6, P86-R7, P86-R8
**Depends on:** Phase 85
**Plans:** 1/5 plans complete - IN PROGRESS 2026-05-06

Plans:
- [x] 86-01-PLAN.md - Playtest harness, manifest, preflight, and evidence schema. COMPLETE 2026-05-06
- [ ] 86-02-PLAN.md - Four-campaign matrix, source/character selection, and baseline checkpoints.
- [ ] 86-03-PLAN.md - Route execution matrix: five routes per campaign, about twenty turns per route, and branch restore discipline.
- [ ] 86-04-PLAN.md - Findings ledger, severity triage, gameplay-feel scoring, and Phase 87 handoff.
- [ ] 86-05-PLAN.md - Overnight run closeout, artifact validation, and no-fake-coverage audit.

### Phase 87: Playtest defect burn-down and final rerun

**Goal:** Fix the concrete issues discovered by Phase 86 without disabling mechanics, hiding tools, or replacing broken gameplay with fallbacks. Each accepted finding needs an owner, a root-cause fix, regression evidence, and a rerun result. The phase closes only after P0/P1 findings are burned down, P2 findings are either fixed or explicitly deferred with rationale, and a final multi-route rerun proves the game remains playable across prompts, tools, prose, UI effects, combat, movement, and living-world mutation.
**Requirements**: P87-R1, P87-R2, P87-R3, P87-R4, P87-R5, P87-R6
**Depends on:** Phase 86
**Plans:** 5/6 plans complete - IN PROGRESS FROM CURRENT 86-FINDINGS

Plans:
- [x] 87-01-PLAN.md - Accepted findings ledger and focused rerun controls. COMPLETE 2026-05-07
- [x] 87-02-PLAN.md - Empty assistant-text burn-down across backend finalization and frontend SSE parsing. COMPLETE 2026-05-07
- [x] 87-03-PLAN.md - State-bearing tool truth for mutation-heavy scene pressure. COMPLETE 2026-05-07
- [x] 87-04-PLAN.md - SceneFrame recovery and recent-context referent handling. COMPLETE 2026-05-07
- [x] 87-05-PLAN.md - Combat route adjudication and deterministic session language contract. COMPLETE 2026-05-07
- [ ] 87-06-PLAN.md - `/game` overflow fix, final rerun, and verification reconciliation.

### Phase 88: Living-world authority spine and key NPC co-player process simulation

**Goal:** Implement the full living-world architecture described in `docs/WorldForge_Key_NPC_AI_players_latency_memory_budget_full_report_v3.md`: key NPCs must act like co-player processes with private POV, goals, plans, wakeups, memory, interrupts, validated actor tools, and causal agency over world-time. This is not an MVP and not a polling-every-NPC shortcut. The phase must restore a truthful authoritative turn boundary, split hidden truth from player-facing narration, move offscreen/world work onto versioned simulation jobs/proposals, make factions act through command/report/resource networks, and prove the result through deterministic tests plus long-form live playtests where tourist, key-NPC, faction, false-claim, combat, rollback, and memory-stress routes demonstrate a living world.
**Requirements**: P88-R1, P88-R2, P88-R3, P88-R4, P88-R5, P88-R6, P88-R7, P88-R8, P88-R9, P88-R10, P88-R11, P88-R12
**Depends on:** Phase 87
**Plans:** 11/11 plans complete - VERIFIED 2026-05-09
**Verification:** `.planning/phases/88-living-world-authority-spine-and-key-npc-co-player-process-simulation/88-VERIFICATION.md` and `88-VERIFICATION-MATRIX.md` passed. Final clone-pool live gate passed 8 routes / 14 turns / 0 hard failures with no output clipping or turn rollback events.

Execution order: `88-EXECUTION-WAVES.md`

Plans:
- [x] 88-01-PLAN.md - Authority spine data model.
- [x] 88-02-PLAN.md - POV and redaction contracts.
- [x] 88-03-PLAN.md - Versioned queue, proposals, and truthful turn boundary.
- [x] 88-04-PLAN.md - KeyActorProcess scheduler and wakeups.
- [x] 88-05-PLAN.md - ActorDecisionPacket and actor tool validation.
- [x] 88-06-PLAN.md - World-time plan executor and offscreen catch-up.
- [x] 88-07-PLAN.md - Memory, beliefs, and knowledge propagation.
- [x] 88-08-PLAN.md - Faction command networks.
- [x] 88-09-PLAN.md - World threads and diegetic surfacing.
- [x] 88-10-PLAN.md - Latency, context-budget, and parallel execution observability.
- [x] 88-11-PLAN.md - Rollback, checkpoint, and living-world verification gate.

### Phase 89: Runtime turn resilience and narrator repair boundary

**Goal:** Repair the player-turn runtime boundary so paid GM/Oracle/tool resolution survives prose-layer failures. The phase must introduce an explicit TurnSaga lifecycle with `resolved_pending_narration`, persist Oracle decisions and settled turn packets independently from final prose, split deterministic backend rejection from narrator grounding/quality repair, and prove that narrator failure or unsupported prose pressure regenerates narration instead of rolling back valid world resolution. Full rollback is reserved for state corruption, stale version conflicts, and failed atomic mutation boundaries.
**Requirements**: P89-R1, P89-R2, P89-R3, P89-R4, P89-R5, P89-R6, P89-R7, P89-R8, P89-R9, P89-R10
**Depends on:** Phase 88
**Plans:** 5/5 plans complete - VERIFIED 2026-05-10
**Status note:** Phase 89 is verified complete. Focused route/runtime regressions passed, the deterministic runtime-resilience harness passed, and the live local `/api/chat/action` harness completed with HTTP 200 plus `event: done`.

Plans:
- [x] 89-01-PLAN.md - TurnSaga artifact foundation.
- [x] 89-02-PLAN.md - Grounding guard and narrator repair contract.
- [x] 89-03-PLAN.md - Turn processor saga integration.
- [x] 89-04-PLAN.md - Route rollback boundary and pending-turn resume.
- [x] 89-05-PLAN.md - Regression harness and phase verification.

### Phase 90: Playable GM bridge tools for fuzzy player intent

**Goal:** Stop making the GM behave like a parser. The phase must give the GM small agent-style bridge tools and prompt policy for mapping understandable fuzzy player intent into legal backend candidates/actions: visible affordances, navigation, actors, objects, POIs, route checks, constrained minor POIs, scene extras, searches, and recorded intent. Low-risk playable actions should advance through backend-approved candidates; clarification is reserved for materially different risk/cost, irreversible high-impact choices, or truly contradictory intent.
**Requirements**: P90-R1, P90-R2, P90-R3, P90-R4, P90-R5, P90-R6, P90-R7
**Depends on:** Phase 89
**Plans:** 4/4 plans complete

Plans:
- [x] 90-01-PLAN.md - Observation-only bridge candidate tools.
- [x] 90-02-PLAN.md - Constrained state-bearing bridge tools.
- [x] 90-03-PLAN.md - GM fuzzy intent policy and clarification repair.
- [x] 90-04-PLAN.md - Tourist/courier route acceptance gate.

### Phase 91: Living world proposal commit and surface signal pipeline

**Goal:** Make background simulation produce committed living-world consequences instead of accumulating interesting but inert proposals. The phase must give simulation proposals terminal states, preconditions/read-set/write-scope, commit/rebase/retry/expiry policy, backend tool execution, stale-version handling, surface-signal decisions, and metrics proving proposals become committed events/facts/thread updates/location modifiers or explicit terminal states before they are visible as truth.
**Requirements**: P91-R1, P91-R2, P91-R3, P91-R4, P91-R5, P91-R6, P91-R7, P91-R8, P91-R9
**Depends on:** Phase 90
**Plans:** 5/5 plans complete - VERIFIED 2026-05-10

Plans:
- [x] 91-01-PLAN.md - Proposal lifecycle and preflight contract.
- [x] 91-02-PLAN.md - Proposal-to-tool commit executor.
- [x] 91-03-PLAN.md - Surface signal requirement.
- [x] 91-04-PLAN.md - Packet firewall and living-world metrics.
- [x] 91-05-PLAN.md - Ignored world-time acceptance gate.

### Phase 92: Key actor and faction scheduling repair

**Goal:** Make key NPCs, persistent actors, and factions advance on truthful schedules without polling every entity every turn. The phase must implement critical-path actor selection, wake signals, due plan steps, agency debt, just-in-time catch-up before exposure, command/report/resource faction paths, and standing orders so offscreen actors can act from private POV and later leave discoverable consequences without freezing the world or exploding latency.
**Requirements**: P92-R1, P92-R2, P92-R3, P92-R4, P92-R5, P92-R6, P92-R7, P92-R8
**Depends on:** Phase 91
**Plans:** 0/5 plans complete - PLANNED 2026-05-09

Plans:
- [ ] 92-01-PLAN.md - Critical-path actor wake index.
- [ ] 92-02-PLAN.md - Key NPC due plan steps and consequences.
- [ ] 92-03-PLAN.md - JIT actor exposure catchup and private POV.
- [ ] 92-04-PLAN.md - Faction command node scheduler and agent.
- [ ] 92-05-PLAN.md - Cross-system acceptance proof.

### Phase 93: Latency and context budget instrumentation

**Goal:** Make turn latency and model context spend inspectable and controllable through scheduling, budgets, and evidence-linked frames, not arbitrary duration caps or output truncation. The phase must add per-stage timing, L0-L4 critical-path classification, safe parallel retrieval/proposal groups, honest UI stage messages, explicit SceneFrame/OracleFrame/ActorFrame/FactionCommandFrame/NarratorPacket/ReviewerPacket budgets, source-linked summaries, visibility-gated retrieval, overflow warnings, and narrator redaction audits.
**Requirements**: P93-R1, P93-R2, P93-R3, P93-R4, P93-R5, P93-R6, P93-R7, P93-R8
**Depends on:** Phase 92
**Plans:** 0/6 plans complete - PLANNED 2026-05-09

Plans:
- [ ] 93-01-PLAN.md - Critical-path latency trace contract.
- [ ] 93-02-PLAN.md - Safe parallel frame retrieval and actor proposal prep.
- [ ] 93-03-PLAN.md - Shared frame budgets and retrieval overflow warnings.
- [ ] 93-06-PLAN.md - Oracle and reviewer budget guard coverage.
- [ ] 93-04-PLAN.md - Narrator packet budget and redaction audit.
- [ ] 93-05-PLAN.md - Honest UI stage messages and final instrumentation gate.

### Phase 94: Focused living world playtest and runtime acceptance gate

**Goal:** Prove the repaired runtime as an actual playable living-world text RPG. The phase must run focused deterministic, trace-based, Playwright, and human/LLM review gates across tourist/fuzzy navigation, JJK-style uncertain action, false claims, proposal backlog, key-NPC/faction consequences, combat/power, hidden-truth/privacy, narrator repair, prose quality, and long-turn behavior. It should reuse fresh clone pools where gameplay is under test, allow long model turns without duration caps, and treat soft prose/playfeel review as LLM/human judgment rather than code-heuristic overclaiming.
**Requirements**: P94-R1, P94-R2, P94-R3, P94-R4, P94-R5, P94-R6, P94-R7
**Depends on:** Phase 93
**Plans:** 0/5 plans complete - PLANNED 2026-05-09

Plans:
- [ ] 94-01-PLAN.md - Deterministic runtime acceptance invariants.
- [ ] 94-02-PLAN.md - Route manifest and clone pool harness.
- [ ] 94-03-PLAN.md - Live route runner and trace assertions.
- [ ] 94-04-PLAN.md - Fail-closed acceptance report and full matrix gate.
- [ ] 94-05-PLAN.md - Soft review and final acceptance package.
