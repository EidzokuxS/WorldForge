# Phase 43: Travel & Location-State Contract Resolution - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-11
**Phase:** 43-travel-and-location-state-contract-resolution
**Areas discussed:** location-model scope, travel contract, per-location recent happenings

---

## Phase Scope

| Option | Description | Selected |
|--------|-------------|----------|
| Narrow patch | Treat travel time and local recent happenings as two isolated doc gaps. | |
| Minimal complete location repair | Widen Phase 43 enough to repair the location model required to make both promises real. | ✓ |
| Full world rewrite | Rebuild locations and world traversal as a broad new foundation. | |

**Discussion basis:** Current roadmap phrasing only names `GSEM-03` and `GSEM-04`, but both claims depend on a stronger location model than the current flat adjacency-only graph.
**Decision notes:** The selected scope corrects an under-planned phase without turning it into an unlimited rewrite.

---

## Location Taxonomy

| Option | Description | Selected |
|--------|-------------|----------|
| Flat graph only | Every place is just the same kind of node. | |
| Macro + sublocation only | Persistent hierarchy, but no temporary scene locations. | |
| Three-class model | `macro location` + `persistent sublocation` + `ephemeral scene location`. | ✓ |

**User direction:** Large world places should exist at world-creation time; smaller districts/buildings/rooms should also be locations; some scene-born places should be temporary and not remain as permanent world nodes.
**Decision notes:** The selected model gives travel and local-state semantics a place to live without requiring a separate engine for each level.

---

## Travel Semantics

| Option | Description | Selected |
|--------|-------------|----------|
| Deprecate travel time | Remove the doc claim and keep instant adjacency movement. | |
| Minimal cost-per-edge | Travel remains real with observable cost/time on top of a graph path. | ✓ |
| Rich transit simulation | Deep pathfinding, route planning, and travel gameplay. | |

**Discussion basis:** `docs/concept.md` explicitly promises “abstract turns based on edge distance,” but current runtime performs instant connected-node moves only.
**Decision notes:** Travel time stays in product scope. Major places should not behave like adjacent teleports; a believable graph path and observable movement cost are required.

---

## Per-Location Recent Happenings

| Option | Description | Selected |
|--------|-------------|----------|
| Deprecate local happenings | Remove the claim and rely only on global chronicle/memory. | |
| Bounded location-local state | Recent happenings exist per location and are visible/usable on revisit without requiring a full rumor simulation. | ✓ |
| Full gossip simulation | Explicit propagation and diffusion of rumors between locations and actors. | |

**Discussion basis:** both `docs/concept.md` and `docs/memory.md` promise local event logs per location, but runtime currently has only global chronicle plus generic episodic memory.
**Decision notes:** The user explicitly does not want another “half-built and forgotten later” subsystem. The chosen option keeps the contract real while leaving room for later sophistication.

---

## Ephemeral Location Cleanup

| Option | Description | Selected |
|--------|-------------|----------|
| Never clean up | Temporary locations stay in the graph forever. | |
| Delete everything | Temporary locations and their effects vanish completely after use. | |
| Node expires, consequences remain | The temporary node can disappear/archive, but events, entity moves, and world consequences remain. | ✓ |

**Discussion basis:** Temporary scene-born spaces are useful, but the world should not accumulate meaningless permanent nodes.
**Decision notes:** This preserves world continuity without polluting the persistent map.

---

## Documentation Interpretation Notes

- `docs/concept.md` and `docs/memory.md` already promise more than a flat list of scene names: they promise graph structure, local event logs, and travel by distance/time.
- The three-class location taxonomy is a product clarification introduced in this discussion, not a direct quote from existing docs.
- Phase 43 therefore needs to reconcile doc-promised behavior with a more explicit runtime model instead of merely patching one missing counter or one UI field.

## Deferred Ideas

- Full rendered map UI or geographic coordinates.
- Rich travel gameplay beyond honest movement cost.
- Systemic rumor propagation simulation.
- Any world-model expansion not directly needed to close the Phase 43 contract.
