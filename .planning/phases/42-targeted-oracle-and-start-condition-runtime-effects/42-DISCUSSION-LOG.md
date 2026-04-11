# Phase 42: Targeted Oracle & Start-Condition Runtime Effects - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-11
**Phase:** 42-targeted-oracle-and-start-condition-runtime-effects
**Areas discussed:** Oracle target scope, start-condition mechanical scope, effect surface

---

## Oracle Target Scope

| Option | Description | Selected |
|--------|-------------|----------|
| NPC-only | Target-aware Oracle applies only to characters/NPCs. | |
| Character + item + location/object | First-class target-aware support for the most practical runtime entity types. | |
| Broad-by-contract, bounded-by-support | Mandatory for `character`, `item`, `location/object`; `faction` only where direct runtime target context already exists; otherwise honest non-targeted fallback. | ✓ |

**Discussion basis:** `docs/mechanics.md` promises Oracle payload fields for `actor tags`, `target tags`, and `environment tags`, but does not narrow `target tags` to characters only.
**Decision notes:** The selected contract stays faithful to the docs without forcing fake support for targets that lack a real resolution path.

---

## Start-Condition Mechanical Scope

| Option | Description | Selected |
|--------|-------------|----------|
| Minimal | Only `startLocationId` and one or two extra fields become mechanics. | |
| Full authored opening-state set | `startLocationId`, `arrivalMode`, `startingVisibility`, `entryPressure`, `companions`, and `immediateSituation` become mechanically relevant. | ✓ |
| Flavor-heavy | Most fields remain prompt-only flavor outside the location itself. | |

**Discussion basis:** live runtime already stores rich `startConditions`, but docs are less explicit about which fields must become mechanics. The discussion narrowed this to the fields most central to early gameplay.
**Decision notes:** `immediateSituation` was explicitly accepted, but only as constrained structured effect input rather than a free-form rule engine.

---

## Mechanical Effect Surface

| Option | Description | Selected |
|--------|-------------|----------|
| Oracle modifiers only | Start conditions only bias rulings. | |
| Scene flags / gating only | Start conditions only shape available actions and opening-state flags. | |
| Combination surface | `scene flags + action gating/unlocking + Oracle modifiers`, with `companions` also contributing runtime presence/context. | ✓ |

**User direction:** “Давай.”
**Decision notes:** The chosen answer keeps start conditions mechanically real in multiple ways without inflating them into a second rules framework.

---

## Documentation Interpretation Notes

- `docs/mechanics.md` clearly establishes `target tags` as part of the Oracle input contract.
- `docs/concept.md` and the richer live character/start-condition pipeline justify making opening-state fields mechanically consequential rather than prompt-only.
- The docs do **not** define an exact target-type taxonomy or one canonical effect surface for start conditions, so those details were product decisions made here for planning.

## Deferred Ideas

- Full faction-targeting semantics if the live action model later proves that faction-directed actions need a broader first-class contract.
- Companion-control mechanics beyond scene presence/context.
- Travel/time or location-event mechanics — Phase 43.
- Docs rewrite/deprecation work — Phase 44.
