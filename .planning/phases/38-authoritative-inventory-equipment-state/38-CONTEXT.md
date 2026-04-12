# Phase 38: Authoritative Inventory & Equipment State - Context

**Gathered:** 2026-04-12
**Status:** Ready for planning

<domain>
## Phase Boundary

Make inventory and equipment read from one runtime source of truth so gameplay, prompts, rollback/checkpoints, and UI stop drifting across `items`, `characterRecord`, and legacy `equippedItems` projections.

This phase covers the authority seam only:
- player and NPC inventory ownership
- equipped-vs-carried state
- runtime read paths for gameplay, prompts, persistence, and UI payloads
- legacy campaign migration/backfill onto the authoritative model

This phase does **not** promise:
- new item mechanics, bonuses, or economy systems
- a broader tag-system redesign
- party-management or companion inventory redesign
- broad narrative validation beyond the inventory/equipment authority boundary

</domain>

<decisions>
## Implementation Decisions

### Runtime Authority
- **D-01:** After campaign creation completes, `items` is the only runtime source of truth for inventory and equipment state for both players and NPCs.
- **D-02:** `characterRecord.loadout` remains a creation/provenance snapshot only. It may seed initial runtime items, but it must not remain a live authority once the campaign starts.
- **D-03:** Legacy `equippedItems` columns become compatibility projection only during migration/deprecation. They must not remain a read authority for live gameplay, prompts, checkpoints, or UI.

### Equipment Semantics
- **D-04:** Equipped-vs-carried state must live on authoritative item rows, not as a second list on the owning character row.
- **D-05:** Equip-state should use structured item metadata rather than free-form prompt tags. The exact schema shape is planner discretion, but the invariant is: possession and equip-state are resolved from the same authoritative row model.
- **D-06:** The same item row model must work for both player and NPC equipment. This phase should not invent separate player-only and NPC-only authority paths.

### Read / Write Contract
- **D-07:** Gameplay tool execution, prompt assembly, world payloads, checkpoints, retry/undo restore, and frontend inventory/equipment surfaces must read runtime state from authoritative item rows only.
- **D-08:** Runtime item mutations must update the authoritative item model directly. Any remaining legacy projections are one-way compatibility outputs, not parallel writes that future readers depend on.
- **D-09:** Fallback logic that reconstructs runtime inventory or equipment from `characterRecord` or `equippedItems` after campaign start is a bug and should be removed or isolated to explicit legacy import/migration paths.

### Migration / Compatibility
- **D-10:** Phase 38 must include a legacy-campaign migration/backfill path so pre-phase campaigns can reconstruct authoritative runtime inventory/equipment from existing seeded data instead of silently loading partial state.
- **D-11:** If temporary compatibility projections are needed for existing APIs or rows, they must be mechanically derived from authoritative items and clearly marked as transitional.
- **D-12:** Planner/executor should bias toward a fail-closed migration path over a silent best-effort path when legacy inventory state is contradictory.

### Scope / Non-Goals
- **D-13:** Keep Phase 38 bounded to inventory/equipment authority. Do not expand it into broader item-balance, shop/economy, or equipment-effect redesign work.
- **D-14:** Tightening obvious backend checks that now depend on authoritative item truth is acceptable if required to preserve authority semantics, but a broader "all inventory narrative validation" program is not the phase goal.

### Self-Critique
- **D-15:** Making `items` authoritative is the cleanest fit with live runtime because gameplay already mutates item rows, but it means legacy creation-era projections must be demoted aggressively or they will keep re-entering through fallback adapters.
- **D-16:** Keeping `characterRecord.loadout` as provenance rather than deleting it preserves auditability and character-creation traceability, but only if all runtime readers stop treating it as live equipment state.
- **D-17:** Encoding equip-state on item rows keeps authority unified, but the schema must stay explicit enough that prompts, UI, and rollback code can query it without heuristics.

### Claude's Discretion
- Exact item-row schema for equipped state.
- Exact deprecation timing for legacy `equippedItems` columns.
- Exact migration mechanics and compatibility projection shape.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Milestone and requirement baseline
- `.planning/ROADMAP.md` — Phase 38 goal and milestone ordering.
- `.planning/REQUIREMENTS.md` — `RINT-04` defines the authority contract this phase must satisfy.
- `.planning/STATE.md` — current milestone focus and sequencing after Phase 44 closure.

### Reconciliation baseline
- `.planning/phases/36-gameplay-docs-to-runtime-reconciliation-audit/36-HANDOFF.md` — Group A item `A5` is the direct source for this phase.
- `.planning/phases/36-gameplay-docs-to-runtime-reconciliation-audit/36-RUNTIME-MATRIX.md` — source claims behind the inventory/equipment authority seam.
- `.planning/phases/44-gameplay-docs-baseline-alignment/44-CLAIM-RESOLUTION.md` — docs were intentionally kept narrow here because runtime authority still belonged to Phase 38.

### Live inventory/equipment code
- `backend/src/db/schema.ts` — players/npcs still carry `characterRecord` and `equippedItems` while `items` stores live ownership/location rows.
- `backend/src/routes/character.ts` — character creation seeds canonical loadout items while also persisting projected character rows.
- `backend/src/character/loadout-deriver.ts` — canonical starting loadout derivation.
- `backend/src/character/record-adapters.ts` — current fallback logic rehydrates runtime inventory/equipment from legacy fields.
- `backend/src/engine/tool-executor.ts` — live inventory mutations already operate against `items.ownerId` / `items.locationId`.
- `backend/src/engine/prompt-assembler.ts` — prompt surfaces that must stop reading mixed inventory projections.
- `backend/src/routes/campaigns.ts` and frontend `/game` world payload consumers — API/UI surfaces that must converge on the same runtime truth.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `backend/src/engine/tool-executor.ts` already uses `items` rows as the live ownership/location mutation path.
- `backend/src/routes/character.ts` already seeds canonical loadout items during campaign creation, so the runtime authority model has a natural bootstrap seam.
- `backend/src/character/loadout-deriver.ts` already separates canonical loadout derivation from later live gameplay mutation.

### Established Problems
- `backend/src/character/record-adapters.ts` still backfills `inventorySeed`, `equippedItemRefs`, and `signatureItems` from legacy `equippedItems`, which reintroduces projection drift after campaign start.
- `backend/src/db/schema.ts` still stores overlapping character-row fields (`characterRecord`, `equippedItems`) beside the `items` table.
- Prompt and API surfaces can still be tempted to read mixed projections instead of a single runtime authority.

### Integration Points
- Player creation and campaign bootstrap
- Runtime item mutation tools
- Prompt assembly for player and NPC context
- Checkpoint / retry / undo restore surfaces
- World payload serialization and `/game` inventory/equipment rendering

</code_context>

<specifics>
## Specific Ideas

- Treat creation-time loadout as seed data and post-creation inventory as runtime state.
- Prefer one-way compatibility projections over dual-write authority.
- Make migration correctness explicit for legacy campaigns instead of assuming fresh-campaign behavior proves the seam is fixed.

</specifics>
