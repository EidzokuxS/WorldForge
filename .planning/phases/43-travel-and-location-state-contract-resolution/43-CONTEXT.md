# Phase 43: Travel & Location-State Contract Resolution - Context

**Gathered:** 2026-04-11
**Status:** Ready for planning

<domain>
## Phase Boundary

Repair the location system far enough that the remaining doc-promised travel and location-state mechanics can exist as honest runtime behavior instead of isolated patches.

This phase covers:
- the minimum complete location-model repair needed to support travel time and per-location recent happenings
- the runtime contract for persistent world locations versus temporary scene-born locations
- observable travel cost/time semantics on top of a real location graph rather than instant teleports between large places
- location-local recent-happenings state that survives revisit and restore flows where appropriate

This phase does **not** cover:
- a full geographic map renderer or coordinate simulation
- a tactical navigation minigame, route planner, or pathfinding-heavy travel engine
- party management, inventory authority, or broader docs cleanup outside what the repaired location contract depends on
- arbitrary future expansion of the world model beyond what is needed to make `GSEM-03` and `GSEM-04` real

</domain>

<decisions>
## Implementation Decisions

### Scope Correction
- **D-01:** Phase 43 must be treated as a minimal complete location-system repair phase, not as two unrelated feature patches for travel cost and local events.
- **D-02:** The current roadmap wording under-scopes the real problem. Travel-time and per-location recent-happenings claims both depend on a stronger location model than the current flat `connectedTo` graph.
- **D-03:** The phase should close the location-system gaps needed for milestone fidelity now rather than leaving another partially repaired subsystem for a later milestone.

### Location Model
- **D-04:** The runtime location model must distinguish at least three product-level classes of place:
  - macro locations (`Shibuya`, `Tokyo Jujutsu High`, etc.)
  - persistent sublocations (districts, buildings, rooms, stations, floors)
  - ephemeral scene locations (temporary event-born spaces such as an alley, tunnel pocket, rooftop encounter, or one-off room)
- **D-05:** These classes should still live inside one coherent location graph/runtime model rather than three unrelated systems.
- **D-06:** The model must encode persistence/lifetime semantics explicitly so temporary scene locations do not pollute the long-lived world graph.

### Travel Contract
- **D-07:** Travel/time remains part of the live product contract and must not be deprecated in Phase 43.
- **D-08:** The player must not effectively teleport between major locations that should require intermediate traversal. Long-distance movement should resolve through a believable graph path.
- **D-09:** Travel must expose an observable cost in abstract turns/ticks/time so the player and simulation can both experience movement as taking time.
- **D-10:** Phase 43 does not owe a rich transit simulation; it owes a defensible movement contract with real cost and graph semantics.

### Location-Local State
- **D-11:** Per-location recent happenings remain part of the live product contract and must not be deprecated in Phase 43.
- **D-12:** Local recent happenings must belong to a concrete location and be inspectable or otherwise meaningfully present on revisit, not only exist as global chronicle text.
- **D-13:** Ephemeral scene locations may disappear as active nodes after they resolve, but their consequences must not disappear. Relevant events, moved entities, and downstream world changes must persist beyond the temporary node.
- **D-14:** Location-local state must be consistent with retry, undo, and checkpoint restore rather than being prompt-only or UI-only decoration.

### Documentation-Grounded Interpretation
- **D-15:** Current docs already promise a location graph, connected nodes, local event logs, dynamic expansion, and travel by edge distance/time. Phase 43 is therefore implementation reconciliation, not scope invention.
- **D-16:** The docs do not yet formalize the three-tier location taxonomy above, so that taxonomy is a product clarification made here to make the promised behavior implementable and coherent.
- **D-17:** Where current docs are underspecified, the implementation should prefer an honest and extensible location contract over the narrowest possible patch that technically satisfies one sentence.

### Scope Guardrails
- **D-18:** The phase should repair enough of the location model to support travel-time and location-local state properly, but it should not expand into a full world rewrite.
- **D-19:** If a mechanic cannot be made honest on the current flat location model, the model should be repaired first rather than shipping another transitional hack.
- **D-20:** The final plan should preserve a clear line between persistent world geography and temporary scene-born locations, because their storage and cleanup semantics differ materially.

### Codex's Discretion
- Exact storage representation for location type, parentage, or persistence metadata
- Exact travel-cost formula or edge weighting scheme
- Exact UI/API surface used to show local recent happenings and travel cost
- Exact cleanup/archive mechanics for expired ephemeral scene locations

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Milestone baseline
- `.planning/ROADMAP.md` — Phase 43 goal, dependencies, and success criteria.
- `.planning/REQUIREMENTS.md` — `GSEM-03` and `GSEM-04`.
- `.planning/STATE.md` — current repaired baseline from Phases 37-42.

### Reconciled gameplay baseline
- `.planning/phases/36-gameplay-docs-to-runtime-reconciliation-audit/36-HANDOFF.md` — Group `B3` and `B4`.
- `.planning/phases/36-gameplay-docs-to-runtime-reconciliation-audit/36-CLAIMS.md` — `STATE-18` and `STATE-19`.
- `.planning/phases/36-gameplay-docs-to-runtime-reconciliation-audit/36-RUNTIME-MATRIX.md` — evidence that local happenings and travel-by-distance are currently documented-but-missing.

### Gameplay docs
- `docs/concept.md` — `World Structure`, `UI: "Solid Slate" Layout`, and initial scaffold expectations.
- `docs/memory.md` — `Locations` storage expectations and local event log claim.
- `docs/mechanics.md` — `move_to(target_node)`, `reveal_location(...)`, NPC location semantics, and proximity/location-history expectations.
- `docs/tech_stack.md` — location background generation and location-related structured state mentions where relevant.

### Runtime code
- `backend/src/db/schema.ts` — current flat location table and missing distance/local-event fields.
- `backend/src/engine/tool-executor.ts` — current player `move_to` and `reveal_location` mechanics.
- `backend/src/engine/turn-processor.ts` — movement detection and location-change hooks.
- `backend/src/engine/npc-tools.ts` — NPC location movement path.
- `backend/src/engine/prompt-assembler.ts` — current scene surfacing and absence of location-local event readback.
- `backend/src/routes/campaigns.ts` — world/location payload surfaces.
- `backend/src/vectors/episodic-events.ts` — reusable location-tagged event memory seam.
- `backend/src/engine/world-engine.ts` and `backend/src/engine/faction-tools.ts` — existing world/chronicle event paths that may feed location-local state.
- `frontend/app/game/page.tsx` and `frontend/components/game/location-panel.tsx` — current location UI surface.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- The current system already has a real graph seam through `locations.connectedTo`, `move_to`, and `reveal_location`.
- Episodic events already have a `location` field, which can be reused for location-local recent-happenings instead of inventing a second unrelated event vocabulary.
- Checkpoint/restore work from Phases 39 and 41 already gives Phase 43 a persistence boundary worth building on.

### Established Gaps
- `locations` currently stores only flat adjacency and no explicit travel cost, edge distance, location type, or lifetime semantics.
- Player movement is adjacency-only and instant.
- The location UI currently shows description, people, items, and paths, but no local recent-happenings surface.
- Global chronicle and episodic memory exist, but there is no true per-location recency window or revisit-facing local log.

### Integration Points
- `tool-executor.ts` and `turn-processor.ts` are the main movement-contract seams.
- `campaigns.ts` and `location-panel.tsx` are the likely first UI/API seams for local recent-happenings readback.
- `episodic-events.ts` is the best candidate seam for reusing event storage while attaching events to concrete locations.

</code_context>

<specifics>
## Specific Ideas

- The docs already imply more than a flat list of rooms: they promise a graph with local state, dynamic expansion, and travel that takes time.
- The user's target product model is more explicit than the docs:
  - macro locations are large canonical places
  - persistent sublocations are revisitable parts within or around those macro places
  - ephemeral scene locations are temporary nodes created for a specific event or encounter
- The phase should formalize that model just far enough to make the promised mechanics coherent.
- “Not fully building it now” is acceptable only if the resulting location contract is still honest and extensible, not if it leaves another hidden subsystem debt for a future milestone.

</specifics>

<deferred>
## Deferred Ideas

- Full map visualization, world map UI, or geographic rendering.
- Rich pathfinding, transit simulation, or route optimization.
- A full gossip propagation simulation between all NPCs and locations.
- Any broader world-system rewrite that does not directly serve the repaired location contract.

</deferred>

---

*Phase: 43-travel-and-location-state-contract-resolution*
*Context gathered: 2026-04-11*
