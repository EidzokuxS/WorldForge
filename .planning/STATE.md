---
gsd_state_version: 1.0
milestone: v1.1
milestone_name: Gameplay Fidelity
status: verifying
stopped_at: Completed 48-03-PLAN.md
last_updated: "2026-04-12T17:26:39.596Z"
last_activity: 2026-04-12
progress:
  total_phases: 14
  completed_phases: 12
  total_plans: 38
  completed_plans: 38
  percent: 100
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-12)

**Core value:** The LLM is the narrator, never the engine. Mechanical truth stays in backend code so outcomes remain consistent, inspectable, and recoverable.
**Current focus:** Phase 48 — character-identity-fidelity-and-canonical-modeling

## Current Position

Phase: 48 (character-identity-fidelity-and-canonical-modeling) — EXECUTING
Plan: 4 of 4
Status: Phase complete — ready for verification
Last activity: 2026-04-12

Progress: [██████████] 100%

## Performance Metrics

| Plan | Duration | Tasks | Files |
| --- | --- | --- | --- |

| Phase 47 P01 | 2 min | 2 tasks | 6 files |

**Current Snapshot:**

- Active roadmap phases: 14
- Completed phases: 46
- Planned or in-progress phases: 4
- Total plans tracked: 31
- Completed plans: 31
- Pending plans: phases `49-50` still await plan breakdown; Phase `48` now has executable plans

**Recent Execution:**

- Phase `46` Plan `04` — duration `9 min`, tasks `1`, files `9`
- Phase `46` Plan `03` — duration `12 min`, tasks `2`, files `10`
- Phase `46` Plan `02` — duration `15 min`, tasks `2`, files `16`
- Phase `46` Plan `01` — duration `6 min`, tasks `2`, files `7`
- Phase `45` Plan `03` — duration `8 min`, tasks `1`, files `5`
- Phase `45` Plan `02` — duration `5 min`, tasks `2`, files `10`
- Phase `38` Plan `03` — duration `8 min`, tasks `2`, files `9`
- Phase `38` Plan `02` — duration `7 min`, tasks `3`, files `13`
- Phase `44` Plan `02` — duration `5 min`, tasks `2`, files `1`
- Phase `44` Plan `01` — duration `8 min`, tasks `2`, files `4`
- Phase `43` Plan `06` — duration `4 min`, tasks `2`, files `6`
- Phase `43` Plan `04` — duration `6 min`, tasks `2`, files `5`
- Phase `43` Plan `03` — duration `10 min`, tasks `2`, files `16`
- Phase `43` Plan `02` — duration `13 min`, tasks `2`, files `11`
- Phase `43` Plan `01` — duration `9 min`, tasks `2`, files `14`
- Phase `40` Plan `03` — duration `4 min`, tasks `2`, files `6`
- Phase `40` Plan `02` — duration `4 min`, tasks `2`, files `4`
- Phase `40` Plan `01` — duration `6 min`, tasks `2`, files `9`
- Phase `39` Plan `03` — duration `10 min`, tasks `2`, files `2`
- Phase `39` Plan `02` — duration `6 min`, tasks `2`, files `6`
- Phase `39` Plan `01` — duration `5 min`, tasks `2`, files `7`

| Phase 47 P02 | 7 | 2 tasks | 4 files |
| Phase 47 P03 | 8 | 2 tasks | 4 files |
| Phase 48 P01 | 8 min | 2 tasks | 8 files |
| Phase 48 P02 | 18 min | 3 tasks | 13 files |
| Phase 48-character-identity-fidelity-and-canonical-modeling P04 | 8 min | 2 tasks | 8 files |
| Phase 48-character-identity-fidelity-and-canonical-modeling P03 | 10 min | 2 tasks | 10 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- v1.1 is reconciliation-driven from Phase 36 and does not reopen archived v1.0 scope.
- Integrity repair stays ahead of new mechanics or generic polish.
- Session-decoupled transport, authoritative inventory, honest turn boundaries, live reflection, and checkpoint-complete restore are the v1.1 critical path.
- Travel-time and per-location recent-happenings claims must end as real runtime behavior or explicit deprecations.
- Gameplay docs must become the trusted planning baseline again after runtime repair.
- [Phase 37]: GET /api/chat/history now requires ?campaignId=<id> and targeted gameplay POST routes require campaignId in JSON.
- [Phase 37]: Targeted gameplay routes resolve campaigns through requireLoadedCampaign() instead of relying on an already-active singleton session.
- [Phase 37]: Last-turn retry and undo snapshots are keyed by campaignId to prevent cross-campaign rollback leakage.
- [Phase 37]: Frontend gameplay helpers now require campaignId, including shared chatHistory/chatAction wrappers in frontend/lib/api.ts.
- [Phase 37]: The canonical /game page preserves active-first bootstrap with remembered fallback, but all targeted gameplay requests now send activeCampaign.id explicitly.
- [Phase 39]: A turn is only complete after rollback-critical post-turn world mutations finish; embeddings and image generation remain auxiliary.
- [Phase 39]: Retry and undo stay single-step in this phase, but must restore the same authoritative pre-turn boundary the player experienced.
- [Phase 39]: Rollback-critical post-turn failure must prevent a turn from being presented as successfully complete.
- [Phase 39]: The backend now emits finalizing_turn after narration and only emits done after rollback-critical post-turn simulation completes.
- [Phase 39]: Last-turn retry and undo now restore a single SQLite-safe bundle of state.db, config.json, and chat_history.json while explicitly excluding campaigns/{id}/vectors/.
- [Phase 39]: Failed retry restores the visible pre-turn boundary immediately from committed message history, then refreshes history and world data from the backend. — The UI needs a deterministic honest fallback even if optimistic retry state or refresh timing would otherwise leave stale completion affordances on screen.
- [Phase 39]: Quick actions stay buffered until authoritative done, which keeps retry/undo and follow-up actions aligned with the backend rollback boundary. — Showing or enabling quick actions before done would present narration completion as turn completion and let the UI get ahead of the rollback-safe boundary.
- [Phase 39]: The frontend now models gameplay readiness as idle, streaming, or finalizing so narration completion no longer implies turn completion. — This keeps retry/undo and input readiness aligned with the backend finalization contract instead of guessing from a single streaming flag.
- [Phase 39]: Retry SSE onError is captured and rethrown after parseTurnSSE resolves so /game can keep one rollback cleanup path.
- [Phase 39]: Retry failure cleanup clears buffered quick actions and stale optimistic retry UI before the page returns to idle.
- [Phase 40]: Reflection budget now accumulates directly on committed episodic-event writes through one campaign-scoped NPC-only seam.
- [Phase 40]: Present-NPC act still piggybacks through log_event, while speak and off-screen updates call the shared accumulator directly to avoid double-counting.
- [Phase 40]: Reflection prompts now explicitly treat beliefs, goals, and relationships as the default durable outcomes of ordinary play.
- [Phase 40]: Wealth and skill upgrades remain available, but only behind materially stronger evidence thresholds than ordinary interaction arcs.
- [Phase 40]: Reflection reads same-turn committed evidence directly instead of making embeddings rollback-critical.
- [Phase 40]: Every writer that already calls storeEpisodicEvent now joins one queued handoff that post-turn auxiliary embedding drains after reflection.
- [Phase 41]: Checkpoints and Phase 39 restore now share one authoritative bundle contract for `state.db`, `config.json`, and `chat_history.json`, with vectors included only for checkpoints.
- [Phase 41]: Restore-time campaign invalidation clears live-turn snapshots, active-turn guards, and same-turn committed evidence before reopening the restored branch.
- [Phase 42]: Parsed intent/method text now wins for player target resolution before any classifier fallback runs.
- [Phase 42]: Player Oracle target tags now derive from canonical character records or normalized stored entity tags depending on target type.
- [Phase 42]: Active opening effects now live through player state.statusFlags and deterministic re-derivation from canonical startConditions.
- [Phase 42]: Immediate situations are normalized once into a small bounded opening-effect set instead of free-form per-turn interpretation.
- [Phase 42]: Opening-state effects expire deterministically on first location change, explicit resolution, or a three-tick ceiling.
- [Phase 43]: Travel time remains part of the live product contract and should not be deprecated.
- [Phase 43]: Phase 43 must be planned as a minimal complete location-system repair, not as two isolated doc-gap patches.
- [Phase 43]: The intended location model distinguishes macro locations, persistent sublocations, and ephemeral scene locations with explicit lifetime semantics.
- [Phase 43]: Temporary scene locations may expire as nodes, but their consequences must persist into world state and memory.
- [Phase 43]: Phase 43 keeps locations.connectedTo as a read-only compatibility projection while location_edges becomes the authoritative travel graph.
- [Phase 43]: Phase 43 starts with failing backend regressions for multi-edge travel cost, connectedPaths payloads, and location-local recent happenings before implementation wiring.
- [Phase 43]: Successful player travel now calls advanceCampaignTick(totalCost) and skips the normal end-of-turn increment for that turn.
- [Phase 43]: Inline movement detection, storyteller move_to, and NPC move_to all resolve destination names through the same canonical location-graph seam before any pathing runs.
- [Phase 43]: reveal_location creates ephemeral scene nodes plus normalized bidirectional edge rows while keeping locations.connectedTo as a compatibility projection.
- [Phase 43]: Episodic commits remain the only source-traceable path into location-local history; storeEpisodicEvent writes through to SQLite projections instead of duplicating writer logic.
- [Phase 43]: Anchored spillover is resolved at write time so archived ephemeral scenes can disappear without forcing downstream readers to reconstruct local-history consequences.
- [Phase 43]: Faction and world simulation writers call the shared location-history seam directly only when they have concrete target locations and no episodic source event exists.
- [Phase 43]: World payload locations now expose connectedPaths and recentHappenings instead of raw connectedTo compatibility data.
- [Phase 43]: Prompt scene context reads current-location recent happenings from location-events.ts and bounds them to five events or the last 50 ticks.
- [Phase 43]: location-events.ts now owns both single-location and batched recent-history reads so API and prompt assembly share one read authority.
- [Phase 43]: Frontend location parsing now prefers connectedPaths-derived compatibility views over raw connectedTo adjacency strings.
- [Phase 43]: The location panel always renders Recent Happenings, including an explicit empty state when no local history exists.
- [Phase 43]: The `/game` page now filters self-target travel options in both connectedPaths and connectedTo branches so stale compatibility data cannot reintroduce current-location travel affordances.
- [Phase 43]: Current-location movement now short-circuits at the transport layer with a deterministic no-op acknowledgment instead of emitting location_change or flowing through Oracle/Storyteller arrival behavior.
- [Phase 38]: After campaign start, `items` becomes the only runtime source of truth for player and NPC inventory/equipment state. `characterRecord.loadout` remains creation provenance only.
- [Phase 38]: Equip-state must live on authoritative item rows, while legacy `equippedItems` survives only as transitional compatibility projection during migration/deprecation.
- [Phase 43]: Fresh scaffold adjacency now suppresses self-loop edges and self-target compatibility projections so fresh-runtime regressions stay distinct from legacy/manual self-travel paths.
- [Phase 44]: Concept docs now state product boundaries and defer detailed gameplay and runtime truth to mechanics.md and memory.md. — This prevents top-level docs from competing with the normative runtime baseline.
- [Phase 44]: The stack doc now documents gameplay transport as REST plus SSE rather than WebSocket gameplay truth. — frontend/lib/api.ts and /game already consume targeted REST routes with SSE parsing, so the technical reference had to match live transport.
- [Phase 44]: The legacy player-character-creation plan remains available only as historical context with an explicit superseded note. — Keeping the old plan discoverable is acceptable only if it no longer masquerades as current gameplay authority.
- [Phase 44]: docs/mechanics.md now treats canonical records as the gameplay authority and derived tags as shorthand or compatibility output.
- [Phase 44]: Reflection wording now deprecates the old threshold-15 claim in favor of the live threshold sum >= 10 and structured-state-first outcomes.
- [Phase 44]: Travel, location history, and world-information-flow are documented through connectedPaths, recent happenings, and bounded prompt context instead of omniscience claims.
- [Phase 44]: docs/memory.md now documents top-3 vector-only lore, top-5 episodic retrieval, caller-supplied importance, and checkpoint-complete bundle restore as the normative runtime baseline.
- [Phase 44]: Inventory/equipment wording stays explicitly bounded: live behavior uses SQLite item rows plus canonical records, while Phase 38 remains the pending authority seam.
- [Phase 44]: Phase 36 Group B/C proof lives in a phase-local checklist keyed to claim IDs instead of a narrative closeout.
- [Phase 38-authoritative-inventory-equipment-state]: Item rows now carry explicit equipState, equippedSlot, and isSignature fields as the minimum inventory authority contract.
- [Phase 38-authoritative-inventory-equipment-state]: loadCampaign() now reruns idempotent inventory backfill so direct load, checkpoint, retry, and undo reopen flows share one authority seam.
- [Phase 38-authoritative-inventory-equipment-state]: Legacy characterRecord.loadout and players.equippedItems remain compatibility projections only and are rewritten from authoritative item rows on reopen.
- [Phase 38]: transfer_item remains the single storyteller tool for pickup, drop, equip, and unequip semantics via optional equipState plus equippedSlot arguments
- [Phase 38]: prompt assembly and /world player inventory payloads now read authoritative carried, equipped, and signature views from loadAuthoritativeInventoryView()
- [Phase 38]: legacy equippedItems compatibility is retained only as a one-way projection derived from authoritative item rows
- [Phase 38]: Frontend /game now consumes player.inventory and player.equipment as the authoritative UI contract, while legacy equippedItems remains compatibility-only.
- [Phase 38]: The /api/campaigns/:id/world payload now emits structured authoritative player item rows because frontend-only parsing could not satisfy the authoritative inventory UI contract.
- [Milestone]: v1.1 remains open until baseline live gameplay feel is acceptable, even though the original reconciliation tranche (37-44) is complete.
- [Milestone]: Follow-on phases 45-50 own the remaining live gameplay gaps around scene authority, encounter scope, writing quality, character fidelity, research grounding, and gameplay text readability.
- [Phase 45]: Phase 45 starts from runtime-sequencing regressions, not prompt-only wording assertions.
- [Phase 45]: Opening-surface regressions are pinned at both NarrativeLog and /game so premise fallback cannot survive in one layer.
- [Phase 45]: Campaigns with no assistant history must request an opening scene through a dedicated backend SSE path instead of premise fallback.
- [Phase 45]: Hidden tool-driving resolution and visible narration now run as separate storyteller passes so no partial hidden prose can leak into persisted assistant output.
- [Phase 45]: Present-scene NPC settlement now runs before the final narration pass, while off-screen NPC, reflection, and faction work stays inside rollback-critical post-narration finalization.
- [Phase 45]: Frontend opening scenes now request `/api/chat/opening` when assistant history is empty instead of rendering premise fallback.
- [Phase 45]: The `/game` UI now treats `scene-settling` as a separate progress state from post-narration `finalizing_turn`.
- [Phase 46]: Phase 46 begins with explicit red regressions for encounter scope instead of prose complaints or prompt-only assertions.
- [Phase 46]: Presence, awareness, and knowledge basis are now treated as separate test-layer contracts across backend scene assembly, NPC routing, and /game visible presence.
- [Phase 46]: Persist local scene scope as nullable actor state while deriving awareness and knowledge at read time.
- [Phase 46]: Movement and arrival writers set scene scope immediately so scene membership never relies on later backfill.
- [Phase 46]: Hidden tool-driving prompts keep hint-band actors in encounter scope, while final-visible prompts surface only clear actors plus bounded hint signals.
- [Phase 46]: Present-NPC and off-screen routing now treat broad location plus current scene scope as the local/on-screen boundary instead of broad co-location alone.
- [Phase 46]: NPC nearby context now includes explicit awareness and knowledge labels from the shared presence snapshot instead of same-location omniscience.
- [Phase 46]: The backend /world route now emits one bounded currentScene object with sceneNpcIds, clearNpcIds, and awareness instead of forcing /game to infer scene truth from broad-location membership.
- [Phase 46]: The /game page treats currentScene as authoritative and only falls back to sceneScopeId or currentLocationId when currentScene is absent during transitional reads.
- [Phase 46]: The location panel keeps the broad location as the main place description while showing the immediate scene label and bounded hint signals separately.
- [Phase 47]: Do not create per-provider prompt dashboards; keep GLM support as one overlay option on shared OpenAI-compatible path.
- [Phase 47]: Preserve existing createModel(config) behavior by default and gate storyteller-specific behavior with explicit options.
- [Phase 47]: Keep hidden-tool-driving and final-visible passes sharing one preset source to avoid divergent doctrine.
- [Phase 47]: Use deterministic runtime signals for storyteller scene mode instead of fuzzy heuristics.
- [Phase 47]: Keep one bounded GLM overlay per passage by extending existing storyteller contracts; no rewrite stage.
- [Phase 48]: Character modeling must preserve a real identity core instead of collapsing into short summaries, tags, and generic goals.
- [Phase 48]: Key/canonical characters use a stricter fidelity path, but not a rigid role-lock; preserve internal logic while allowing earned change over time.
- [Phase 48]: Canonical truth uses three layers: base facts, behavioral core, and live campaign dynamics.
- [Phase 48]: Canonical facts come from canon-facing sources; community cards are secondary cues for feel and voice, and WorldForge owns the final structured synthesis.
- [Phase 48]: Keep one shared CharacterDraft/CharacterRecord ontology and layer richer identity inside identity instead of creating a canonical-only record type.
- [Phase 48]: Store canon fidelity as optional sourceBundle and continuity extensions on the shared record so imported and key characters gain provenance without forking the lane.
- [Phase 48]: Derive legacy persona, goals, and beliefs compatibility views from normalized rich identity when shallow fields are stale.
- [Phase 48]: Generator and NPC creation now keep the LLM output flat and deterministic, then lift it into baseFacts, behavioralCore, and liveDynamics in backend adapters.
- [Phase 48]: Character and campaign routes now return richer characterRecord and draft payloads additively alongside legacy compatibility aliases.
- [Phase 48]: Persona templates now patch richer identity, sourceBundle, and continuity seams without erasing imported or canonical provenance.
- [Phase 48-character-identity-fidelity-and-canonical-modeling]: Frontend draft adapters now derive compatibility persona/goals from richer identity only when shallow fields are empty.
- [Phase 48-character-identity-fidelity-and-canonical-modeling]: CharacterCard surfaces canonical status, continuity, core self-image, live pressure, and source cues as a compact read-only fidelity block instead of adding deep edit controls.
- [Phase 48-character-identity-fidelity-and-canonical-modeling]: Frontend typecheck now rebuilds shared typings first and excludes test mocks so plan verification remains meaningful.
- [Phase 48-character-identity-fidelity-and-canonical-modeling]: Runtime prompts now treat base facts, behavioral core, live dynamics, and continuity as character truth while tags remain compatibility shorthand.
- [Phase 48-character-identity-fidelity-and-canonical-modeling]: Off-screen NPC simulation is bounded to a compact richer identity slice per actor instead of serializing full records into batch prompts.
- [Phase 48-character-identity-fidelity-and-canonical-modeling]: Deeper identity edits now require explicit promote_identity_change evidence thresholds while ordinary reflection writes stay in live dynamics.

### Pending Todos

None yet.

### Blockers/Concerns

- Some archived v1.0 phases still lack phase-level verification artifacts, but that does not block v1.1 planning.
- Repo-root Vitest still emits a non-blocking `environmentMatchGlobs` deprecation warning during frontend verification.

## Session Continuity

Last session: 2026-04-12T17:26:39.593Z
Stopped at: Completed 48-03-PLAN.md
Resume file: None
