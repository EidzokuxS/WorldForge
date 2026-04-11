# Phase 43: Travel & Location-State Contract Resolution - Research

**Researched:** 2026-04-11
**Domain:** Location graph, travel contract, and per-location runtime state
**Confidence:** MEDIUM

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Phase 43 must be treated as a minimal complete location-system repair phase, not as two unrelated feature patches for travel cost and local events.
- **D-02:** The current roadmap wording under-scopes the real problem. Travel-time and per-location recent-happenings claims both depend on a stronger location model than the current flat `connectedTo` graph.
- **D-03:** The phase should close the location-system gaps needed for milestone fidelity now rather than leaving another partially repaired subsystem for a later milestone.
- **D-04:** The runtime location model must distinguish at least three product-level classes of place:
  - macro locations (`Shibuya`, `Tokyo Jujutsu High`, etc.)
  - persistent sublocations (districts, buildings, rooms, stations, floors)
  - ephemeral scene locations (temporary event-born spaces such as an alley, tunnel pocket, rooftop encounter, or one-off room)
- **D-05:** These classes should still live inside one coherent location graph/runtime model rather than three unrelated systems.
- **D-06:** The model must encode persistence/lifetime semantics explicitly so temporary scene locations do not pollute the long-lived world graph.
- **D-07:** Travel/time remains part of the live product contract and must not be deprecated in Phase 43.
- **D-08:** The player must not effectively teleport between major locations that should require intermediate traversal. Long-distance movement should resolve through a believable graph path.
- **D-09:** Travel must expose an observable cost in abstract turns/ticks/time so the player and simulation can both experience movement as taking time.
- **D-10:** Phase 43 does not owe a rich transit simulation; it owes a defensible movement contract with real cost and graph semantics.
- **D-11:** Per-location recent happenings remain part of the live product contract and must not be deprecated in Phase 43.
- **D-12:** Local recent happenings must belong to a concrete location and be inspectable or otherwise meaningfully present on revisit, not only exist as global chronicle text.
- **D-13:** Ephemeral scene locations may disappear as active nodes after they resolve, but their consequences must not disappear. Relevant events, moved entities, and downstream world changes must persist beyond the temporary node.
- **D-14:** Location-local state must be consistent with retry, undo, and checkpoint restore rather than being prompt-only or UI-only decoration.
- **D-15:** Current docs already promise a location graph, connected nodes, local event logs, dynamic expansion, and travel by edge distance/time. Phase 43 is therefore implementation reconciliation, not scope invention.
- **D-16:** The docs do not yet formalize the three-tier location taxonomy above, so that taxonomy is a product clarification made here to make the promised behavior implementable and coherent.
- **D-17:** Where current docs are underspecified, the implementation should prefer an honest and extensible location contract over the narrowest possible patch that technically satisfies one sentence.
- **D-18:** The phase should repair enough of the location model to support travel-time and location-local state properly, but it should not expand into a full world rewrite.
- **D-19:** If a mechanic cannot be made honest on the current flat location model, the model should be repaired first rather than shipping another transitional hack.
- **D-20:** The final plan should preserve a clear line between persistent world geography and temporary scene-born locations, because their storage and cleanup semantics differ materially.

### Claude's Discretion
- Exact storage representation for location type, parentage, or persistence metadata
- Exact travel-cost formula or edge weighting scheme
- Exact UI/API surface used to show local recent happenings and travel cost
- Exact cleanup/archive mechanics for expired ephemeral scene locations

### Deferred Ideas (OUT OF SCOPE)
- Full map visualization, world map UI, or geographic rendering.
- Rich pathfinding, transit simulation, or route optimization.
- A full gossip propagation simulation between all NPCs and locations.
- Any broader world-system rewrite that does not directly serve the repaired location contract.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| GSEM-03 | Travel/time semantics promised by current docs are either implemented as runtime mechanics or removed from the active product contract. | Recommends replacing adjacency-only movement with backend-owned graph traversal, explicit edge cost, and shared travel resolution used by player and NPC flows. |
| GSEM-04 | Per-location recent-happenings state promised by current docs is either implemented as runtime state or removed from the active product contract. | Recommends a SQLite-backed per-location recent-events projection sourced from authoritative turn/world events and surfaced through API, prompt assembly, and UI. |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- Use the existing stack: Hono backend, Next.js App Router frontend, Drizzle ORM, better-sqlite3, Zod, TypeScript strict mode.
- Treat the LLM as narrator only. Mechanical truth must stay in backend code.
- Keep SQLite as the authoritative runtime store. LanceDB is semantic memory, not the source of truth.
- Use Drizzle query builder rather than raw SQL.
- Validate AI tool definitions and API payloads with Zod.
- Route handlers should keep the established pattern: outer `try/catch`, `parseBody()` for validation, `getErrorStatus(error)` for status mapping.
- Shared types/constants belong in `@worldforge/shared`; do not duplicate contracts ad hoc.

## Summary

Phase 43 is not a UI tweak and not two isolated bug fixes. The locked discuss context is correct: the current flat `locations.connectedTo` JSON adjacency cannot honestly support the live product promises around travel cost, believable traversal between major locations, or revisit-facing local recent happenings. The repair needs to define one authoritative runtime location contract that covers macro locations, persistent sublocations, and ephemeral scene locations inside the same graph.

The lowest-risk implementation path is to stay inside the current stack and move the missing semantics into SQLite-backed runtime state. Add explicit location metadata, normalize graph edges so travel cost is first-class instead of inferred from string arrays, and store a per-location recent-events projection that is written from authoritative simulation/turn events. That keeps retry, undo, and checkpoint restore aligned with Phase 39 and Phase 41 expectations instead of leaving travel and local history as prompt decoration.

**Primary recommendation:** Replace flat adjacency as the authority with typed locations, normalized location edges, and a SQLite-backed location-recent-events projection, then route all movement, reveal, prompt, API, and UI reads through that contract.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `drizzle-orm` | repo `^0.45.1`; latest verified `0.45.2` published 2026-03-27 | SQLite schema and queries for locations, edges, and local-event state | Already authoritative in backend persistence and consistent with project rules |
| `better-sqlite3` | repo `^12.6.2`; latest verified `12.8.0` published 2026-03-14 | Campaign runtime storage | Existing source of truth for rollback-safe mechanics |
| `hono` | repo `^4.12.3`; latest verified `4.12.12` published 2026-04-07 | Backend API surface for world/location payloads | Existing backend framework; no reason to introduce a second contract layer |
| `zod` | repo `^4.3.6`; latest verified `4.3.6` published 2026-01-22 | API/tool contract validation for new location payloads | Already the project-wide schema boundary |
| `vitest` | repo `^3.2.4`; latest verified `4.1.4` published 2026-04-09 | Backend and frontend regression coverage | Existing test framework on both sides of the repo |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@worldforge/shared` | workspace package | Shared types/constants for new location kinds and payload shapes | Use for cross-backend/frontend location contracts |
| LanceDB episodic events seam | existing repo integration | Semantic memory already storing `location` on events | Reuse as an input seam, not as the sole storage for local history |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Normalized `location_edges` table | Keep edge metadata inside `locations.connectedTo` JSON | Faster initial patch, but it blocks clean cost queries, path semantics, and graph evolution |
| SQLite-backed local recent-events projection | Read only from vector memory / chronicle text | Cheaper short-term, but not authoritative enough for retry/undo/checkpoint correctness |
| One unified location graph | Separate macro/sublocation/scene subsystems | Adds coordination debt and violates the locked one-graph decision |

**Installation:**
```bash
# No new packages are recommended for Phase 43.
# Existing repo dependencies are sufficient.
npm --prefix backend install
npm --prefix frontend install
```

**Version verification:** Recommended packages above were verified against the npm registry on 2026-04-11 via `npm view <package> version time --json`. Do not turn Phase 43 into a package-upgrade phase unless a concrete incompatibility appears.

## Architecture Patterns

### Recommended Project Structure
```text
backend/
├── src/db/
│   ├── schema.ts              # extend locations, add edges/event projection tables
│   └── migrate.ts             # migration path
├── src/engine/
│   ├── location-graph.ts      # new authority for traversal and cost resolution
│   ├── location-events.ts     # new authority for local recent-happenings writes/reads
│   ├── tool-executor.ts       # route reveal/move tools through location authority
│   ├── turn-processor.ts      # route player movement through location authority
│   ├── npc-tools.ts           # keep NPC movement on the same contract
│   └── prompt-assembler.ts    # surface local recent happenings in scene context
├── src/routes/
│   └── campaigns.ts           # expose normalized location graph and local history
frontend/
├── lib/api.ts                 # parse new location payload shape
├── app/game/page.tsx          # consume cost/history data
└── components/game/location-panel.tsx  # show local happenings and travel cost
```

### Pattern 1: Backend-Owned Location Contract
**What:** Give each location explicit class and lifetime metadata, then use one resolver for traversal and lookup instead of scattering location rules across `tool-executor.ts`, `turn-processor.ts`, and UI parsing.

**When to use:** For all movement, reveal, location payload generation, and scene prompt readback.

**Example:**
```typescript
// Source: backend/src/db/schema.ts (recommended extension in existing Drizzle style)
export const locations = sqliteTable("locations", {
  id: text("id").primaryKey(),
  campaignId: text("campaign_id").notNull(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  kind: text("kind", {
    enum: ["macro", "persistent_sublocation", "ephemeral_scene"],
  }).notNull(),
  parentLocationId: text("parent_location_id"),
  persistence: text("persistence", {
    enum: ["persistent", "ephemeral"],
  }).notNull(),
  expiresAtTick: integer("expires_at_tick"),
  tags: text("tags").notNull(),
  isStarting: integer("is_starting", { mode: "boolean" }).notNull().default(false),
});
```

### Pattern 2: Normalized Edge Traversal With Explicit Cost
**What:** Store edges separately from node records so travel cost and path semantics are first-class data instead of string-array conventions.

**When to use:** For player movement, NPC movement, path validation, reveal-location inserts, and any future UI that shows available travel cost.

**Example:**
```typescript
// Source: backend/src/engine/tool-executor.ts and backend/src/engine/turn-processor.ts
const path = await resolveTravelPath(db, {
  campaignId,
  fromLocationId: currentLocationId,
  toLocationId: targetLocationId,
});

if (!path) {
  return { ok: false, reason: "Destination is not reachable from the current graph." };
}

await applyTravel({
  db,
  actorId: playerId,
  path,
  travelCost: path.totalCost,
});
```

### Pattern 3: Write-Through Local Recent-Happenings Projection
**What:** Keep a location-scoped recent-events table or equivalent projection in SQLite, written whenever authoritative gameplay/world events occur. Reuse the existing episodic-event `location` seam rather than inventing a second event vocabulary.

**When to use:** For revisit UI, prompt assembly, restore-safe readback, and world payload exposure.

**Example:**
```typescript
// Source: backend/src/vectors/episodic-events.ts + recommended new location-events seam
await recordLocationRecentEvent(db, {
  campaignId,
  locationId,
  tick,
  eventType: "npc_dialogue",
  summary: eventSummary,
  sourceEventId: episodicEventId,
  importance,
});
```

### Pattern 4: Expire Ephemeral Nodes Without Erasing Consequences
**What:** Temporary scene locations may stop being active traversal targets, but their effects must survive as moved entities, world mutations, local-history records, and chronicle/episodic evidence.

**When to use:** For scene-born alleys, rooftop encounters, tunnel pockets, one-off rooms, and any reveal-generated space that is not long-lived geography.

**Example:**
```typescript
// Source: recommended new lifecycle seam
await archiveExpiredSceneLocation(db, {
  campaignId,
  locationId,
  archivedAtTick: currentTick,
  successorLocationId: fallbackParentOrAnchorId,
});
```

### Anti-Patterns to Avoid
- **Flat `connectedTo` as the only graph authority:** It cannot carry the locked semantics around cost, hierarchy, and lifetime cleanly.
- **Prompt-only travel delay:** If cost is narrated but not stored, rollback and restore will drift from the player-facing contract.
- **Vector-only local history:** Semantic retrieval is useful, but it is not sufficient as authoritative per-location runtime state.
- **Separate scene-location subsystem:** It creates hidden coordination debt and breaks the one-coherent-graph requirement.
- **Backend/frontend contract drift:** If backend emits richer location state but `frontend/lib/api.ts` still normalizes only `connectedTo: string[]`, the UI will silently flatten the repair back into the old model.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Travel semantics | Custom prompt convention for "time passed" | SQLite-backed edge cost + shared traversal resolver | Prompt text cannot guarantee rollback-safe mechanics |
| Location-local history | Second bespoke event/memory system | Projection from authoritative turn/world events, keyed by location | The repo already has episodic event seams; duplicating vocabularies adds drift |
| Geography richness | Map renderer, coordinates, transit simulator | Abstract graph path with explicit cost | Locked scope only owes defensible graph semantics |
| Scene cleanup | Manual string cleanup in prompts/UI | Explicit lifetime/archive metadata in runtime tables | Ephemeral nodes need deterministic lifecycle handling |

**Key insight:** The deceptively hard part of this phase is not rendering a prettier location panel. It is choosing one authoritative persistence model that movement, UI, prompts, and restore flows can all trust.

## Common Pitfalls

### Pitfall 1: Treating Three Location Classes As Three Systems
**What goes wrong:** Macro locations, sublocations, and scene nodes get separate code paths, payload shapes, and movement rules.
**Why it happens:** The current code already mixes movement logic across multiple files, so incremental patches tend to fork behavior instead of centralizing it.
**How to avoid:** Keep one `locations` authority plus lifecycle metadata and shared traversal helpers.
**Warning signs:** Player movement works differently from NPC movement, or scene-born locations need custom UI parsing.

### Pitfall 2: Keeping Edge Semantics Inside `connectedTo`
**What goes wrong:** Travel cost, path requirements, and reveal-location edge updates become increasingly ad hoc JSON mutations.
**Why it happens:** The current adjacency list looks "good enough" for one-hop movement.
**How to avoid:** Normalize edges before layering cost/time semantics on top.
**Warning signs:** Code starts parsing arrays of strings and inferring cost from names, tags, or ordering.

### Pitfall 3: Making Local Recent Happenings Read-Only From Vectors
**What goes wrong:** Revisit history becomes fuzzy, restore behavior becomes nondeterministic, and tests cannot assert concrete per-location state.
**Why it happens:** Episodic events already exist, so it is tempting to treat search results as the feature.
**How to avoid:** Use vectors as an input seam, not the authoritative view model. Persist the location-facing projection in SQLite.
**Warning signs:** UI or prompt assembly calls semantic search instead of reading campaign state tables.

### Pitfall 4: Forgetting Rollback/Restore Boundaries
**What goes wrong:** Travel cost or local history exists for the live session but disappears or diverges after retry, undo, or checkpoint load.
**Why it happens:** The implementation stores derived state in memory or recomputes from incomplete prompt logs.
**How to avoid:** Ensure every phase-critical location mutation is written into campaign-authoritative storage.
**Warning signs:** Tests pass only in a linear playthrough and fail when replaying restored state.

### Pitfall 5: Repairing Backend Semantics But Leaving UI/API Flat
**What goes wrong:** Backend state becomes correct, but the player still sees instant movement and no local recent-happenings contract.
**Why it happens:** `frontend/lib/api.ts` and `location-panel.tsx` currently flatten location data aggressively.
**How to avoid:** Plan payload and UI updates as part of the same phase, not as follow-up polish.
**Warning signs:** Backend tables exist, but `page.tsx` still only sends `go to {name}` with no cost or history readback.

## Code Examples

Verified patterns from existing repo style and the required repair direction:

### Normalized Edge Table
```typescript
// Source: backend/src/db/schema.ts (recommended in current Drizzle style)
export const locationEdges = sqliteTable("location_edges", {
  id: text("id").primaryKey(),
  campaignId: text("campaign_id").notNull(),
  fromLocationId: text("from_location_id").notNull(),
  toLocationId: text("to_location_id").notNull(),
  travelCost: integer("travel_cost").notNull().default(1),
  bidirectional: integer("bidirectional", { mode: "boolean" }).notNull().default(true),
  isDiscovered: integer("is_discovered", { mode: "boolean" }).notNull().default(true),
});
```

### Location Recent-Events Projection
```typescript
// Source: backend/src/vectors/episodic-events.ts + recommended new SQLite projection
export const locationRecentEvents = sqliteTable("location_recent_events", {
  id: text("id").primaryKey(),
  campaignId: text("campaign_id").notNull(),
  locationId: text("location_id").notNull(),
  tick: integer("tick").notNull(),
  eventType: text("event_type").notNull(),
  summary: text("summary").notNull(),
  sourceEventId: text("source_event_id"),
  importance: integer("importance").notNull().default(1),
});
```

### Shared Travel Resolution
```typescript
// Source: backend/src/engine/turn-processor.ts and backend/src/engine/npc-tools.ts
export async function moveActorToLocation(input: {
  db: Database;
  campaignId: string;
  actorId: string;
  actorKind: "player" | "npc";
  fromLocationId: string;
  toLocationId: string;
}) {
  const path = await resolveTravelPath(input.db, input);
  if (!path) return { moved: false, reason: "unreachable" };

  await consumeTravelTime(input.db, input.campaignId, path.totalCost);
  await updateActorLocation(input.db, input);
  await appendTravelEvent(input.db, input.campaignId, path);

  return { moved: true, travelCost: path.totalCost, path };
}
```

### Prompt Assembly Readback
```typescript
// Source: backend/src/engine/prompt-assembler.ts (recommended extension)
const recentHappenings = await listRecentLocationEvents(db, {
  campaignId,
  locationId: currentLocation.id,
  limit: 5,
});

sceneParts.push(
  "Recent happenings here:",
  recentHappenings.length
    ? recentHappenings.map((event) => `- [T${event.tick}] ${event.summary}`).join("\n")
    : "- Nothing notable has been recorded here recently."
);
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `locations.connectedTo` JSON string array as the whole graph | Typed locations plus normalized edges with explicit cost | Recommended for Phase 43 planning | Enables believable traversal and lifecycle semantics |
| Global chronicle / vector memory only | SQLite-backed per-location recent-events projection, fed by authoritative events | Recommended for Phase 43 planning | Makes revisit, restore, and UI readback honest |
| Scattered player/NPC move rules | Shared traversal and travel-cost authority | Recommended for Phase 43 planning | Prevents player/NPC semantic drift |

**Deprecated/outdated:**
- Instant adjacency-only movement as the effective live contract: outdated because it conflicts with `GSEM-03`.
- Local history existing only as prompt/chronicle flavor: outdated because it conflicts with `GSEM-04`.

## Open Questions

1. **How exact should the first travel-cost formula be?**
   - What we know: The contract only requires observable abstract time/cost, not full transit simulation.
   - What's unclear: Whether cost should be fixed-per-edge, weighted by location kind, or allow a small number of long-distance shortcuts.
   - Recommendation: Start with explicit per-edge integer cost in SQLite. It is the lowest-risk representation and can evolve without schema inversion.

2. **Should local recent events duplicate summaries or reference authoritative event rows?**
   - What we know: Episodic events already store `tick`, `location`, `participants`, `importance`, and `type`.
   - What's unclear: Whether the UI/prompt path should read cached summaries directly or join back to authoritative event rows.
   - Recommendation: Store a lightweight projection row with `sourceEventId` plus cached summary text. That keeps reads simple while preserving traceability.

3. **How should expired scene locations remain inspectable, if at all?**
   - What we know: Active ephemeral nodes may disappear, but their consequences must persist.
   - What's unclear: Whether old scene nodes remain queryable in history-only mode or are merged into parent/anchor locations.
   - Recommendation: Plan explicit archive semantics. Do not decide this implicitly inside cleanup code.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Backend, frontend, tests | ✓ | `v23.11.0` | — |
| npm | Package scripts and registry verification | ✓ | `11.12.1` | — |
| Vitest | Backend and frontend validation | ✓ | repo `^3.2.4` | Manual targeted runs only if config drifts |

**Missing dependencies with no fallback:**
- None identified.

**Missing dependencies with fallback:**
- None identified.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest `^3.2.4` (backend and frontend) |
| Config file | `backend/vitest.config.ts`; `frontend/vitest.config.ts` |
| Quick run command | Backend: `npm --prefix backend test -- src/engine/__tests__/turn-processor.test.ts src/engine/__tests__/npc-agent.test.ts src/routes/__tests__/campaigns.test.ts src/engine/__tests__/prompt-assembler.test.ts`; Frontend: `npm --prefix frontend exec vitest run app/game/__tests__/page.test.tsx lib/__tests__/world-data-helpers.test.ts` |
| Full suite command | Backend: `npm --prefix backend test`; Frontend: `npm --prefix frontend exec vitest run` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| GSEM-03 | Travel resolves through the authoritative graph, applies observable cost, and remains consistent across player/NPC paths | unit + integration | `npm --prefix backend test -- src/engine/__tests__/turn-processor.test.ts src/engine/__tests__/npc-agent.test.ts` | ❌ Wave 0 |
| GSEM-04 | Location-local recent happenings persist, surface on revisit, and survive restore-facing reads | integration + UI | Backend: `npm --prefix backend test -- src/routes/__tests__/campaigns.test.ts src/engine/__tests__/prompt-assembler.test.ts`; Frontend: `npm --prefix frontend exec vitest run app/game/__tests__/page.test.tsx components/game/__tests__/location-panel.test.tsx lib/__tests__/world-data-helpers.test.ts` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** Run the targeted backend or frontend command that matches the edited seam.
- **Per wave merge:** Run both quick commands above.
- **Phase gate:** Full backend and frontend suites should be green before `/gsd:verify-work`.

### Wave 0 Gaps
- [ ] `backend/src/engine/__tests__/location-graph.test.ts` or equivalent shared traversal tests for path selection and travel-cost accumulation.
- [ ] Extend `backend/src/engine/__tests__/turn-processor.test.ts` to cover travel-cost application and non-teleport movement semantics.
- [ ] Extend `backend/src/engine/__tests__/npc-agent.test.ts` so NPC movement uses the same graph contract as player movement.
- [ ] Add backend coverage for location-recent-events persistence and restore-safe readback.
- [ ] Extend `backend/src/routes/__tests__/campaigns.test.ts` for the new location payload shape.
- [ ] Extend `backend/src/engine/__tests__/prompt-assembler.test.ts` for local recent-happenings surfacing.
- [ ] Extend `frontend/components/game/__tests__/location-panel.test.tsx` and `frontend/app/game/__tests__/page.test.tsx` for travel cost and local history rendering.

**Current suite health:** Targeted phase-relevant tests passed on 2026-04-11. The full backend suite is currently red for unrelated worldgen/character-generation areas, so the planner should treat full-suite green as a pre-existing repo health issue rather than evidence against this phase direction.

## Sources

### Primary (HIGH confidence)
- `.planning/phases/43-travel-and-location-state-contract-resolution/43-CONTEXT.md` - locked scope, decisions, and canonical references
- `.planning/REQUIREMENTS.md` - requirement text for `GSEM-03` and `GSEM-04`
- `.planning/STATE.md` - current milestone state and repaired baseline assumptions
- `.planning/phases/36-gameplay-docs-to-runtime-reconciliation-audit/36-HANDOFF.md` - grouped reconciliation gaps
- `.planning/phases/36-gameplay-docs-to-runtime-reconciliation-audit/36-CLAIMS.md` - `STATE-18` and `STATE-19`
- `.planning/phases/36-gameplay-docs-to-runtime-reconciliation-audit/36-RUNTIME-MATRIX.md` - documented-but-missing evidence
- `docs/concept.md`, `docs/memory.md`, `docs/mechanics.md`, `docs/tech_stack.md` - product promises and stack baseline
- `backend/src/db/schema.ts` - current flat location table
- `backend/src/engine/tool-executor.ts` - current player move/reveal flow
- `backend/src/engine/turn-processor.ts` - current movement detection and location-change path
- `backend/src/engine/npc-tools.ts` - current NPC move flow
- `backend/src/engine/prompt-assembler.ts` - current scene context surface
- `backend/src/routes/campaigns.ts` - world payload exposure
- `backend/src/vectors/episodic-events.ts` - reusable event seam with location field
- `frontend/app/game/page.tsx`, `frontend/components/game/location-panel.tsx`, `frontend/lib/api.ts` - current UI/data contract
- `backend/package.json`, `frontend/package.json`, `backend/vitest.config.ts`, `frontend/vitest.config.ts` - stack and test infrastructure
- npm registry verification on 2026-04-11 via `npm view drizzle-orm version time --json`, `npm view better-sqlite3 version time --json`, `npm view hono version time --json`, `npm view zod version time --json`, `npm view vitest version time --json`

### Secondary (MEDIUM confidence)
- None needed beyond repo evidence and npm registry metadata.

### Tertiary (LOW confidence)
- None.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - This phase should stay inside the repo's existing backend/frontend/testing stack, and versions were verified against the npm registry on 2026-04-11.
- Architecture: MEDIUM - The need for a stronger location contract is strongly evidenced by repo state and locked decisions, but the exact table shapes and lifecycle details are still planner choices.
- Pitfalls: HIGH - The main failure modes are directly visible in current code and in the mismatch between docs and runtime behavior.

**Research date:** 2026-04-11
**Valid until:** 2026-05-11
