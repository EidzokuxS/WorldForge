# Phase 38: Authoritative Inventory & Equipment State - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-12
**Phase:** 38-authoritative-inventory-equipment-state
**Areas discussed:** Runtime authority, equip semantics, compatibility boundary

---

## Runtime Authority

| Option | Description | Selected |
|--------|-------------|----------|
| `items` as sole runtime truth | After campaign start, live inventory/equipment state is read from authoritative item rows only. | ✓ |
| `characterRecord` as sole runtime truth | Keep record/loadout authoritative and treat `items` as projection. | |
| Hybrid authority | Keep multiple live sources and resolve conflicts heuristically. | |

**User answer:** “да, items — единственный runtime truth”
**Notes:** This matches the live mutation path already present in `tool-executor.ts` and removes the least coherent authority split first.

---

## Remaining Gray Areas

The user explicitly delegated the remaining product/technical choices to auto mode: “я думаю, ты это в --auto можешь разобрать”.

### Equipment Semantics

| Option | Description | Selected |
|--------|-------------|----------|
| Equip-state on item rows | Carrying and equipped state are both derived from authoritative item rows. | ✓ |
| Separate owner-row equipped list | Keep a separate `equippedItems` list on players/NPCs. | |
| Prompt-only equipped semantics | Treat equipment as descriptive state without hard runtime structure. | |

**Auto selection rationale:** A second equipped list would immediately recreate dual authority. Prompt-only semantics would not satisfy `RINT-04`.

### Character Record Boundary

| Option | Description | Selected |
|--------|-------------|----------|
| Provenance only | `characterRecord.loadout` stays as seed/history, not live runtime authority. | ✓ |
| Fully live runtime mirror | Keep `characterRecord.loadout` synchronized as a parallel truth. | |
| Remove loadout history entirely | Delete loadout information once runtime items are seeded. | |

**Auto selection rationale:** Provenance is still useful for auditability and character-creation traceability, but not as a second runtime truth.

### Read Contract

| Option | Description | Selected |
|--------|-------------|----------|
| Read authoritative items everywhere | Gameplay, prompts, checkpoints, and UI converge on item rows. | ✓ |
| Mixed fallback reads | Allow runtime reads to fall back to `characterRecord` / `equippedItems`. | |
| Per-surface exceptions | Let prompts or UI keep separate shortcuts while gameplay uses items. | |

**Auto selection rationale:** Allowing mixed reads would preserve the exact seam the phase exists to remove.

### Migration Strategy

| Option | Description | Selected |
|--------|-------------|----------|
| Legacy backfill + transitional projection | Backfill old campaigns onto authoritative items and keep only one-way compatibility outputs temporarily. | ✓ |
| Fresh campaigns only | Do not fix older campaigns. | |
| Silent heuristic merge forever | Accept contradictory legacy state and keep best-effort reconciliation indefinitely. | |

**Auto selection rationale:** Phase 38 must close the seam for real saved campaigns, not only pristine new ones.

---

## the agent's Discretion

- Exact schema for equip-state on authoritative item rows
- Exact migration/backfill mechanics for contradictory legacy campaigns
- Exact projection/deprecation window for `equippedItems`
- Exact API payload shape once all runtime readers switch to authoritative items

## Deferred Ideas

- Broader item economy or balance redesign
- Equipment-bonus/stat-system expansion
- Party inventory redesign
- Universal narrative enforcement for every inventory reference
